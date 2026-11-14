import type { ViewingSlot } from '@keyring/shared';
import { CalendarCheck2, Clock } from 'lucide-react';
import { memo, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/utils';

/** Viewings happen at UK properties, so times are always shown in UK time, whatever the viewer's timezone. */
export const UK_TZ = 'Europe/London';
const dayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: UK_TZ });
const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: UK_TZ });

/**
 * Radio group of viewing times (WAI-ARIA radio pattern with roving tabindex):
 * arrow keys move between available slots, Space/Enter selects.
 */
export const ViewingSlotPicker = memo(function ViewingSlotPicker({
  propertyTitle,
  slots,
  onConfirm,
  initialConfirmedId = null,
}: {
  propertyTitle: string;
  slots: ViewingSlot[];
  onConfirm?: ((slot: ViewingSlot) => void) | undefined;
  initialConfirmedId?: string | null;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState<string | null>(initialConfirmedId);
  const headingId = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const byDay = useMemo(() => {
    const map = new Map<string, ViewingSlot[]>();
    for (const s of slots) {
      const key = dayLabel(s.start);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [slots]);

  const available = slots.filter((s) => s.available);
  const focusTarget = selected ?? available[0]?.id;

  const move = (e: KeyboardEvent, current: string) => {
    const keys = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const idx = available.findIndex((s) => s.id === current);
    let next = idx;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % available.length;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + available.length) % available.length;
    if (e.key === 'Home') next = 0;
    if (e.key === 'End') next = available.length - 1;
    const id = available[next]?.id;
    if (id) {
      setSelected(id);
      refs.current.get(id)?.focus();
    }
  };

  const confirmedSlot = slots.find((s) => s.id === confirmed);
  if (confirmedSlot) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-success/40 bg-success-soft p-4" role="status">
        <CalendarCheck2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
        <div className="text-sm">
          <p className="font-semibold">Viewing requested</p>
          <p className="text-fg-muted">
            {dayLabel(confirmedSlot.start)} at {timeLabel(confirmedSlot.start)} · {propertyTitle}
          </p>
        </div>
      </div>
    );
  }

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-border bg-surface p-4 shadow-card">
      <div className="mb-3 flex items-start gap-2">
        <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        <div>
          <h3 id={headingId} className="text-sm font-semibold">
            Choose a viewing time
          </h3>
          <p className="text-xs text-fg-muted">{propertyTitle} · times in UK time</p>
        </div>
      </div>
      <div role="radiogroup" aria-labelledby={headingId} className="space-y-3">
        {byDay.map(([day, daySlots]) => (
          <div key={day}>
            <p className="mb-1.5 text-xs font-medium text-fg-subtle">{day}</p>
            <div className="flex flex-wrap gap-2">
              {daySlots.map((slot) => {
                const isSelected = selected === slot.id;
                return (
                  <button
                    key={slot.id}
                    ref={(el) => {
                      if (el) refs.current.set(slot.id, el);
                      else refs.current.delete(slot.id);
                    }}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-disabled={!slot.available || undefined}
                    aria-label={`${day} ${timeLabel(slot.start)}${slot.available ? '' : ', unavailable'}`}
                    tabIndex={slot.available && slot.id === focusTarget ? 0 : -1}
                    disabled={!slot.available}
                    onClick={() => setSelected(slot.id)}
                    onKeyDown={(e) => move(e, slot.id)}
                    className={cn(
                      'h-9 min-w-[4.5rem] rounded-lg border px-3 text-sm font-medium tabular-nums transition-colors',
                      slot.available
                        ? isSelected
                          ? 'border-accent bg-accent text-accent-fg'
                          : 'border-border-strong bg-surface hover:border-accent hover:bg-accent-soft'
                        : 'cursor-not-allowed border-dashed border-border text-fg-subtle line-through',
                    )}
                  >
                    {timeLabel(slot.start)}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button
          size="sm"
          disabled={!selected || !onConfirm}
          onClick={() => {
            const slot = slots.find((s) => s.id === selected);
            if (!slot) return;
            setConfirmed(slot.id);
            onConfirm?.(slot);
          }}
        >
          Request this time
        </Button>
      </div>
    </section>
  );
});
