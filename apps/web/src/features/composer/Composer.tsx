import { ATTACHMENT_MIME_TYPES, MESSAGE_MAX_CHARS, type Attachment } from '@keyring/shared';
import { ArrowUp, Paperclip, Square } from 'lucide-react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react';
import { IconButton } from '../../components/ui/Button';
import { cn } from '../../lib/utils';
import { useDrafts } from '../../stores/drafts';
import { useUi } from '../../stores/ui';
import { AttachmentChip } from './AttachmentChip';
import { useAttachmentQueue } from './attachments';
import { matchSlashCommands, type SlashCommand } from './slashCommands';

export interface ComposerHandle {
  focus: () => void;
  addFiles: (files: File[]) => void;
  setText: (text: string) => void;
}

export interface ComposerProps {
  draftKey: string;
  onSend: (text: string, attachments: Attachment[]) => void;
  onStop: () => void;
  streaming: boolean;
  /** Blocks sending (e.g. offline) while still allowing typing. */
  sendBlockedReason?: string | null;
  placeholder?: string;
  autoFocus?: boolean;
  maxHeight?: number;
}

const COUNTER_THRESHOLD = Math.floor(MESSAGE_MAX_CHARS * 0.8);

/**
 * Chat input: auto-growing textarea, Enter to send / Shift+Enter for newline
 * (IME-safe), slash-command menu, attachments, per-conversation drafts and a
 * Stop button that replaces Send while a reply streams.
 */
