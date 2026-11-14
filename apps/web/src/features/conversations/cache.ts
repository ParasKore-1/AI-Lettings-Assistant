import type { Conversation, ConversationPage, ConversationWithMessages, Message } from '@keyring/shared';
import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../../lib/utils';

type ListData = InfiniteData<ConversationPage, string | null>;

function isUnfiltered(key: readonly unknown[]): boolean {
  const params = key[1] as { q?: string } | undefined;
  return !params?.q;
}

function sortKey(c: Conversation): [number, string] {
  return [c.pinned ? 1 : 0, c.updatedAt];
}

function insertSorted(items: Conversation[], conv: Conversation): Conversation[] {
  const [p, u] = sortKey(conv);
  const idx = items.findIndex((x) => {
    const [xp, xu] = sortKey(x);
    return xp < p || (xp === p && xu <= u);
  });
  const out = [...items];
  out.splice(idx === -1 ? out.length : idx, 0, conv);
  return out;
}

/**
 * Upserts a conversation into every cached list. Unfiltered lists keep the
 * server's ordering (pinned first, then most recently updated).
 */
export function upsertConversationInLists(qc: QueryClient, conv: Conversation) {
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: queryKeys.conversationsAll })) {
    if (!data) continue;
    const exists = data.pages.some((p) => p.items.some((c) => c.id === conv.id));
    if (!exists && !isUnfiltered(key)) continue;
    const pages = data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== conv.id) }));
    const first = pages[0];
    if (!first) continue;
    pages[0] = { ...first, items: insertSorted(first.items, conv) };
    qc.setQueryData<ListData>(key, { ...data, pages });
  }
}

export function patchConversationInLists(qc: QueryClient, id: string, patch: Partial<Conversation>) {
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: queryKeys.conversationsAll })) {
    if (!data) continue;
    qc.setQueryData<ListData>(key, {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        items: p.items.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    });
  }
}

export function removeConversationFromLists(qc: QueryClient, id: string) {
  for (const [key, data] of qc.getQueriesData<ListData>({ queryKey: queryKeys.conversationsAll })) {
    if (!data) continue;
    qc.setQueryData<ListData>(key, {
      ...data,
      pages: data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== id) })),
    });
  }
}

export function findConversationInLists(qc: QueryClient, id: string): Conversation | undefined {
  for (const [, data] of qc.getQueriesData<ListData>({ queryKey: queryKeys.conversationsAll })) {
    const found = data?.pages.flatMap((p) => p.items).find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

/** Snapshot of all list caches, for rolling back an optimistic update. */
export function snapshotLists(qc: QueryClient) {
  return qc.getQueriesData<ListData>({ queryKey: queryKeys.conversationsAll });
}

export function restoreLists(qc: QueryClient, snapshot: ReturnType<typeof snapshotLists>) {
  for (const [key, data] of snapshot) qc.setQueryData(key, data);
}

/** Inserts or replaces messages in a cached conversation (by id). */
export function upsertMessages(qc: QueryClient, conversationId: string, messages: Message[]) {
  qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(conversationId), (old) => {
    if (!old) return old;
    const byId = new Map(old.messages.map((m) => [m.id, m] as const));
    for (const m of messages) byId.set(m.id, m);
    const merged = [...byId.values()].sort((a, b) =>
      a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
    );
    return { ...old, messages: merged };
  });
}

export function patchMessage(qc: QueryClient, conversationId: string, messageId: string, patch: Partial<Message>) {
  qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(conversationId), (old) => {
    if (!old) return old;
    return { ...old, messages: old.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)) };
  });
}

export function getCachedMessage(qc: QueryClient, conversationId: string, messageId: string): Message | undefined {
  return qc
    .getQueryData<ConversationWithMessages>(queryKeys.conversation(conversationId))
    ?.messages.find((m) => m.id === messageId);
}

export function setCachedConversation(qc: QueryClient, conversation: Conversation) {
  qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(conversation.id), (old) =>
    old ? { ...old, conversation } : old,
  );
}
