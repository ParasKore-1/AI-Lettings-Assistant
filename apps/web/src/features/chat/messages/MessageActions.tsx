import type { Feedback } from '@keyring/shared';
import { Check, ChevronLeft, ChevronRight, Copy, Pencil, RefreshCw, ThumbsDown, ThumbsUp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '../../../components/ui/Button';
import { cn, copyText, formatDateTime, formatTime } from '../../../lib/utils';

export function CopyButton({ text, label = 'Copy message' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <IconButton label={copied ? 'Copied' : label} size="xs" onClick={async () => setCopied(await copyText(text))}>
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
    </IconButton>
  );
}

export function BranchSwitcher({
  index,
  total,
  onPrev,
  onNext,
  label,
}: {
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  label: string;
}) {
  if (total < 2) return null;
  return (
    <div className="flex items-center text-xs text-fg-subtle" role="group" aria-label={label}>
      <IconButton label={`Previous ${label.toLowerCase()}`} size="xs" onClick={onPrev} disabled={index === 0} tooltip={false}>
        <ChevronLeft className="size-3.5" />
      </IconButton>
      <span className="min-w-8 text-center tabular-nums" aria-live="polite">
        {index + 1} / {total}
      </span>
      <IconButton
        label={`Next ${label.toLowerCase()}`}
        size="xs"
        onClick={onNext}
        disabled={index === total - 1}
        tooltip={false}
      >
        <ChevronRight className="size-3.5" />
      </IconButton>
    </div>
  );
}

export function Timestamp({ iso, className }: { iso: string; className?: string }) {
  return (
    <time dateTime={iso} title={formatDateTime(iso)} className={cn('text-xs text-fg-subtle tabular-nums', className)}>
      {formatTime(iso)}
    </time>
  );
}

export function AssistantActions({
  content,
  feedback,
  createdAt,
  canRegenerate,
  onRegenerate,
  onFeedback,
  readOnly,
}: {
  content: string;
  feedback: Feedback;
  createdAt: string;
  canRegenerate: boolean;
  onRegenerate: () => void;
  onFeedback: (f: Feedback) => void;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <CopyButton text={content} />
      {!readOnly && (
        <>
          <IconButton label="Regenerate reply" size="xs" onClick={onRegenerate} disabled={!canRegenerate}>
            <RefreshCw className="size-3.5" />
          </IconButton>
          <IconButton
            label="Good response"
            size="xs"
            aria-pressed={feedback === 'up'}
            className={cn(feedback === 'up' && 'text-accent')}
            onClick={() => onFeedback(feedback === 'up' ? null : 'up')}
          >
            <ThumbsUp className={cn('size-3.5', feedback === 'up' && 'fill-current')} />
          </IconButton>
          <IconButton
            label="Bad response"
            size="xs"
            aria-pressed={feedback === 'down'}
            className={cn(feedback === 'down' && 'text-danger')}
            onClick={() => onFeedback(feedback === 'down' ? null : 'down')}
          >
            <ThumbsDown className={cn('size-3.5', feedback === 'down' && 'fill-current')} />
          </IconButton>
        </>
      )}
      <Timestamp iso={createdAt} className="ml-1.5 opacity-0 transition-opacity group-focus-within/msg:opacity-100 group-hover/msg:opacity-100" />
    </div>
  );
}

export function UserActions({
  content,
  createdAt,
  onEdit,
  canEdit,
  readOnly,
}: {
  content: string;
  createdAt: string;
  onEdit: () => void;
  canEdit: boolean;
  readOnly: boolean;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Timestamp iso={createdAt} className="mr-1.5" />
      <CopyButton text={content} />
      {!readOnly && (
        <IconButton label="Edit message" size="xs" onClick={onEdit} disabled={!canEdit}>
          <Pencil className="size-3.5" />
        </IconButton>
      )}
    </div>
  );
}
