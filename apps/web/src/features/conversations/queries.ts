import type { Conversation, ConversationPage, Feedback } from '@keyring/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { ApiError, api } from '../../lib/api';
import { queryKeys } from '../../lib/utils';
import { toast } from '../../stores/toasts';
import {
  findConversationInLists,
  patchConversationInLists,
  patchMessage,
  removeConversationFromLists,
  restoreLists,
  setCachedConversation,
  snapshotLists,
  upsertConversationInLists,
} from './cache';

export function useConversationList(q: string) {
  return useInfiniteQuery({
    queryKey: queryKeys.conversations(q),
    queryFn: ({ pageParam }) => api.listConversations({ cursor: pageParam ?? undefined, q: q || undefined }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: ConversationPage) => last.nextCursor,
  });
}

export function useConversation(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.conversation(id ?? ''),
    queryFn: ({ signal }) => api.getConversation(id!, signal),
    enabled: !!id,
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });
}

export function useModels() {
  return useQuery({ queryKey: queryKeys.models, queryFn: api.getModels, staleTime: 5 * 60_000 });
}

function getConversation(qc: QueryClient, id: string): Conversation | undefined {
  return findConversationInLists(qc, id) ?? qc.getQueryData<{ conversation: Conversation }>(queryKeys.conversation(id))?.conversation;
}

/** Optimistic patch (rename / pin / share) with rollback on failure. */
export function usePatchConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: { title?: string; pinned?: boolean; shared?: boolean } }) =>
      api.patchConversation(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: queryKeys.conversationsAll });
      const lists = snapshotLists(qc);
      const before = getConversation(qc, id);
      if (before) {
        const next = { ...before, ...patch };
        if (patch.pinned !== undefined) upsertConversationInLists(qc, next);
        else patchConversationInLists(qc, id, patch);
        setCachedConversation(qc, next);
      }
      return { lists, before };
    },
    onError: (err, { id }, ctx) => {
      if (ctx) restoreLists(qc, ctx.lists);
      if (ctx?.before) setCachedConversation(qc, ctx.before);
      toast({ title: 'Couldn’t update chat', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
      void qc.invalidateQueries({ queryKey: queryKeys.conversation(id) });
    },
    onSuccess: (conv) => {
      setCachedConversation(qc, conv);
      patchConversationInLists(qc, conv.id, conv);
    },
  });
}

/**
 * Optimistic delete with an Undo toast. The server soft-deletes, so Undo is a
 * real restore (not a delayed request), and works even after the DELETE landed.
 */
export function useDeleteConversation(options: { onDeleted?: (id: string) => void } = {}) {
  const qc = useQueryClient();
  const { onDeleted } = options;
  return useCallback(
    (id: string) => {
      const conversation = getConversation(qc, id);
      const lists = snapshotLists(qc);
      removeConversationFromLists(qc, id);
      onDeleted?.(id);

      const deletion = api.deleteConversation(id).catch((err: unknown) => {
        restoreLists(qc, lists);
        toast({ title: 'Couldn’t delete chat', description: err instanceof Error ? err.message : undefined, tone: 'danger' });
        throw err;
      });

      toast({
        title: 'Chat deleted',
        description: conversation?.title,
        durationMs: 6000,
        action: {
          label: 'Undo',
          onClick: () => {
            if (conversation) upsertConversationInLists(qc, conversation);
            void deletion
              .then(() => api.restoreConversation(id))
              .then((restored) => {
                upsertConversationInLists(qc, restored);
                toast({ title: 'Chat restored', tone: 'success', durationMs: 2500 });
              })
              .catch(() => {
                removeConversationFromLists(qc, id);
              });
          },
        },
      });
      return deletion.catch(() => undefined);
    },
    [qc, onDeleted],
  );
}

export function useSetFeedback(conversationId: string) {
  const qc = useQueryClient();
  return useCallback(
    (messageId: string, feedback: Feedback) => {
      const previous = qc
        .getQueryData<{ messages: { id: string; feedback: Feedback }[] }>(queryKeys.conversation(conversationId))
        ?.messages.find((m) => m.id === messageId)?.feedback;
      patchMessage(qc, conversationId, messageId, { feedback });
      api.patchMessage(messageId, { feedback }).then(
        () => {
          if (feedback) toast({ title: 'Thanks for the feedback', tone: 'success', durationMs: 2000 });
        },
        () => {
          patchMessage(qc, conversationId, messageId, { feedback: previous ?? null });
          toast({ title: 'Couldn’t save feedback', tone: 'danger' });
        },
      );
    },
    [qc, conversationId],
  );
}
