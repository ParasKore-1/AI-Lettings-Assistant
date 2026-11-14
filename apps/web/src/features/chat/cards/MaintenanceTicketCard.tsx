import type { MaintenanceTicket } from '@keyring/shared';
import { Droplets, Flame, Plug, Refrigerator, Wind, Wrench } from 'lucide-react';
import { memo } from 'react';
import { cn, formatDateTime } from '../../../lib/utils';

const CATEGORY = {
  plumbing: { icon: Droplets, label: 'Plumbing' },
  heating: { icon: Flame, label: 'Heating & hot water' },
  electrical: { icon: Plug, label: 'Electrical' },
  'damp-mould': { icon: Wind, label: 'Damp & mould' },
  appliance: { icon: Refrigerator, label: 'Appliance' },
  other: { icon: Wrench, label: 'General' },
} as const;

const PRIORITY: Record<MaintenanceTicket['priority'], string> = {
  emergency: 'bg-danger-soft text-danger border-danger/30',
  high: 'bg-warning-soft text-warning border-warning/30',
  medium: 'bg-accent-soft text-accent-soft-fg border-accent/20',
  low: 'bg-surface-3 text-fg-muted border-border',
};

const STATUS: Record<MaintenanceTicket['status'], string> = {
  open: 'Open',
  scheduled: 'Contractor scheduled',
  resolved: 'Resolved',
};

export const MaintenanceTicketCard = memo(function MaintenanceTicketCard({ ticket }: { ticket: MaintenanceTicket }) {
  const { icon: Icon, label } = CATEGORY[ticket.category];
  return (
    <article
      aria-label={`Maintenance ticket ${ticket.reference}: ${ticket.title}`}
      className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <header className="flex items-start gap-3 border-b border-border p-4">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-soft-fg">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-fg-subtle">{ticket.reference}</span>
            <span className={cn('rounded-full border px-2 py-px text-[0.7rem] font-semibold capitalize', PRIORITY[ticket.priority])}>
              {ticket.priority}
              <span className="sr-only"> priority</span>
            </span>
          </div>
          <h3 className="mt-0.5 text-sm font-semibold">{ticket.title}</h3>
          <p className="text-xs text-fg-muted">
            {label} · {ticket.address}
          </p>
        </div>
      </header>
      <dl className="grid gap-3 p-4 text-sm sm:grid-cols-[8rem_1fr]">
        <dt className="text-fg-subtle">Status</dt>
        <dd className="flex items-center gap-2 font-medium">
          <span
            aria-hidden="true"
            className={cn('size-2 rounded-full', ticket.status === 'resolved' ? 'bg-success' : ticket.status === 'scheduled' ? 'bg-accent' : 'bg-warning')}
          />
          {STATUS[ticket.status]}
        </dd>
        <dt className="text-fg-subtle">Reported</dt>
        <dd>
          <time dateTime={ticket.createdAt}>{formatDateTime(ticket.createdAt)}</time>
        </dd>
        <dt className="text-fg-subtle">Details</dt>
        <dd className="text-fg-muted">{ticket.description}</dd>
        <dt className="text-fg-subtle">Next step</dt>
        <dd>{ticket.nextStep}</dd>
      </dl>
    </article>
  );
});
