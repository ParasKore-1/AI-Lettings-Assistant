import { buildThread, indexChildren, parentKey, type Attachment, type ConversationWithMessages, type Message } from '@keyring/shared';
import { useQueryClient } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { KeyringLogo, Skeleton } from '../../components/ui/misc';
import { ApiError } from '../../lib/api';
import { newClientId, queryKeys } from '../../lib/utils';
import { useBranches, useBranchSelections } from '../../stores/branches';
import { NEW_CHAT_DRAFT, useDrafts } from '../../stores/drafts';
import { Composer, type ComposerHandle } from '../composer/Composer';
import { upsertConversationInLists } from '../conversations/cache';
import { useConversation, useSetFeedback } from '../conversations/queries';
import { EmptyState } from './EmptyState';
import { ChatActionsContext, type ChatRowActions } from './messages/ChatActionsContext';
import { PendingUserMessage } from './messages/MessageBubble';
import { MessageList, type ListRow, type MessageListHandle } from './messages/MessageList';
import { useOnline } from '../../hooks/useOnline';
import { ErrorBanner, TypingIndicator } from './messages/StatusViews';
import { usePendingUser, useStreamAssistantId, useStreamStore } from './stream/streamStore';
import { useChatStream } from './stream/useChatStream';

const EMPTY: Message[] = [];

/**
 * One screen for both "/" (new chat) and "/c/:id". For a new chat the id is
 * generated client-side, so the conversation can be inserted optimistically
 * and the URL updated before the server has responded.
 */
