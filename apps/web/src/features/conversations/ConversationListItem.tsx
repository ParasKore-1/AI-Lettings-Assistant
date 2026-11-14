import type { Conversation } from '@keyring/shared';
import { MoreHorizontal, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';
import { memo, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Menu } from '../../components/ui/Menu';
import { cn } from '../../lib/utils';

export const ConversationListItem = memo(function ConversationListItem({
  conversation,
  streaming = false,
  onRename,
  onTogglePin,
  onDelete,
  onNavigate,
}: {
  conversation: Conversation;
  streaming?: boolean;
  onRename: (id: string, title: string) => void;
  onTogglePin: (id: string, pinned: boolean) => void;
  onDelete: (id: string) => void;
  onNavigate?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(conversation.title);
  const inputRef = useRef<HTMLInputElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(conversation.title);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editing, conversation.title]);

  const commit = () => {
    const title = draft.trim();
    setEditing(false);
    if (title && title !== conversation.title) onRename(conversation.id, title.slice(0, 120));
    requestAnimationFrame(() => linkRef.current?.focus());
  };

  if (editing) {
    return (
      <li className="px-2">
        <label className="sr-only" htmlFor={`rename-${conversation.id}`}>
          Rename chat
        </label>
        <input
          id={`rename-${conversation.id}`}
          ref={inputRef}
          value={draft}
          maxLength={120}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              setEditing(false);
              requestAnimationFrame(() => linkRef.current?.focus());
            }
          }}
          className="h-9 w-full rounded-lg border border-accent bg-surface px-2.5 text-sm outline-none"
        />
      </li>
    );
  }

  return (
    <li className="group/item relative px-2">
      <NavLink
        ref={linkRef}
        to={`/c/${conversation.id}`}
        onClick={onNavigate}
        title={conversation.title}
        className={({ isActive }) =>
          cn(
            'flex h-9 items-center gap-2 rounded-lg pr-9 pl-2.5 text-sm transition-colors',
            isActive ? 'bg-surface-3 font-medium text-fg' : 'text-fg-muted hover:bg-surface-3/70 hover:text-fg',
          )
        }
        onKeyDown={(e) => {
          if (e.key === 'F2') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        {conversation.pinned && <Pin className="size-3 shrink-0 -rotate-45 text-brass" aria-label="Pinned" />}
        <span className="truncate">{conversation.title}</span>
        {streaming && <span className="ml-auto size-1.5 shrink-0 animate-pulse rounded-full bg-accent" aria-label="Replying" />}
      </NavLink>
      <div className="absolute top-1/2 right-3 -translate-y-1/2 opacity-100 sm:opacity-0 sm:group-focus-within/item:opacity-100 sm:group-hover/item:opacity-100 [&:has([aria-expanded=true])]:opacity-100">
        <Menu
          label={`Options for ${conversation.title}`}
          align="end"
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`Options for ${conversation.title}`}
              className="grid size-7 place-items-center rounded-md text-fg-subtle hover:bg-border hover:text-fg"
            >
              <MoreHorizontal className="size-4" />
            </button>
          )}
          sections={[
            {
              items: [
                { id: 'rename', label: 'Rename', icon: <Pencil />, onSelect: () => setEditing(true) },
                {
                  id: 'pin',
                  label: conversation.pinned ? 'Unpin' : 'Pin',
                  icon: conversation.pinned ? <PinOff /> : <Pin />,
                  onSelect: () => onTogglePin(conversation.id, !conversation.pinned),
                },
              ],
            },
            {
              items: [
                { id: 'delete', label: 'Delete', icon: <Trash2 />, danger: true, onSelect: () => onDelete(conversation.id) },
              ],
            },
          ]}
        />
      </div>
    </li>
  );
});
