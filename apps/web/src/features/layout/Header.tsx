import type { Conversation, DebugMode, ResponseMode } from '@keyring/shared';
import {
  Bug,
  Check,
  ChevronDown,
  Copy,
  Keyboard,
  Link2,
  Menu as MenuIcon,
  Monitor,
  Moon,
  MoreHorizontal,
  PanelLeftOpen,
  Settings,
  Share,
  Sun,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Menu, type MenuSection } from '../../components/ui/Menu';
import { api } from '../../lib/api';
import { cn, copyText } from '../../lib/utils';
import { useSettings } from '../../stores/settings';
import { toast } from '../../stores/toasts';
import { useUi } from '../../stores/ui';
import { useModels, usePatchConversation } from '../conversations/queries';

const MODES: { value: ResponseMode; label: string; description: string }[] = [
  { value: 'fast', label: 'Fast', description: 'Quicker, shorter answers' },
  { value: 'balanced', label: 'Balanced', description: 'Good default for most questions' },
  { value: 'thorough', label: 'Thorough', description: 'More reasoning on tricky questions' },
];

export function ModelPicker() {
  const models = useModels();
  const { model, mode, setModel, setMode } = useSettings();
  const list = models.data?.models ?? [];
  const current = list.find((m) => m.id === model) ?? list.find((m) => m.id === models.data?.defaultModel);
  const sections: MenuSection[] = [
    {
      label: 'Model',
      items: list.map((m) => ({
        id: m.id,
        label: m.label,
        description: m.description,
        checked: m.id === current?.id,
        onSelect: () => setModel(m.id),
      })),
    },
    {
      label: 'Response style',
      items: MODES.map((m) => ({
        id: m.value,
        label: m.label,
        description: m.description,
        checked: m.value === mode,
        onSelect: () => setMode(m.value),
      })),
    },
  ];
  return (
    <Menu
      label="Model and response style"
      align="start"
      sections={sections}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          className="inline-flex h-9 max-w-[52vw] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-fg hover:bg-surface-3"
        >
          <span className="truncate">{current?.label ?? 'Keyring'}</span>
          <span className="hidden text-fg-subtle sm:inline">· {MODES.find((m) => m.value === mode)?.label}</span>
          <ChevronDown className="size-4 shrink-0 text-fg-subtle" aria-hidden="true" />
        </button>
      )}
    />
  );
}

function EditableTitle({ conversation }: { conversation: Conversation }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(conversation.title);
  const patch = usePatchConversation();
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!editing) setValue(conversation.title);
  }, [conversation.title, editing]);

  const commit = () => {
    setEditing(false);
    const title = value.trim();
    if (title && title !== conversation.title) patch.mutate({ id: conversation.id, patch: { title } });
    requestAnimationFrame(() => buttonRef.current?.focus());
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        autoFocus
        aria-label="Chat title"
        value={value}
        maxLength={120}
        onFocus={(e) => e.currentTarget.select()}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setValue(conversation.title);
            setEditing(false);
          }
        }}
        className="h-9 w-full max-w-md min-w-0 rounded-lg border border-accent bg-surface px-2.5 text-sm font-medium outline-none"
      />
    );
  }
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => setEditing(true)}
      title="Rename chat"
      className="h-9 max-w-md min-w-0 truncate rounded-lg px-2.5 text-left text-sm font-medium text-fg hover:bg-surface-3"
    >
      <span className="sr-only">Chat title: </span>
      {conversation.title}
    </button>
  );
}

