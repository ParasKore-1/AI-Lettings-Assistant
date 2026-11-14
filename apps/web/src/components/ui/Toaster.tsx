import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '../../lib/utils';
import { useToasts, type Toast } from '../../stores/toasts';

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => clearTimeout(t);
  }, [toast.id, toast.durationMs, dismiss]);

  const Icon = toast.tone === 'success' ? CheckCircle2 : toast.tone === 'danger' ? TriangleAlert : Info;
  return (
    <div
      className={cn(
        'pointer-events-auto flex w-[min(92vw,26rem)] animate-rise-in items-start gap-3 rounded-xl border border-border bg-elevated px-4 py-3 shadow-pop',
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn(
          'mt-0.5 size-4 shrink-0',
          toast.tone === 'success' && 'text-success',
          toast.tone === 'danger' && 'text-danger',
          toast.tone === 'neutral' && 'text-fg-subtle',
        )}
      />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{toast.title}</p>
        {toast.description && <p className="mt-0.5 text-fg-muted">{toast.description}</p>}
      </div>
      {toast.action && (
        <button
          type="button"
          className="-my-1 rounded-lg px-2.5 py-1 text-sm font-semibold text-accent hover:bg-accent-soft"
          onClick={() => {
            toast.action?.onClick();
            dismiss(toast.id);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss notification"
        className="-my-0.5 -mr-1 rounded-md p-1 text-fg-subtle hover:bg-surface-3 hover:text-fg"
        onClick={() => dismiss(toast.id)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
