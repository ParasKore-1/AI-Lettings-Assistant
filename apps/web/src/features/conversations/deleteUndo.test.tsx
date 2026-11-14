import type { Conversation, ConversationPage } from '@keyring/shared';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../lib/api';
import { queryKeys } from '../../lib/utils';
import { useToasts } from '../../stores/toasts';
import { groupConversations } from './groupConversations';
import { useDeleteConversation } from './queries';

const conv = (id: string, updatedAt: string, pinned = false): Conversation => ({
  id,
  title: `Chat ${id}`,
  pinned,
  shared: false,
  createdAt: updatedAt,
  updatedAt,
  preview: '',
});

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const data: InfiniteData<ConversationPage, string | null> = {
    pages: [{ items: [conv('a', '2026-11-14T10:00:00.000Z'), conv('b', '2026-11-14T09:00:00.000Z')], nextCursor: null }],
    pageParams: [null],
  };
  qc.setQueryData(queryKeys.conversations(''), data);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  const ids = () =>
    qc.getQueryData<InfiniteData<ConversationPage>>(queryKeys.conversations(''))!.pages.flatMap((p) => p.items.map((c) => c.id));
  return { qc, wrapper, ids };
}

beforeEach(() => {
  useToasts.setState({ toasts: [] });
  vi.restoreAllMocks();
});

describe('optimistic delete with undo', () => {
  it('removes immediately, then Undo restores on the server and in the list', async () => {
    const del = vi.spyOn(api, 'deleteConversation').mockResolvedValue(undefined);
    const restore = vi.spyOn(api, 'restoreConversation').mockResolvedValue(conv('a', '2026-11-14T10:00:00.000Z'));
    const onDeleted = vi.fn();
    const { wrapper, ids } = setup();
    const { result } = renderHook(() => useDeleteConversation({ onDeleted }), { wrapper });

    act(() => void result.current('a'));
    expect(ids()).toEqual(['b']); // optimistic
    expect(onDeleted).toHaveBeenCalledWith('a');
    expect(del).toHaveBeenCalledWith('a');

    const toast = useToasts.getState().toasts.at(-1)!;
    expect(toast.title).toBe('Chat deleted');
    act(() => toast.action!.onClick());
    expect(ids()).toEqual(['a', 'b']); // optimistic undo, in sorted position
    await waitFor(() => expect(restore).toHaveBeenCalledWith('a'));
    expect(ids()).toEqual(['a', 'b']);
  });

  it('rolls back and reports when the server delete fails', async () => {
    vi.spyOn(api, 'deleteConversation').mockRejectedValue(new Error('boom'));
    const { wrapper, ids } = setup();
    const { result } = renderHook(() => useDeleteConversation(), { wrapper });

    await act(async () => {
      await result.current('a');
    });
    expect(ids()).toEqual(['a', 'b']);
    expect(useToasts.getState().toasts.some((t) => t.title === 'Couldn’t delete chat')).toBe(true);
  });
});

describe('groupConversations', () => {
  it('buckets by local calendar day with pinned first', () => {
    const now = new Date(2026, 10, 14, 12, 0);
    const at = (daysAgo: number) => new Date(2026, 10, 14 - daysAgo, 9, 0).toISOString();
    const groups = groupConversations(
      [conv('t', at(0)), conv('y', at(1)), conv('w', at(5)), conv('m', at(20)), conv('o', at(90)), conv('p', at(40), true)],
      now,
    );
    expect(groups.map((g) => [g.label, g.items.map((c) => c.id)])).toEqual([
      ['Pinned', ['p']],
      ['Today', ['t']],
      ['Yesterday', ['y']],
      ['Previous 7 days', ['w']],
      ['Previous 30 days', ['m']],
      ['Older', ['o']],
    ]);
  });
});
