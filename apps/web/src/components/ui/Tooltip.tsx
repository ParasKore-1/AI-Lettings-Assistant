import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

/**
 * Lightweight hover/focus tooltip. Purely visual: the trigger already carries
 * an aria-label, so the tooltip is aria-hidden to avoid double announcements.
 */
export function Tooltip({
  label,
  shortcut,
  side = 'top',
  children,
}: {
  label: string;
  shortcut?: string | undefined;
  side?: 'top' | 'bottom' | 'right';
  children: ReactNode;
}) {
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute z-50 hidden rounded-md bg-fg px-2 py-1 text-xs font-medium whitespace-nowrap text-bg shadow-pop',
          'group-hover/tt:block group-has-[:focus-visible]/tt:block [@media(hover:none)]:!hidden',
          side === 'top' && 'bottom-full left-1/2 mb-1.5 -translate-x-1/2',
          side === 'bottom' && 'top-full left-1/2 mt-1.5 -translate-x-1/2',
          side === 'right' && 'top-1/2 left-full ml-1.5 -translate-y-1/2',
        )}
      >
        {label}
        {shortcut && <span className="ml-1.5 opacity-70">{shortcut}</span>}
      </span>
    </span>
  );
}
