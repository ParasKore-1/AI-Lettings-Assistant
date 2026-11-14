import {
  ConversationPageSchema,
  ConversationSchema,
  ConversationWithMessagesSchema,
  createSseParser,
  parseStreamEvent,
  type SendMessageBody,
  type StreamEvent,
} from '@keyring/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, createDeps } from './app';
import { loadEnv } from './env';
import { createRateLimiter } from './lib/rateLimit';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const env = loadEnv({ DATABASE_PATH: ':memory:', MOCK_SPEED: '0', NODE_ENV: 'test', RATE_LIMIT_PER_MINUTE: '1000' });
  app = createApp(createDeps(env));
});

const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

async function createConversation() {
  const res = await app.request('/api/conversations', json({}));
  expect(res.status).toBe(201);
  return ConversationSchema.parse(await res.json());
}

async function stream(conversationId: string, body: SendMessageBody, headers: Record<string, string> = {}) {
  const res = await app.request(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const events: StreamEvent[] = [];
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    const parser = createSseParser((m) => {
      const parsed = parseStreamEvent(m);
      if (!parsed.ok) throw new Error(`bad event: ${parsed.detail}`);
      events.push(parsed.event);
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.feed(decoder.decode(value, { stream: true }));
    }
  }
  const text = events.flatMap((e) => (e.type === 'text_delta' ? [e.delta] : [])).join('');
  return { res, events, text };
}

describe('conversations REST', () => {
  it('creates, lists, renames, pins, soft-deletes and restores', async () => {
    const a = await createConversation();
    const b = await createConversation();

    const patch = await app.request(`/api/conversations/${a.id}`, {
      ...json({ title: 'Renamed', pinned: true }),
      method: 'PATCH',
    });
    expect(ConversationSchema.parse(await patch.json())).toMatchObject({ title: 'Renamed', pinned: true });

    const list = ConversationPageSchema.parse(await (await app.request('/api/conversations')).json());
    expect(list.items.map((c) => c.id)).toEqual([a.id, b.id]); // pinned first

    expect((await app.request(`/api/conversations/${b.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await app.request(`/api/conversations/${b.id}`)).status).toBe(404);
    expect((await app.request(`/api/conversations/${b.id}/restore`, { method: 'POST' })).status).toBe(200);
    expect((await app.request(`/api/conversations/${b.id}`)).status).toBe(200);
  });

  it('paginates with a cursor and searches titles and message text', async () => {
    for (let i = 0; i < 5; i++) await createConversation();
    const first = ConversationPageSchema.parse(await (await app.request('/api/conversations?limit=2')).json());
    expect(first.items).toHaveLength(2);
    const second = ConversationPageSchema.parse(
      await (await app.request(`/api/conversations?limit=2&cursor=${first.nextCursor}`)).json(),
    );
    expect(second.items.map((c) => c.id)).not.toContain(first.items[0]!.id);

    const c = await createConversation();
    await stream(c.id, { intent: 'send', content: 'What deposit protection rules apply?', parentId: null });
    const found = ConversationPageSchema.parse(await (await app.request('/api/conversations?q=prescribed')).json());
    expect(found.items.map((x) => x.id)).toEqual([c.id]);
  });

  it('validates input', async () => {
    const res = await app.request('/api/conversations/nope', { ...json({}), method: 'PATCH' });
    expect(res.status).toBe(400);
    expect((await app.request('/api/conversations/nope')).status).toBe(404);
  });
});

describe('message streaming', () => {
  it('streams message_start → text_delta… → message_end and persists the reply + title', async () => {
    const c = await createConversation();
    const { res, events, text } = await stream(c.id, {
      intent: 'send',
      content: 'What deposit protection rules apply?',
      parentId: null,
    });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(events[0]?.type).toBe('message_start');
    expect(events.at(-1)?.type).toBe('message_end');
    expect(events.filter((e) => e.type === 'text_delta').length).toBeGreaterThan(20);
    expect(text).toContain('30 days');

    const end = events.at(-1) as Extract<StreamEvent, { type: 'message_end' }>;
    expect(end.message.content).toBe(text);
    expect(end.conversation.title).toBe('Deposit protection rules');

    const saved = ConversationWithMessagesSchema.parse(await (await app.request(`/api/conversations/${c.id}`)).json());
    expect(saved.messages.map((m) => [m.role, m.status])).toEqual([
      ['user', 'complete'],
      ['assistant', 'complete'],
    ]);
  });

  it('emits structured tool_result cards', async () => {
    const c = await createConversation();
    const { events } = await stream(c.id, { intent: 'send', content: '/viewing Wrenfield Road', parentId: null });
    const kinds = events.flatMap((e) => (e.type === 'tool_result' ? [e.result.kind] : []));
    expect(kinds).toEqual(['property_cards', 'viewing_slots']);
  });

  it('regenerate and edit create sibling branches', async () => {
    const c = await createConversation();
    const first = await stream(c.id, { intent: 'send', content: 'Hello', parentId: null });
    const start = first.events[0] as Extract<StreamEvent, { type: 'message_start' }>;
    const userId = start.userMessage!.id;

    await stream(c.id, { intent: 'regenerate', userMessageId: userId });
    await stream(c.id, { intent: 'send', content: 'Hello again (edited)', parentId: null });

    const saved = ConversationWithMessagesSchema.parse(await (await app.request(`/api/conversations/${c.id}`)).json());
    const assistantsUnderFirst = saved.messages.filter((m) => m.parentId === userId);
    const roots = saved.messages.filter((m) => m.parentId === null);
    expect(assistantsUnderFirst).toHaveLength(2);
    expect(roots).toHaveLength(2);
  });

  it('fail_mid_stream drops the connection, keeps partial text, and resume completes it seamlessly', async () => {
    const c = await createConversation();
    const prompt = 'What deposit protection rules apply?';
    const broken = await stream(c.id, { intent: 'send', content: prompt, parentId: null }, { 'x-keyring-debug': 'fail_mid_stream' });
    expect(broken.events.some((e) => e.type === 'message_end')).toBe(false);
    const start = broken.events[0] as Extract<StreamEvent, { type: 'message_start' }>;
    const assistantId = start.assistantMessage.id;

    const mid = ConversationWithMessagesSchema.parse(await (await app.request(`/api/conversations/${c.id}`)).json());
    const partial = mid.messages.find((m) => m.id === assistantId)!;
    expect(partial.status).toBe('error');
    expect(partial.content).toBe(broken.text);
    expect(partial.content.length).toBeGreaterThan(0);

    const resumed = await stream(c.id, { intent: 'resume', assistantMessageId: assistantId });
    const resumedStart = resumed.events[0] as Extract<StreamEvent, { type: 'message_start' }>;
    expect(resumedStart.assistantMessage.content).toBe(broken.text);
    const end = resumed.events.at(-1) as Extract<StreamEvent, { type: 'message_end' }>;
    expect(end.message.content).toBe(broken.text + resumed.text);

    // Same text as an uninterrupted run of the same script.
    expect(end.message.content).toContain('Quick worked example');
    expect(end.message.content.startsWith(broken.text)).toBe(true);
  });

  it('provider_error emits a typed, retryable error event', async () => {
    const c = await createConversation();
    const { events } = await stream(c.id, { intent: 'send', content: 'Hello', parentId: null }, { 'x-keyring-debug': 'provider_error' });
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'provider_error', retryable: true });
  });

  it('returns JSON errors for server_error and rate_limit debug modes', async () => {
    const c = await createConversation();
    const s = await stream(c.id, { intent: 'send', content: 'Hi', parentId: null }, { 'x-keyring-debug': 'server_error' });
    expect(s.res.status).toBe(500);
    const r = await stream(c.id, { intent: 'send', content: 'Hi', parentId: null }, { 'x-keyring-debug': 'rate_limit' });
    expect(r.res.status).toBe(429);
    expect(r.res.headers.get('retry-after')).toBe('8');
    expect(await r.res.json()).toMatchObject({ error: { code: 'rate_limited', retryAfterMs: 8000 } });
  });

  it('rejects an unknown parent and empty content', async () => {
    const c = await createConversation();
    expect((await stream(c.id, { intent: 'send', content: 'x', parentId: 'nope' })).res.status).toBe(400);
    expect((await stream(c.id, { intent: 'send', content: '   ', parentId: null })).res.status).toBe(400);
  });

  it('stores messages with the raw text the model produced (sanitising is the client’s job)', async () => {
    const c = await createConversation();
    const { text } = await stream(c.id, { intent: 'send', content: 'show me raw html xss', parentId: null });
    expect(text).toContain('<script>');
  });
});

describe('attachments', () => {
  const upload = (name: string, type: string, bytes: number[]) => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array(bytes)], name, { type }));
    return app.request('/api/attachments', { method: 'POST', body: form });
  };

  it('accepts a real PNG and serves it back with nosniff', async () => {
    const res = await upload('a.png', 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(res.status).toBe(201);
    const { url } = (await res.json()) as { url: string };
    const file = await app.request(url);
    expect(file.headers.get('content-type')).toBe('image/png');
    expect(file.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('rejects disallowed types and spoofed content', async () => {
    expect((await upload('x.svg', 'image/svg+xml', [0x3c, 0x73])).status).toBe(415);
    expect((await upload('fake.png', 'image/png', [0x3c, 0x68, 0x74, 0x6d])).status).toBe(415);
  });
});

describe('rate limiter', () => {
  it('allows N per minute then reports the wait', () => {
    let t = 0;
    const limiter = createRateLimiter(2, () => t);
    expect(limiter.take('ip')).toBe(0);
    expect(limiter.take('ip')).toBe(0);
    t = 10_000;
    expect(limiter.take('ip')).toBe(50_000);
    t = 60_001;
    expect(limiter.take('ip')).toBe(0);
  });
});
