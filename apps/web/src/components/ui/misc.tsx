import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border-strong border-b-2 bg-surface px-1.5 font-mono text-xs text-fg-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Spinner({ className, label = 'Loading' }: { className?: string; label?: string }) {
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox="0 0 24 24"
      className={cn('size-4 animate-spin text-current', className)}
    >
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('kr-skeleton rounded-md', className)} />;
}

export function KeyringLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7', className)}>
      <rect width="32" height="32" rx="9" className="fill-accent" />
      <circle cx="12" cy="13" r="5.5" fill="none" strokeWidth="2.6" className="stroke-accent-fg" />
      <path
        d="M16 17l8 8m-3.2-3.2 2.4-2.4m-5-1 2.4-2.4"
        strokeWidth="2.6"
        strokeLinecap="round"
        className="stroke-accent-fg"
      />
      <circle cx="12" cy="13" r="1.6" className="fill-brass" />
    </svg>
  );
}
