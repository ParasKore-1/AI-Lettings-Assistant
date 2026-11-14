import { Outlet, useMatch } from 'react-router-dom';
import { useGlobalShortcuts } from '../../hooks/useGlobalShortcuts';
import { cn } from '../../lib/utils';
import { useUi } from '../../stores/ui';
import { OfflineBanner } from '../chat/messages/StatusViews';
import { useAnnouncer } from '../chat/stream/streamStore';
import { useConversation } from '../conversations/queries';
import { Sidebar, SidebarDrawer } from '../conversations/Sidebar';
import { SettingsDialog, ShortcutsDialog } from '../settings/Dialogs';
import { Header } from './Header';

/** Screen-reader live region: announces completed replies, never individual tokens. */
function ReplyAnnouncer() {
  const messages = useAnnouncer((s) => s.messages);
  return (
    <div role="log" aria-live="polite" aria-atomic="false" className="sr-only">
      {messages.map((m) => (
        <p key={m.id}>{m.text}</p>
      ))}
    </div>
  );
}

export function AppShell() {
  useGlobalShortcuts();
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const match = useMatch('/c/:id');
  const conversation = useConversation(match?.params.id);

  return (
    <div className="flex h-full overflow-hidden">
      <a
        href="#kr-main"
        className="sr-only-focusable fixed top-2 left-2 z-[70] rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg"
      >
        Skip to chat
      </a>
      <aside
        className={cn(
          'hidden shrink-0 border-r border-border transition-[width] duration-200 lg:block',
          collapsed ? 'w-0 overflow-hidden border-r-0' : 'w-72',
        )}
      >
        {!collapsed && <Sidebar variant="static" />}
      </aside>
      <SidebarDrawer />
      <main id="kr-main" className="flex min-w-0 flex-1 flex-col" tabIndex={-1}>
        <Header conversation={match ? (conversation.data?.conversation ?? null) : null} />
        <OfflineBanner />
        <Outlet />
      </main>
      <SettingsDialog />
      <ShortcutsDialog />
      <ReplyAnnouncer />
    </div>
  );
}