function ShareDialog({ conversation, open, onClose }: { conversation: Conversation; open: boolean; onClose: () => void }) {
  const patch = usePatchConversation();
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/share/${conversation.id}`;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Share this chat"
      description="Anyone with the link can read the conversation. They can’t reply or see your other chats."
    >
      <label className="flex items-center justify-between gap-4 rounded-xl border border-border p-3.5">
        <span>
          <span className="block text-sm font-medium">Public read-only link</span>
          <span className="block text-xs text-fg-subtle">{conversation.shared ? 'On — link is active' : 'Off'}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label="Public read-only link"
          checked={conversation.shared}
          onChange={(e) => patch.mutate({ id: conversation.id, patch: { shared: e.target.checked } })}
          className="peer sr-only"
        />
        <span
          aria-hidden="true"
          className="relative h-6 w-11 shrink-0 rounded-full bg-border-strong transition-colors peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
        />
      </label>
      <div className={cn('mt-4 flex gap-2', !conversation.shared && 'pointer-events-none opacity-50')} aria-disabled={!conversation.shared}>
        <label htmlFor="kr-share-url" className="sr-only">
          Share link
        </label>
        <input
          id="kr-share-url"
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="h-10 min-w-0 flex-1 rounded-xl border border-border bg-surface-2 px-3 font-mono text-xs"
        />
        <Button
          disabled={!conversation.shared}
          leading={copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          onClick={async () => {
            setCopied(await copyText(url));
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </Dialog>
  );
}

const DEBUG_MODES: { mode: DebugMode; label: string; description: string }[] = [
  { mode: 'slow', label: 'Slow stream', description: 'Tokens arrive slowly' },
  { mode: 'fail_mid_stream', label: 'Drop connection mid-reply', description: 'Network error with partial text' },
  { mode: 'provider_error', label: 'Provider error mid-reply', description: 'Server sends an error event' },
  { mode: 'server_error', label: 'Server error (500)', description: 'Request fails before streaming' },
  { mode: 'rate_limit', label: 'Rate limit (429)', description: 'Shows the retry countdown' },
];

export function Header({ conversation }: { conversation: Conversation | null }) {
  const setDrawerOpen = useUi((s) => s.setDrawerOpen);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const { theme, setTheme } = useSettings();
  const models = useModels();
  const [shareOpen, setShareOpen] = useState(false);

  const sections: MenuSection[] = [
    {
      label: 'Theme',
      items: [
        { id: 'system', label: 'System', icon: <Monitor />, checked: theme === 'system', onSelect: () => setTheme('system') },
        { id: 'light', label: 'Light', icon: <Sun />, checked: theme === 'light', onSelect: () => setTheme('light') },
        { id: 'dark', label: 'Dark', icon: <Moon />, checked: theme === 'dark', onSelect: () => setTheme('dark') },
      ],
    },
    {
      items: [
        { id: 'settings', label: 'Settings', icon: <Settings />, onSelect: () => useUi.getState().setSettingsOpen(true) },
        { id: 'shortcuts', label: 'Keyboard shortcuts', icon: <Keyboard />, onSelect: () => useUi.getState().setShortcutsOpen(true) },
        ...(conversation
          ? [{ id: 'share', label: 'Share chat', icon: <Link2 />, onSelect: () => setShareOpen(true) }]
          : []),
      ],
    },
    ...(models.data?.debugEnabled
      ? [
          {
            label: 'Simulate on next reply (demo)',
            items: DEBUG_MODES.map((d) => ({
              id: d.mode,
              label: d.label,
              description: d.description,
              icon: <Bug />,
              onSelect: () =>
                void api
                  .setDebug({ mode: d.mode, once: true })
                  .then(() => toast({ title: `Next reply: ${d.label.toLowerCase()}`, durationMs: 2500 }))
                  .catch(() => toast({ title: 'Debug endpoint unavailable', tone: 'danger' })),
            })),
          },
        ]
      : []),
  ];

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border bg-bg/85 px-2 pt-[env(safe-area-inset-top)] backdrop-blur sm:px-3">
      <IconButton label="Open chats menu" className="lg:hidden" tooltip={false} onClick={() => setDrawerOpen(true)}>
        <MenuIcon className="size-5" />
      </IconButton>
      {collapsed && (
        <IconButton label="Expand sidebar" tooltipSide="bottom" className="hidden lg:inline-flex" onClick={toggleSidebar}>
          <PanelLeftOpen className="size-4" />
        </IconButton>
      )}
      <ModelPicker />
      {conversation && (
        <>
          <span className="hidden h-5 w-px bg-border sm:block" aria-hidden="true" />
          <div className="hidden min-w-0 flex-1 sm:block">
            <EditableTitle conversation={conversation} />
          </div>
        </>
      )}
      <span className="flex-1 sm:hidden" />
      {!conversation && <span className="hidden flex-1 sm:block" />}
      {conversation && (
        <Button
          variant="ghost"
          size="sm"
          className="hidden sm:inline-flex"
          leading={<Share className="size-4" aria-hidden="true" />}
          onClick={() => setShareOpen(true)}
        >
          Share
        </Button>
      )}
      <Menu
        label="More options"
        sections={sections}
        trigger={(props) => (
          <button
            {...props}
            type="button"
            aria-label="More options"
            className="grid size-9 place-items-center rounded-lg text-fg-muted hover:bg-surface-3 hover:text-fg"
          >
            <MoreHorizontal className="size-5" />
          </button>
        )}
      />
      {conversation && <ShareDialog conversation={conversation} open={shareOpen} onClose={() => setShareOpen(false)} />}
    </header>
  );
}
