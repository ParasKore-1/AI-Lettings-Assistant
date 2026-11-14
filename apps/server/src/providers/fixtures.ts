import type { MaintenanceTicket, Property, ToolResult, ViewingSlot } from '@keyring/shared';
import { createRng, hashString } from '../lib/util';

/**
 * Entirely fictional listings. Street names are invented; areas are generic UK
 * neighbourhood-style names so the cards read naturally without pointing at
 * real homes.
 */
export const PROPERTIES: Property[] = [
  {
    id: 'prop_wrenfield_4',
    title: 'Bright two-bed flat with balcony',
    address: 'Flat 4, 27 Wrenfield Road',
    area: 'Harbourside, Bristol',
    rentPcm: 1450,
    beds: 2,
    baths: 1,
    epcRating: 'C',
    furnished: 'part-furnished',
    availableFrom: '2026-12-01',
    imageUrl: null,
    tags: ['Balcony', 'Bike store', 'Pets considered'],
  },
  {
    id: 'prop_copperbeech_2',
    title: 'Quiet mews house near the park',
    address: '2 Copperbeech Mews',
    area: 'Northgate, Leeds',
    rentPcm: 1175,
    beds: 3,
    baths: 2,
    epcRating: 'B',
    furnished: 'unfurnished',
    availableFrom: '2026-12-15',
    imageUrl: null,
    tags: ['Garden', 'Parking', 'Family friendly'],
  },
  {
    id: 'prop_tallowmere_11',
    title: 'Studio in a converted warehouse',
    address: 'Apt 11, Tallowmere Works',
    area: 'Ancoats Quarter, Manchester',
    rentPcm: 925,
    beds: 0,
    baths: 1,
    epcRating: 'C',
    furnished: 'furnished',
    availableFrom: '2026-11-28',
    imageUrl: null,
    tags: ['Bills option', 'Concierge', 'Gym'],
  },
  {
    id: 'prop_lindenvale_7',
    title: 'Victorian terrace with home office',
    address: '7 Lindenvale Gardens',
    area: 'Westbury Green, Bristol',
    rentPcm: 1890,
    beds: 3,
    baths: 1,
    epcRating: 'D',
    furnished: 'unfurnished',
    availableFrom: '2027-01-05',
    imageUrl: null,
    tags: ['Home office', 'Garden', 'Period features'],
  },
  {
    id: 'prop_halberd_19',
    title: 'Modern one-bed by the station',
    address: 'Flat 19, Halberd Court',
    area: 'Riverside, Nottingham',
    rentPcm: 850,
    beds: 1,
    baths: 1,
    epcRating: 'B',
    furnished: 'furnished',
    availableFrom: '2026-12-01',
    imageUrl: null,
    tags: ['Lift', '5 min to station', 'Fibre broadband'],
  },
  {
    id: 'prop_sparrowhawk_3',
    title: 'Two-bed maisonette with garden',
    address: '3A Sparrowhawk Lane',
    area: 'Eastfield, Bristol',
    rentPcm: 1325,
    beds: 2,
    baths: 1,
    epcRating: 'C',
    furnished: 'unfurnished',
    availableFrom: '2026-12-20',
    imageUrl: null,
    tags: ['Private garden', 'Pets considered'],
  },
];

export interface PropertySearch {
  area?: string | undefined;
  maxRentPcm?: number | undefined;
  minBeds?: number | undefined;
}

export function searchProperties(query: PropertySearch, limit = 3): Property[] {
  const area = query.area?.toLowerCase().trim();
  const matches = PROPERTIES.filter(
    (p) =>
      (!area || `${p.area} ${p.address}`.toLowerCase().includes(area)) &&
      (query.maxRentPcm === undefined || p.rentPcm <= query.maxRentPcm) &&
      (query.minBeds === undefined || p.beds >= query.minBeds),
  );
  return (matches.length > 0 ? matches : PROPERTIES).slice(0, limit);
}

export function findProperty(id: string): Property | undefined {
  return PROPERTIES.find((p) => p.id === id);
}

/** Viewing slots over the next few weekdays, relative to `now`. */
export function viewingSlots(propertyId: string, now = new Date()): ViewingSlot[] {
  const rng = createRng(hashString(propertyId + now.toISOString().slice(0, 10)));
  const slots: ViewingSlot[] = [];
  const times = [
    [10, 0],
    [12, 30],
    [17, 30],
  ] as const;
  const day = new Date(now);
  day.setUTCHours(0, 0, 0, 0);
  while (slots.length < 9) {
    day.setUTCDate(day.getUTCDate() + 1);
    const dow = day.getUTCDay();
    if (dow === 0) continue; // no Sunday viewings
    for (const [h, m] of times) {
      if (dow === 6 && h > 13) continue; // Saturday mornings only
      const start = new Date(day);
      start.setUTCHours(h, m, 0, 0);
      const end = new Date(start.getTime() + 30 * 60_000);
      slots.push({
        id: `slot_${propertyId}_${start.getTime()}`,
        start: start.toISOString(),
        end: end.toISOString(),
        available: rng.next() > 0.3,
      });
    }
  }
  return slots.slice(0, 9);
}

export function viewingSlotsResult(property: Property, seed: string): ToolResult {
  return {
    kind: 'viewing_slots',
    id: `tr_slots_${hashString(seed + property.id).toString(36)}`,
    propertyId: property.id,
    propertyTitle: `${property.title} — ${property.address}`,
    slots: viewingSlots(property.id),
  };
}

export function propertyCardsResult(properties: Property[], seed: string): ToolResult {
  return {
    kind: 'property_cards',
    id: `tr_props_${hashString(seed).toString(36)}`,
    properties,
  };
}

export function maintenanceTicketResult(
  input: Pick<MaintenanceTicket, 'title' | 'category' | 'priority' | 'description' | 'address'>,
  seed: string,
): ToolResult {
  const h = hashString(seed);
  const nextStep: Record<MaintenanceTicket['priority'], string> = {
    emergency: 'An on-call contractor will phone you within 2 hours.',
    high: 'A contractor will contact you within 24 hours to book a visit.',
    medium: 'Your agent will arrange a visit within 3–5 working days.',
    low: 'This has been added to the next routine maintenance round.',
  };
  return {
    kind: 'maintenance_ticket',
    id: `tr_ticket_${h.toString(36)}`,
    ticket: {
      id: `ticket_${h.toString(36)}`,
      reference: `KR-${(h % 90000) + 10000}`,
      status: input.priority === 'emergency' ? 'scheduled' : 'open',
      createdAt: new Date().toISOString(),
      nextStep: nextStep[input.priority],
      ...input,
    },
  };
}
