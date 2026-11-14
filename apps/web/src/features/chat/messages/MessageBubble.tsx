import type { Attachment, Message, ToolResult } from '@keyring/shared';
import { FileText, PlayCircle, Square } from 'lucide-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { KeyringLogo } from '../../../components/ui/misc';
import { apiUrl } from '../../../env';
import { countRender } from '../../../lib/profiling';
import { cn, formatBytes } from '../../../lib/utils';
import { ToolResultView, type ToolResultActions } from '../cards/ToolResultView';
import { Markdown } from '../markdown/LazyMarkdown';
import { useStreamAssistantId, useStreamError, useStreamText, useStreamToolResults } from '../stream/streamStore';
import { useChatActions } from './ChatActionsContext';
import { AssistantActions, BranchSwitcher, UserActions } from './MessageActions';
import { buildSegments } from './segments';
import { ErrorBanner, TypingIndicator } from './StatusViews';

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

export function MessageAttachments({ attachments, align = 'end' }: { attachments: Attachment[]; align?: 'start' | 'end' }) {
  if (attachments.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap gap-2', align === 'end' && 'justify-end')} aria-label="Attachments">
      {attachments.map((a) => (
        <li key={a.id}>
          <a
            href={apiUrl(a.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="group/att flex items-center gap-2 overflow-hidden rounded-xl border border-border bg-surface text-sm hover:border-border-strong"
          >
            {a.mimeType.startsWith('image/') ? (
              <img src={apiUrl(a.url)} alt={a.name} className="size-16 object-cover" loading="lazy" />
            ) : (
              <span className="flex items-center gap-2 px-3 py-2">
                <FileText className="size-5 text-danger" aria-hidden="true" />
                <span className="max-w-40 truncate font-medium">{a.name}</span>
                <span className="text-xs text-fg-subtle">{formatBytes(a.size)}</span>
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Avatar() {
  return (
    <div className="mt-0.5 shrink-0" aria-hidden="true">
      <KeyringLogo className="size-7" />
    </div>
  );
}

/** Text + inline cards; used for both final and streaming replies. */
function ReplySegments({
  text,
  toolResults,
  streaming,
  actions,
}: {
  text: string;
  toolResults: readonly ToolResult[];
  streaming: boolean;
  actions: ToolResultActions | undefined;
}) {
  const segments = useMemo(() => buildSegments(text, toolResults), [text, toolResults]);
  const last = segments[segments.length - 1];
  return (
    <div className="space-y-3">
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <div key={seg.key} className={cn(streaming && i === segments.length - 1 && 'kr-streaming')}>
            <Markdown text={seg.text} streaming={streaming && i === segments.length - 1} />
          </div>
        ) : (
          <div key={seg.key} className="animate-rise-in">
            <ToolResultView result={seg.result} actions={actions} />
          </div>
        ),
      )}
      {streaming && (!last || last.kind === 'tool') && <TypingIndicator />}
    </div>
  );
}

function useCardActions(): ToolResultActions | undefined {
  const { readOnly, sendFollowUp } = useChatActions();
  return useMemo(
    () =>
      readOnly
        ? undefined
        : {
            onBookViewing: (p) => sendFollowUp(`Book a viewing for ${p.address}`),
            onConfirmSlot: (slot, title) => {
              const when = new Date(slot.start).toLocaleString('en-GB', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Europe/London',
              });
              sendFollowUp(`Please request the viewing on ${when} for ${title}.`);
            },
          },
    [readOnly, sendFollowUp],
  );
}

/* ------------------------------------------------------------------ */
/* Assistant                                                           */
/* ------------------------------------------------------------------ */

/** The only component that subscribes to per-frame stream text. */
function StreamingReply({ conversationId }: { conversationId: string }) {
  countRender('streaming-body');
  const text = useStreamText(conversationId);
  const toolResults = useStreamToolResults(conversationId);
  const actions = useCardActions();
  if (!text && toolResults.length === 0) return <TypingIndicator />;
  return <ReplySegments text={text} toolResults={toolResults} streaming actions={actions} />;
}

function StaticReply({ message }: { message: Message }) {
  const actions = useCardActions();
  if (!message.content && message.toolResults.length === 0) return null;
  return <ReplySegments text={message.content} toolResults={message.toolResults} streaming={false} actions={actions} />;
}

function AssistantStatus({ message }: { message: Message }) {
  const { retry, resume, conversationId, readOnly } = useChatActions();
  const streamError = useStreamError(conversationId);
  if (readOnly) return null;

  if (message.status === 'stopped') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-fg-muted">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-0.5 text-xs font-medium">
          <Square className="size-2.5 fill-current" aria-hidden="true" /> Stopped
        </span>
        <Button
          size="sm"
          variant="ghost"
          leading={<PlayCircle className="size-3.5" aria-hidden="true" />}
          onClick={() => resume(message.id)}
        >
          Continue
        </Button>
      </div>
    );
  }
  if (message.status !== 'error') return null;

  const kind = streamError?.kind ?? message.error?.code;
  const isRate = kind === 'rate_limited';
  const title =
    kind === 'offline'
      ? 'You went offline mid-reply'
      : kind === 'network' || kind === 'interrupted'
        ? 'Connection lost mid-reply'
        : isRate
          ? 'Rate limited'
          : 'The reply failed';
  return (
    <ErrorBanner
      tone={kind === 'offline' ? 'offline' : isRate ? 'warning' : 'danger'}
      title={title}
      description={`${streamError?.message ?? message.error?.message ?? 'Something went wrong.'} The partial reply is kept — retrying continues where it stopped.`}
      retryAt={streamError?.retryAt ?? null}
      onRetry={() => (streamError ? retry() : resume(message.id))}
    />
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  message,
  siblingIndex,
  siblingTotal,
}: {
  message: Message;
  siblingIndex: number;
  siblingTotal: number;
}) {
  countRender(`row:${message.id}`);
  const { conversationId, regenerate, setFeedback, stepSibling, readOnly } = useChatActions();
  const activeId = useStreamAssistantId(conversationId);
  // Only the reply this tab is actually streaming renders live. A row the server still
  // reports as 'streaming' (stale fetch, another tab, crash) renders statically as stopped.
  const streaming = message.status === 'streaming' && activeId === message.id;
  const shown = message.status === 'streaming' && !streaming ? { ...message, status: 'stopped' as const } : message;

  return (
    <article
      aria-label="Keyring"
      aria-busy={streaming || undefined}
      className="group/msg flex gap-3 sm:gap-4"
    >
      <Avatar />
      <div className="min-w-0 flex-1 space-y-2.5 pt-0.5">
        {streaming && !readOnly ? <StreamingReply conversationId={conversationId} /> : <StaticReply message={shown} />}
        <AssistantStatus message={shown} />
        {!streaming && (
          <div className="flex flex-wrap items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-focus-within/msg:opacity-100 sm:group-hover/msg:opacity-100 sm:group-last/row:opacity-100">
            <BranchSwitcher
              index={siblingIndex}
              total={siblingTotal}
              label="Response"
              onPrev={() => stepSibling(message, -1)}
              onNext={() => stepSibling(message, 1)}
            />
            <AssistantActions
              content={message.content}
              feedback={message.feedback}
              createdAt={message.createdAt}
              readOnly={readOnly}
              canRegenerate={!!message.parentId}
              onRegenerate={() => message.parentId && regenerate(message.parentId)}
              onFeedback={(f) => setFeedback(message.id, f)}
            />
          </div>
        )}
      </div>
    </article>
  );
});

/* ------------------------------------------------------------------ */
/* User                                                                */
/* ------------------------------------------------------------------ */

function EditBox({
  initial,
  onCancel,
  onSubmit,
}: {
  initial: string;
  onCancel: () => void;
  onSubmit: (text: string) => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [value]);
  const trimmed = value.trim();
  return (
    <form
      className="w-full max-w-[42rem] rounded-2xl border border-border-strong bg-surface p-2 shadow-card"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) onSubmit(trimmed);
      }}
    >
      <label className="sr-only" htmlFor="kr-edit-box">
        Edit your message
      </label>
      <textarea
        id="kr-edit-box"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
          } else if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (trimmed) onSubmit(trimmed);
          }
        }}
        rows={2}
        className="kr-scroll block w-full resize-none bg-transparent px-2 py-1.5 text-[0.975rem] outline-none"
      />
      <div className="mt-1 flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" type="submit" disabled={!trimmed || trimmed === initial.trim()}>
          Save &amp; send
        </Button>
      </div>
    </form>
  );
}

