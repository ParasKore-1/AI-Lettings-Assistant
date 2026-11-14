import type { Message } from '@keyring/shared';
import { indexChildren, parentKey } from '@keyring/shared';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ArrowDown } from 'lucide-react';
import { forwardRef, useImperativeHandle, useMemo, useRef, type ReactNode } from 'react';
import { cn } from '../../../lib/utils';
import { useStickToBottom } from '../scroll/useStickToBottom';
import { MessageRow } from './MessageBubble';

export type ListRow =
  | { key: string; type: 'message'; message: Message }
  | { key: string; type: 'custom'; render: () => ReactNode; estimate: number };

export interface MessageListHandle {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

/**
 * Virtualised conversation (TanStack Virtual, dynamic row heights). Rows are
 * measured with ResizeObserver; while the user is pinned to the bottom the
 * list follows growth, otherwise their scroll position is preserved and a
 * "Jump to latest" button appears.
 */
export const MessageList = forwardRef<
  MessageListHandle,
  {
    conversationId: string;
    messages: readonly Message[];
    thread: readonly Message[];
    extraRows?: ListRow[];
    streaming: boolean;
    canEdit: boolean;
    footer?: ReactNode;
    className?: string;
  }
>(function MessageList({ conversationId, messages, thread, extraRows = [], streaming, canEdit, footer, className }, ref) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const children = useMemo(() => indexChildren(messages), [messages]);

  const rows = useMemo<ListRow[]>(
    () => [...thread.map((m): ListRow => ({ key: m.id, type: 'message', message: m })), ...extraRows],
    [thread, extraRows],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => {
      const row = rows[i];
      if (!row) return 120;
      if (row.type === 'custom') return row.estimate;
      return row.message.role === 'user' ? 72 : Math.min(900, 80 + row.message.content.length * 0.35);
    },
    getItemKey: (i) => rows[i]?.key ?? i,
    overscan: 6,
    paddingStart: 24,
    paddingEnd: 32,
  });

  const { pinned, scrollToBottom } = useStickToBottom(scrollRef, contentRef, conversationId);
  useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

  const items = virtualizer.getVirtualItems();

  return (
    <div className={cn('relative min-h-0 flex-1', className)}>
      <div
        ref={scrollRef}
        role="log"
        aria-label="Conversation"
        // Visible list is not live (virtualisation re-mounts rows while scrolling);
        // completed replies are announced via the dedicated live region instead.
        aria-live="off"
        aria-busy={streaming || undefined}
        // A scrollable region must be keyboard-focusable (WCAG 2.1.1), even though role=log is non-interactive.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
        tabIndex={0}
        className="kr-scroll h-full overflow-y-auto overscroll-contain [overflow-anchor:none] focus-visible:outline-offset-[-2px]"
      >
        <div ref={contentRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            return (
              <div
                key={item.key}
                data-index={item.index}
                ref={virtualizer.measureElement}
                className="group/row absolute top-0 left-0 w-full"
                style={{ transform: `translateY(${item.start}px)` }}
              >
                <div className="mx-auto w-full max-w-3xl px-4 pb-6 sm:px-6">
                  {row.type === 'message' ? (
                    <MessageRow
                      message={row.message}
                      {...siblingPosition(children, row.message)}
                      canEdit={canEdit}
                    />
                  ) : (
                    row.render()
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {footer}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-3 flex justify-center transition-all duration-200',
          pinned ? 'translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
        )}
      >
        <button
          type="button"
          tabIndex={pinned ? -1 : 0}
          aria-hidden={pinned}
          onClick={() => scrollToBottom('smooth')}
          className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border bg-elevated px-3.5 py-1.5 text-sm font-medium shadow-pop hover:bg-surface-2"
        >
          <ArrowDown className="size-4" aria-hidden="true" />
          Jump to latest
          {streaming && <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
});

function siblingPosition(children: Map<string, Message[]>, message: Message) {
  const list = children.get(parentKey(message.parentId));
  if (!list || list.length < 2) return { siblingIndex: 0, siblingTotal: 1 };
  return { siblingIndex: Math.max(0, list.findIndex((m) => m.id === message.id)), siblingTotal: list.length };
}
