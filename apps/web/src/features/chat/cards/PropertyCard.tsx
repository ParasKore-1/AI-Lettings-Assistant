import type { EpcRating, Property } from '@keyring/shared';
import { Bath, BedDouble, CalendarDays, MapPin } from 'lucide-react';
import { memo } from 'react';
import { Button } from '../../../components/ui/Button';
import { cn, formatGBP } from '../../../lib/utils';

const EPC_COLOURS: Record<EpcRating, string> = {
  A: 'bg-[#007f3d] text-white',
  B: 'bg-[#2c9f29] text-white',
  C: 'bg-[#8dce46] text-[#13260a]',
  D: 'bg-[#ffd500] text-[#2e2600]',
  E: 'bg-[#fcaa65] text-[#3a1d00]',
  F: 'bg-[#ef8023] text-[#2a1200]',
  G: 'bg-[#e9153b] text-white',
};

function hueFor(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** Decorative illustration generated from the property id (no external images). */
function PropertyIllustration({ property }: { property: Property }) {
  const hue = hueFor(property.id);
  const floors = Math.max(1, Math.min(3, property.beds));
  return (
    <svg viewBox="0 0 320 140" aria-hidden="true" className="block h-full w-full" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`sky-${property.id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={`hsl(${hue} 55% 86%)`} />
          <stop offset="1" stopColor={`hsl(${(hue + 30) % 360} 50% 94%)`} />
        </linearGradient>
      </defs>
      <rect width="320" height="140" fill={`url(#sky-${property.id})`} />
      <circle cx="262" cy="34" r="16" fill={`hsl(${(hue + 50) % 360} 80% 78%)`} />
      <rect x="0" y="118" width="320" height="22" fill={`hsl(${(hue + 100) % 360} 30% 70%)`} />
      <g transform="translate(96 30)">
        <path d="M-6 34 L64 -6 L134 34 Z" fill={`hsl(${hue} 35% 38%)`} />
        <rect x="4" y="32" width="120" height={56} fill={`hsl(${hue} 30% 96%)`} />
        {Array.from({ length: floors }).map((_, f) =>
          [16, 52, 88].map((x) => (
            <rect
              key={`${f}-${x}`}
              x={x}
              y={40 + f * (44 / floors)}
              width="22"
              height={Math.min(16, 40 / floors)}
              rx="2"
              fill={`hsl(${hue} 40% 62%)`}
            />
          )),
        )}
        <rect x="54" y="66" width="20" height="22" rx="2" fill={`hsl(${hue} 35% 38%)`} />
      </g>
    </svg>
  );
}

export const PropertyCard = memo(function PropertyCard({
  property,
  onBookViewing,
}: {
  property: Property;
  onBookViewing?: ((property: Property) => void) | undefined;
}) {
  const available = new Date(property.availableFrom).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <article
      aria-label={`${property.title}, ${formatGBP(property.rentPcm)} per month`}
      className="flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card"
    >
      <div className="relative h-28 sm:h-32">
        {property.imageUrl ? (
          <img src={property.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <PropertyIllustration property={property} />
        )}
        <span
          className={cn('absolute top-2.5 right-2.5 rounded-md px-2 py-0.5 text-xs font-bold shadow-sm', EPC_COLOURS[property.epcRating])}
        >
          <span className="sr-only">Energy rating </span>EPC {property.epcRating}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-lg font-semibold tracking-tight">
            {formatGBP(property.rentPcm)}
            <span className="ml-1 text-xs font-normal text-fg-subtle">pcm</span>
          </p>
          <span className="text-xs text-fg-subtle capitalize">{property.furnished}</span>
        </div>
        <h3 className="text-sm leading-snug font-medium">{property.title}</h3>
        <p className="flex items-start gap-1 text-xs text-fg-muted">
          <MapPin className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          <span>
            {property.address}, {property.area}
          </span>
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted" aria-label="Key facts">
          <li className="flex items-center gap-1">
            <BedDouble className="size-3.5" aria-hidden="true" />
            {property.beds === 0 ? 'Studio' : `${property.beds} bed`}
          </li>
          <li className="flex items-center gap-1">
            <Bath className="size-3.5" aria-hidden="true" />
            {property.baths} bath
          </li>
          <li className="flex items-center gap-1">
            <CalendarDays className="size-3.5" aria-hidden="true" />
            From {available}
          </li>
        </ul>
        {property.tags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Features">
            {property.tags.map((t) => (
              <li key={t} className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-medium text-accent-soft-fg">
                {t}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-auto pt-1.5">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={!onBookViewing}
            onClick={() => onBookViewing?.(property)}
          >
            Book viewing
          </Button>
        </div>
      </div>
    </article>
  );
});

export function PropertyCardGrid({
  properties,
  onBookViewing,
}: {
  properties: Property[];
  onBookViewing?: ((property: Property) => void) | undefined;
}) {
  return (
    <div className={cn('grid gap-3', properties.length > 1 ? 'sm:grid-cols-2 xl:grid-cols-3' : 'max-w-sm')}>
      {properties.map((p) => (
        <PropertyCard key={p.id} property={p} onBookViewing={onBookViewing} />
      ))}
    </div>
  );
}
