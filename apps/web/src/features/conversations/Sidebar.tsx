import { Keyboard, MessageSquarePlus, PanelLeftClose, Search, Settings, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useMatch, useNavigate } from 'react-router-dom';
import { Button, IconButton } from '../../components/ui/Button';
import { KeyringLogo, Skeleton, Spinner } from '../../components/ui/misc';
import { cn, modKey } from '../../lib/utils';
import { useUi } from '../../stores/ui';
import { useStreamStore } from '../chat/stream/streamStore';
import { ConversationListItem } from './ConversationListItem';
import { groupConversations } from './groupConversations';
import { useConversationList, useDeleteConversation, usePatchConversation } from './queries';

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function Sidebar({ variant, onClose }: { variant: 'static' | 'drawer'; onClose?: () => void }) {
  const navigate = useNavigate();
  const activeMatch = useMatch('/c/:id');
  const activeId = activeMatch?.params.id;
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const list = useConversationList(q);
  const patch = usePatchConversation();
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const searchFocusTick = useUi((s) => s.searchFocusTick);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const setShortcutsOpen = useUi((s) => s.setShortcutsOpen);
  const setSettingsOpen = useUi((s) => s.setSettingsOpen);
  const streamingIds = useStreamStore((s) =>
    Object.entries(s.streams)
      .filter(([, v]) => v.phase === 'sending' || v.phase === 'streaming')
      .map(([k]) => k)
      .join(','),
  );

  const remove = useDeleteConversation({
    onDeleted: (id) => {
      if (id === activeId) navigate('/', { replace: true });
    },
  });

  useEffect(() => {
    if (searchFocusTick > 0) {
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  }, [searchFocusTick]);

  const items = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);
  const deferredItems = useDeferredValue(items);
  const groups = useMemo(() => groupConversations(deferredItems), [deferredItems]);
  const streamingSet = useMemo(() => new Set(streamingIds.split(',').filter(Boolean)), [streamingIds]);

  // Infinite scroll: load the next page when the sentinel becomes visible.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = list;
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !isFetchingNextPage) void fetchNextPage();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const closeIfDrawer = variant === 'drawer' ? onClose : undefined;

  return (
    <nav aria-label="Chats" className="flex h-full w-full flex-col bg-surface-2">
      <div className="flex items-center gap-2 px-3 pt-[calc(0.75rem+env(safe-area-inset-top))] pb-2">
        <Link to="/" onClick={closeIfDrawer} className="flex items-center gap-2 rounded-lg px-1 py-1" aria-label="Keyring home">
          <KeyringLogo className="size-7" />
          <span className="text-[1.05rem] font-semibold tracking-tight">Keyring</span>
        </Link>
        <span className="flex-1" />
        {variant === 'static' ? (
          <IconButton label="Collapse sidebar" tooltipSide="bottom" onClick={toggleSidebar}>
            <PanelLeftClose className="size-4" />
          </IconButton>
        ) : (
          <IconButton label="Close menu" tooltip={false} onClick={onClose}>
            <X className="size-4" />
          </IconButton>
        )}
      </div>

      <div className="space-y-2 px-3 pb-3">
        <Button
          variant="outline"
          className="w-full justify-start"
          leading={<MessageSquarePlus className="size-4" aria-hidden="true" />}
          onClick={() => {
            navigate('/');
            useUi.getState().focusComposer();
            closeIfDrawer?.();
          }}
        >
          New chat
          <span className="ml-auto text-xs font-normal text-fg-subtle [@media(hover:none)]:hidden">{modKey()} ⇧ O</span>
        </Button>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden="true" />
          <label htmlFor="kr-search" className="sr-only">
            Search chats
          </label>
          <input
            id="kr-search"
            ref={searchRef}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) {
                e.stopPropagation();
                setSearch('');
              }
            }}
            placeholder="Search chats"
            className="h-9 w-full rounded-lg border border-border bg-surface pr-14 pl-9 text-sm outline-none placeholder:text-fg-subtle focus:border-border-strong"
          />
          <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-fg-subtle [@media(hover:none)]:hidden">
            {list.isFetching && q ? <Spinner className="size-3.5" /> : `${modKey()} K`}
          </span>
        </div>
      </div>

      <div className="kr-scroll min-h-0 flex-1 overflow-y-auto pb-4">
        {list.isPending ? (
          <div className="space-y-2 px-4 pt-2" aria-label="Loading chats">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : list.isError ? (
          <div className="px-4 pt-4 text-sm text-fg-muted">
            <p>Couldn’t load your chats.</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => void list.refetch()}>
              Try again
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <p className="px-5 pt-4 text-sm text-fg-subtle">{q ? `No chats match “${q}”.` : 'No chats yet — start one above.'}</p>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-label={group.label} className="mb-3">
              <h2 className="px-5 pt-2 pb-1 text-xs font-medium text-fg-subtle">{group.label}</h2>
              <ul>
                {group.items.map((c) => (
                  <ConversationListItem
                    key={c.id}
                    conversation={c}
                    streaming={streamingSet.has(c.id)}
                    onNavigate={closeIfDrawer}
                    onRename={(id, title) => patch.mutate({ id, patch: { title } })}
                    onTogglePin={(id, pinned) => patch.mutate({ id, patch: { pinned } })}
                    onDelete={(id) => void remove(id)}
                  />
                ))}
              </ul>
            </section>
          ))
        )}
        <div ref={sentinelRef} className="h-px" />
        {list.isFetchingNextPage && (
          <div className="flex justify-center py-2">
            <Spinner />
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 border-t border-border px-3 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="sm" leading={<Settings className="size-4" aria-hidden="true" />} onClick={() => setSettingsOpen(true)}>
          Settings
        </Button>
        <span className="flex-1" />
        <IconButton label="Keyboard shortcuts" shortcut="?" onClick={() => setShortcutsOpen(true)}>
          <Keyboard className="size-4" />
        </IconButton>
      </div>
    </nav>
  );
}

export function SidebarDrawer() {
  const open = useUi((s) => s.drawerOpen);
  const setOpen = useUi((s) => s.setDrawerOpen);
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  // React 18 has no inert prop: set it on the element so the closed drawer is unreachable.
  useEffect(() => {
    if (panelRef.current) panelRef.current.inert = !open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const main = document.getElementById('kr-main');
    if (main) main.inert = true;
    requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('a, button, input')?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      if (main) main.inert = false;
      window.removeEventListener('keydown', onKey);
      returnFocus.current?.focus?.();
    };
  }, [open, setOpen]);

  return (
    <div className={cn('fixed inset-0 z-40 lg:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        role="presentation"
        className={cn('absolute inset-0 bg-overlay transition-opacity duration-200', open ? 'opacity-100' : 'opacity-0')}
        onClick={() => setOpen(false)}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Chats menu"
        className={cn(
          'absolute inset-y-0 left-0 w-[min(20rem,86vw)] shadow-pop transition-transform duration-250 ease-out',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar variant="drawer" onClose={() => setOpen(false)} />
      </div>
    </div>
  );
}