export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { draftKey, onSend, onStop, streaming, sendBlockedReason = null, placeholder = 'Ask Keyring anything about renting…', autoFocus = false, maxHeight = 220 },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const draft = useDrafts((s) => s.drafts[draftKey] ?? '');
  const setDraft = useDrafts((s) => s.setDraft);
  const [value, setValue] = useState(draft);
  const attachments = useAttachmentQueue();
  const composing = useRef(false);
  const compositionEndedAt = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [menuDismissed, setMenuDismissed] = useState(false);
  const listboxId = useId();
  const hintId = useId();
  const composerFocusTick = useUi((s) => s.composerFocusTick);

  // Switching conversations loads that conversation's draft.
  useEffect(() => {
    setValue(useDrafts.getState().drafts[draftKey] ?? '');
    setMenuDismissed(false);
  }, [draftKey]);

  useEffect(() => {
    if (composerFocusTick > 0) textareaRef.current?.focus();
  }, [composerFocusTick]);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [maxHeight]);

  useLayoutEffect(resize, [value, resize]);

  const update = (text: string) => {
    setValue(text);
    setDraft(draftKey, text);
    setMenuDismissed(false);
    setActiveIndex(0);
  };

  useImperativeHandle(
    ref,
    () => ({
      focus: () => textareaRef.current?.focus(),
      addFiles: (files) => attachments.add(files),
      setText: (text) => {
        update(text);
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(text.length, text.length);
        });
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attachments.add, draftKey],
  );

  const commands = menuDismissed ? null : matchSlashCommands(value);
  const menuOpen = !!commands && commands.length > 0;
  const trimmed = value.trim();
  const tooLong = value.length > MESSAGE_MAX_CHARS;
  const hasFailedUpload = attachments.items.some((i) => i.status === 'error');
  const canSend =
    !streaming && !!trimmed && !tooLong && !attachments.uploading && !hasFailedUpload && !sendBlockedReason;

  const send = () => {
    if (!canSend) return;
    onSend(trimmed, attachments.ready);
    update('');
    attachments.clear();
    textareaRef.current?.focus(); // focus stays in the composer after sending
  };

  const applyCommand = (cmd: SlashCommand) => {
    update(cmd.template);
    setMenuDismissed(true);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      el?.focus();
      el?.setSelectionRange(cmd.template.length, cmd.template.length);
    });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME: never treat Enter as "send" while composing (CJK input etc.). Safari fires
    // keydown(Enter) right after compositionend, hence the short grace period too.
    const imeActive =
      composing.current ||
      e.nativeEvent.isComposing ||
      e.keyCode === 229 ||
      performance.now() - compositionEndedAt.current < 50;

    if (menuOpen && commands) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % commands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + commands.length) % commands.length);
        return;
      }
      if ((e.key === 'Enter' || e.key === 'Tab') && !imeActive) {
        e.preventDefault();
        const cmd = commands[activeIndex] ?? commands[0];
        if (cmd) applyCommand(cmd);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setMenuDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !imeActive) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === 'Escape' && streaming) {
      e.preventDefault();
      onStop();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files);
    if (files.length > 0) {
      e.preventDefault();
      attachments.add(files);
    }
  };

  const activeId = menuOpen && commands?.[activeIndex] ? `${listboxId}-${activeIndex}` : undefined;

  return (
    <div className="relative">
      {menuOpen && commands && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Slash commands"
          className="absolute inset-x-0 bottom-full mb-2 animate-fade-in overflow-hidden rounded-2xl border border-border bg-elevated p-1.5 shadow-pop"
        >
          {commands.map((cmd, i) => (
            <li
              key={cmd.command}
              id={`${listboxId}-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyCommand(cmd)}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                'flex cursor-pointer items-baseline gap-3 rounded-xl px-3 py-2 text-sm',
                i === activeIndex && 'bg-surface-3',
              )}
            >
              <span className="font-mono font-medium text-accent">{cmd.command}</span>
              <span className="truncate text-fg-muted">{cmd.description}</span>
            </li>
          ))}
        </ul>
      )}

      <div
        className={cn(
          'rounded-[1.6rem] border bg-surface shadow-card transition-colors',
          'focus-within:border-border-strong',
          tooLong ? 'border-danger/60' : 'border-border',
        )}
      >
        {attachments.items.length > 0 && (
          <ul className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments to send">
            {attachments.items.map((item) => (
              <li key={item.localId}>
                <AttachmentChip {...item} onRemove={() => attachments.remove(item.localId)} />
              </li>
            ))}
          </ul>
        )}
        <label htmlFor={`${hintId}-input`} className="sr-only">
          Message Keyring
        </label>
        <textarea
          id={`${hintId}-input`}
          ref={textareaRef}
          value={value}
          rows={1}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-describedby={hintId}
          aria-autocomplete="list"
          aria-controls={menuOpen ? listboxId : undefined}
          aria-activedescendant={activeId}
          aria-invalid={tooLong || undefined}
          enterKeyHint="send"
          onChange={(e) => update(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
            compositionEndedAt.current = performance.now();
          }}
          className="kr-scroll block max-h-[40vh] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[0.975rem] leading-relaxed text-fg outline-none placeholder:text-fg-subtle"
        />
        <div className="flex items-center gap-2 px-2.5 pt-1 pb-2.5">
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            accept={ATTACHMENT_MIME_TYPES.join(',')}
            onChange={(e) => {
              attachments.add(Array.from(e.target.files ?? []));
              e.target.value = '';
            }}
          />
          <IconButton label="Attach images or PDFs" onClick={() => fileRef.current?.click()}>
            <Paperclip className="size-4" />
          </IconButton>
          <p id={hintId} className="hidden min-w-0 flex-1 truncate text-xs text-fg-subtle sm:block">
            {sendBlockedReason ??
              (streaming ? 'Press Esc to stop' : 'Enter to send · Shift + Enter for a new line · / for commands')}
          </p>
          <span className="flex-1 sm:hidden" />
          {value.length >= COUNTER_THRESHOLD && (
            <span
              className={cn('text-xs tabular-nums', tooLong ? 'font-semibold text-danger' : 'text-fg-subtle')}
              aria-live="polite"
            >
              {value.length.toLocaleString('en-GB')} / {MESSAGE_MAX_CHARS.toLocaleString('en-GB')}
              {tooLong && <span className="sr-only"> — message is too long</span>}
            </span>
          )}
          {streaming ? (
            <IconButton label="Stop generating" shortcut="Esc" variant="primary" size="md" className="rounded-full" onClick={onStop}>
              <Square className="size-3.5 fill-current" />
            </IconButton>
          ) : (
            <IconButton
              label={attachments.uploading ? 'Waiting for uploads' : 'Send message'}
              shortcut="Enter"
              variant="primary"
              size="md"
              className="rounded-full"
              disabled={!canSend}
              onClick={send}
            >
              <ArrowUp className="size-4.5" strokeWidth={2.5} />
            </IconButton>
          )}
        </div>
      </div>
    </div>
  );
});