export const UserMessage = memo(function UserMessage({
  message,
  siblingIndex,
  siblingTotal,
  canEdit,
}: {
  message: Message;
  siblingIndex: number;
  siblingTotal: number;
  canEdit: boolean;
}) {
  countRender(`row:${message.id}`);
  const { editAndResend, stepSibling, readOnly } = useChatActions();
  const [editing, setEditing] = useState(false);

  return (
    <article aria-label="You" className="group/msg flex flex-col items-end gap-1.5">
      <MessageAttachments attachments={message.attachments} />
      {editing ? (
        <EditBox
          initial={message.content}
          onCancel={() => setEditing(false)}
          onSubmit={(text) => {
            setEditing(false);
            editAndResend(message, text);
          }}
        />
      ) : (
        <div className="max-w-[min(42rem,88%)] rounded-[var(--radius-bubble)] rounded-br-md bg-user px-4 py-2.5 text-[0.975rem] leading-relaxed whitespace-pre-wrap text-user-fg [overflow-wrap:anywhere]">
          {message.content}
        </div>
      )}
      {!editing && (
        <div className="flex items-center gap-1 sm:opacity-0 sm:transition-opacity sm:group-focus-within/msg:opacity-100 sm:group-hover/msg:opacity-100">
          <BranchSwitcher
            index={siblingIndex}
            total={siblingTotal}
            label="Edit"
            onPrev={() => stepSibling(message, -1)}
            onNext={() => stepSibling(message, 1)}
          />
          <UserActions
            content={message.content}
            createdAt={message.createdAt}
            readOnly={readOnly}
            canEdit={canEdit}
            onEdit={() => setEditing(true)}
          />
        </div>
      )}
    </article>
  );
});

