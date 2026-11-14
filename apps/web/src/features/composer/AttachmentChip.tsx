import { FileText, RotateCw, TriangleAlert, X } from 'lucide-react';
import { cn, formatBytes } from '../../lib/utils';

export interface AttachmentChipProps {
  name: string;
  size: number;
  mimeType: string;
  previewUrl: string | null;
  progress: number;
  status: 'uploading' | 'done' | 'error';
  error?: string | null;
  onRemove?: () => void;
}

export function AttachmentChip({ name, size, mimeType, previewUrl, progress, status, error, onRemove }: AttachmentChipProps) {
  const isImage = mimeType.startsWith('image/');
  const pct = Math.round(progress * 100);
  return (
    <div
      className={cn(
        'relative flex h-14 max-w-60 items-center gap-2.5 overflow-hidden rounded-xl border bg-surface pr-8 pl-1.5',
        status === 'error' ? 'border-danger/50' : 'border-border',
      )}
    >
      <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-surface-3">
        {isImage && previewUrl ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center">
            <FileText className="size-5 text-danger" aria-hidden="true" />
          </div>
        )}
        {status === 'uploading' && (
          <div className="absolute inset-0 grid place-items-center bg-overlay/60">
            <RotateCw className="size-4 animate-spin text-white" aria-hidden="true" />
          </div>
        )}
      </div>
      <div className="min-w-0 text-xs">
        <p className="truncate font-medium text-fg" title={name}>
          {name}
        </p>
        {status === 'error' ? (
          <p className="flex items-center gap-1 truncate text-danger">
            <TriangleAlert className="size-3" aria-hidden="true" />
            {error ?? 'Upload failed'}
          </p>
        ) : status === 'uploading' ? (
          <p className="text-fg-subtle tabular-nums">Uploading… {pct}%</p>
        ) : (
          <p className="text-fg-subtle">{formatBytes(size)}</p>
        )}
      </div>
      {status === 'uploading' && (
        <div
          role="progressbar"
          aria-label={`Uploading ${name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-3"
        >
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="absolute top-1 right-1 rounded-md p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
