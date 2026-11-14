import { Clock3, RotateCcw, TriangleAlert, WifiOff } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useOnline } from '../../../hooks/useOnline';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';

export function TypingIndicator({ label = 'Keyring is thinking' }: { label?: string }) {
  return (
    <div className="flex h-7 items-center gap-1" role="status" aria-label={label}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden="true"
          className="size-1.5 animate-dot rounded-full bg-fg-subtle"
          style={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </div>
  );
}

function useCountdown(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until || until <= Date.now()) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [until]);
  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

export type ErrorTone = 'danger' | 'warning' | 'offline';

export function ErrorBanner({
  title,
  description,
  tone = 'danger',
  retryAt = null,
  onRetry,
  retryLabel = 'Retry',
  secondary,
  className,
}: {
  title: string;
  description?: string | undefined;
  tone?: ErrorTone;
  retryAt?: number | null;
  onRetry?: (() => void) | undefined;
  retryLabel?: string;
  secondary?: ReactNode;
  className?: string;
}) {
  const seconds = useCountdown(retryAt);
  const Icon = tone === 'offline' ? WifiOff : tone === 'warning' ? Clock3 : TriangleAlert;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-xl border px-3.5 py-3 text-sm',
        tone === 'danger' && 'border-danger/30 bg-danger-soft',
        tone !== 'danger' && 'border-warning/30 bg-warning-soft',
        className,
      )}
    >
      <Icon
        aria-hidden="true"
        className={cn('mt-0.5 size-4 shrink-0', tone === 'danger' ? 'text-danger' : 'text-warning')}
      />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{title}</p>
        {description && <p className="mt-0.5 text-fg-muted">{description}</p>}
      </div>
      <div className="flex items-center gap-2">
        {secondary}
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={seconds > 0}
            leading={<RotateCcw className="size-3.5" aria-hidden="true" />}
          >
            {seconds > 0 ? `${retryLabel} in ${seconds}s` : retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-sm"
    >
      <WifiOff className="size-4 text-warning" aria-hidden="true" />
      <span>
        You’re offline. Messages will send once you reconnect.
      </span>
    </div>
  );
}

