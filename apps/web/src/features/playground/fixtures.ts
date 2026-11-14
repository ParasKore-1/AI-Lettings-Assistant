import { encodeSseEvent, type Conversation, type Message, type MaintenanceTicket, type Property, type StreamEvent, type ViewingSlot } from '@keyring/shared';

const t = (min: number) => new Date(Date.now() - min * 60_000).toISOString();

export const PG_PROPERTIES: Property[] = [
  {
    id: 'pg_prop_1',
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
    id: 'pg_prop_2',
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
    tags: ['Garden', 'Parking'],
  },
  {
    id: 'pg_prop_3',
    title: 'Studio in a converted warehouse',
    address: 'Apt 11, Tallowmere Works',
    area: 'Ancoats Quarter, Manchester',
    rentPcm: 925,
    beds: 0,
    baths: 1,
    epcRating: 'E',
    furnished: 'furnished',
    availableFrom: '2026-11-28',
    imageUrl: null,
    tags: ['Concierge'],
  },
];

export function pgSlots(): ViewingSlot[] {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  return [1, 1, 1, 2, 2, 3].map((d, i) => {
    const start = new Date(base);
    start.setDate(start.getDate() + d);
    start.setHours([10, 12, 17][i % 3]!, i % 2 ? 30 : 0);
    return {
      id: `pg_slot_${i}`,
      start: start.toISOString(),
      end: new Date(start.getTime() + 1_800_000).toISOString(),
      available: i !== 2,
    };
  });
}

export const PG_TICKET: MaintenanceTicket = {
  id: 'pg_ticket',
  reference: 'KR-48213',
  title: 'Boiler not providing heating or hot water',
  category: 'heating',
  priority: 'high',
  status: 'open',
  address: 'Flat 4, 27 Wrenfield Road',
  description: 'Boiler shows fault code F28 and won’t relight. No hot water since this morning.',
  createdAt: t(12),
  nextStep: 'A contractor will contact you within 24 hours to book a visit.',
};

export const PG_MARKDOWN = `Here's a quick overview of **deposit protection**:

1. Protect the deposit within **30 days**.
2. Give the tenant the *prescribed information*.

| Annual rent | Max deposit |
| --- | --- |
| Under £50,000 | 5 weeks' rent |
| £50,000+ | 6 weeks' rent |

\`\`\`ts
const weekly = (pcm: number) => (pcm * 12) / 52;
\`\`\`

See [GOV.UK guidance](https://www.gov.uk/tenancy-deposit-protection).`;

export const PG_CONVERSATION: Conversation = {
  id: 'playground',
  title: 'Playground',
  pinned: false,
  shared: false,
  createdAt: t(30),
  updatedAt: t(1),
  preview: '',
};

export const pgMessage = (over: Partial<Message> & Pick<Message, 'id' | 'role'>): Message => ({
  conversationId: 'playground',
  parentId: null,
  content: '',
  toolResults: [],
  attachments: [],
  status: 'complete',
  feedback: null,
  error: null,
  model: 'keyring-mock',
  createdAt: t(5),
  ...over,
});

export const PG_STREAM_TEXT = `Of course — here's a **friendly rent reminder** you can adapt:

> Dear Sam, our records show the rent due on 1 December hasn't arrived yet. Could you pay by Friday, or let me know if anything has changed?

A few tips:

- Keep it factual: dates and amounts only.
- Put it in writing so there's a record.
- Offer a conversation if they're struggling.

I've also found a similar property nearby:`;

/**
 * A fake fetch that streams a scripted reply as real SSE bytes, so the
 * playground exercises the production engine (parser, rAF batching, cache).
 */
export function createFakeStreamFetch(opts: { tokenMs: number; failAt?: number | null }) {
  return async (_url: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const body = JSON.parse(String(init?.body ?? '{}')) as { content?: string; intent: string; assistantMessageId?: string };
    const encoder = new TextEncoder();
    const signal = init?.signal;
    const userId = `pg_u_${Date.now()}`;
    const assistantId = body.assistantMessageId ?? `pg_a_${Date.now()}`;
    const user = body.intent === 'send' ? pgMessage({ id: userId, role: 'user', content: body.content ?? '', createdAt: new Date().toISOString() }) : null;
    const assistant = pgMessage({ id: assistantId, role: 'assistant', parentId: userId, status: 'streaming', createdAt: new Date().toISOString() });
    const tokens = PG_STREAM_TEXT.match(/\S+\s*|\s+/g) ?? [];

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (e: StreamEvent) => controller.enqueue(encoder.encode(encodeSseEvent(e)));
        const wait = (ms: number) =>
          new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, ms);
            signal?.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new DOMException('aborted', 'AbortError'));
            });
          });
        try {
          send({ type: 'message_start', userMessage: user, assistantMessage: assistant });
          await wait(400);
          let text = '';
          for (let i = 0; i < tokens.length; i++) {
            if (opts.failAt && i === opts.failAt) {
              controller.close(); // simulate a dropped connection
              return;
            }
            text += tokens[i];
            send({ type: 'text_delta', messageId: assistantId, delta: tokens[i]! });
            await wait(opts.tokenMs);
          }
          const card = { kind: 'property_cards' as const, id: 'pg_card', offset: text.length, properties: [PG_PROPERTIES[0]!] };
          send({ type: 'tool_result', messageId: assistantId, result: card });
          await wait(200);
          send({
            type: 'message_end',
            message: { ...assistant, status: 'complete', content: text, toolResults: [card] },
            conversation: PG_CONVERSATION,
          });
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  };
}