/** Optimistic user message shown before the server confirms it (or if sending failed). */
export function PendingUserMessage({ content, attachments }: { content: string; attachments: Attachment[] }) {
  return (
    <article aria-label="You (sending)" className="flex flex-col items-end gap-1.5">
      <MessageAttachments attachments={attachments} />
      <div className="max-w-[min(42rem,88%)] rounded-[var(--radius-bubble)] rounded-br-md bg-user px-4 py-2.5 text-[0.975rem] leading-relaxed whitespace-pre-wrap text-user-fg opacity-80 [overflow-wrap:anywhere]">
        {content}
      </div>
    </article>
  );
}

export function SystemNotice({ children }: { children: React.ReactNode }) {
  return (
    <div role="note" className="mx-auto w-fit max-w-full rounded-full bg-surface-3 px-3 py-1 text-center text-xs text-fg-muted">
      {children}
    </div>
  );
}

/** Dispatches on role. Memoised: re-renders only when its own message changes. */
export const MessageRow = memo(function MessageRow({
  message,
  siblingIndex,
  siblingTotal,
  canEdit,
}: {
  message: Message;
  siblingIndex: number;
  siblingTotal: number;
  canEdit: boolean;
}) {
  switch (message.role) {
    case 'user':
      return <UserMessage message={message} siblingIndex={siblingIndex} siblingTotal={siblingTotal} canEdit={canEdit} />;
    case 'assistant':
      return <AssistantMessage message={message} siblingIndex={siblingIndex} siblingTotal={siblingTotal} />;
    case 'system':
      return <SystemNotice>{message.content}</SystemNotice>;
  }
});