export function ChatScreen({ conversationId }: { conversationId?: string | undefined }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [draftId] = useState(() => newClientId('c'));
  const isNew = !conversationId;
  const id = conversationId ?? draftId;

  const query = useConversation(conversationId);
  const chat = useChatStream(id);
  const pendingUser = usePendingUser(id);
  const streamAssistantId = useStreamAssistantId(id);
  const selections = useBranchSelections(id);
  const online = useOnline();
  const composerRef = useRef<ComposerHandle>(null);
  const listRef = useRef<MessageListHandle>(null);
  const [dragging, setDragging] = useState(false);

  const messages = query.data?.messages ?? EMPTY;
  const thread = useMemo(() => buildThread(messages, selections), [messages, selections]);
  const children = useMemo(() => indexChildren(messages), [messages]);

  // Refs let stable callbacks read the latest tree without re-creating themselves.
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const childrenRef = useRef(children);
  childrenRef.current = children;

  const busy = chat.phase === 'sending' || chat.phase === 'streaming';
  // Stable callbacks (the chat object itself changes with phase).
  const { send: chatSend, regenerate, resume, retry, editAndResend } = chat;

  const send = useCallback(
    (text: string, attachments: Attachment[] = []) => {
      if (isNew) {
        const now = new Date().toISOString();
        const conversation = { id, title: 'New chat', pinned: false, shared: false, createdAt: now, updatedAt: now, preview: text };
        qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(id), { conversation, messages: [] });
        upsertConversationInLists(qc, conversation);
        useDrafts.getState().clearDraft(NEW_CHAT_DRAFT);
        navigate(`/c/${id}`);
        void chatSend(text, { attachments, parentId: null, ensureConversation: true });
        return;
      }
      const leaf = threadRef.current[threadRef.current.length - 1];
      void chatSend(text, { attachments, parentId: leaf?.id ?? null });
      requestAnimationFrame(() => listRef.current?.scrollToBottom('smooth'));
    },
    [isNew, id, qc, navigate, chatSend],
  );

  const setFeedback = useSetFeedback(id);
  const actions = useMemo<ChatRowActions>(
    () => ({
      conversationId: id,
      readOnly: false,
      regenerate: (userMessageId) => void regenerate(userMessageId),
      resume: (assistantId) => void resume(assistantId),
      retry: () => void retry(),
      editAndResend: (message, content) => void editAndResend(message, content),
      stepSibling: (message, delta) => {
        const list = childrenRef.current.get(parentKey(message.parentId)) ?? [];
        const idx = list.findIndex((m) => m.id === message.id);
        const next = list[idx + delta];
        if (next) useBranches.getState().select(id, parentKey(message.parentId), next.id);
      },
      setFeedback,
      sendFollowUp: (text) => {
        if (useStreamStore.getState().streams[id]?.phase === 'streaming') return;
        send(text);
      },
    }),
    [id, regenerate, resume, retry, editAndResend, setFeedback, send],
  );

  // Esc stops a streaming reply from anywhere (unless a dialog/menu handles it first).
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('dialog[open], [role="menu"]')) return;
      chat.stop();
      composerRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, chat]);

  useEffect(() => {
    const title = query.data?.conversation.title;
    document.title = title && !isNew ? `${title} · Keyring` : 'Keyring — lettings assistant';
  }, [query.data?.conversation.title, isNew]);

  // Rows that aren't persisted messages yet: optimistic user message, typing dots, send errors.
  const extraRows = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];
    if (pendingUser) {
      rows.push({
        key: 'pending-user',
        type: 'custom',
        estimate: 72,
        render: () => <PendingUserMessage content={pendingUser.content} attachments={pendingUser.attachments} />,
      });
    }
    if (chat.phase === 'sending' && !streamAssistantId) {
      rows.push({
        key: 'pending-reply',
        type: 'custom',
        estimate: 48,
        render: () => (
          <div className="flex gap-3 sm:gap-4">
            <KeyringLogo className="size-7 shrink-0" />
            <TypingIndicator />
          </div>
        ),
      });
    }
    if (chat.phase === 'error' && !streamAssistantId && chat.error) {
      const e = chat.error;
      rows.push({
        key: 'send-error',
        type: 'custom',
        estimate: 80,
        render: () => (
          <ErrorBanner
            tone={e.kind === 'rate_limited' ? 'warning' : e.kind === 'offline' ? 'offline' : 'danger'}
            title={
              e.kind === 'rate_limited'
                ? 'Slow down a little'
                : e.kind === 'server'
                  ? 'Keyring had a problem'
                  : e.kind === 'offline'
                    ? 'You’re offline'
                    : 'Message not sent'
            }
            description={e.message}
            retryAt={e.retryAt}
            onRetry={e.retryable ? () => void chat.retry() : undefined}
            secondary={
              <Button size="sm" variant="ghost" onClick={chat.discardPending}>
                Discard
              </Button>
            }
          />
        ),
      });
    }
    return rows;
  }, [pendingUser, chat, streamAssistantId]);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) composerRef.current?.addFiles(files);
  };

  const notFound = query.error instanceof ApiError && query.error.status === 404 && !busy;
  const showEmpty = isNew && !pendingUser && chat.phase === 'idle';

  return (
    <ChatActionsContext.Provider value={actions}>
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragEnter={(e) => {
          if (e.dataTransfer.types.includes('Files')) setDragging(true);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
        }}
        onDrop={onDrop}
      >
        {notFound ? (
          <div className="mx-auto max-w-md px-6 pt-[18vh] text-center">
            <h1 className="text-xl font-semibold">Chat not found</h1>
            <p className="mt-2 text-fg-muted">It may have been deleted, or the link is wrong.</p>
            <Button className="mt-5" onClick={() => navigate('/')}>
              Start a new chat
            </Button>
          </div>
        ) : showEmpty ? (
          <div className="kr-scroll min-h-0 flex-1 overflow-y-auto">
            <EmptyState onPick={(prompt) => send(prompt)} />
          </div>
        ) : query.isPending && !isNew && messages.length === 0 && !pendingUser ? (
          <MessagesSkeleton />
        ) : (
          <MessageList
            ref={listRef}
            conversationId={id}
            messages={messages}
            thread={thread}
            extraRows={extraRows}
            streaming={busy}
            canEdit={!busy}
          />
        )}

        {!notFound && (
          <div className="mx-auto w-full max-w-3xl px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-5">
            <Composer
              ref={composerRef}
              draftKey={isNew ? NEW_CHAT_DRAFT : id}
              streaming={busy}
              autoFocus={!('ontouchstart' in window)}
              sendBlockedReason={online ? null : 'You’re offline — reconnect to send.'}
              onSend={(text, attachments) => send(text, attachments)}
              onStop={() => {
                chat.stop();
                composerRef.current?.focus();
              }}
            />
          </div>
        )}

        {dragging && (
          <div className="pointer-events-none absolute inset-2 z-30 grid place-items-center rounded-3xl border-2 border-dashed border-accent bg-accent-soft/85">
            <div className="flex flex-col items-center gap-2 text-accent-soft-fg">
              <Upload className="size-8" aria-hidden="true" />
              <p className="font-semibold">Drop images or PDFs to attach</p>
            </div>
          </div>
        )}
      </div>
    </ChatActionsContext.Provider>
  );
}

function MessagesSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 pt-8 sm:px-6" aria-label="Loading conversation" role="status">
      <Skeleton className="ml-auto h-11 w-2/5 rounded-2xl" />
      <div className="flex gap-4">
        <Skeleton className="size-7 shrink-0 rounded-lg" />
        <div className="flex-1 space-y-2.5">
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <Skeleton className="ml-auto h-11 w-1/3 rounded-2xl" />
    </div>
  );
}
