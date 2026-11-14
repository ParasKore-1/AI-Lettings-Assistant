import { encodeSseEvent, type ConversationWithMessages, type Message, type StreamEvent } from '@keyring/shared';
import { QueryClient } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { queryKeys } from '../../../lib/utils';
import { createChatEngine } from './chatEngine';
import { getStream, useStreamStore } from './streamStore';

const CID = 'c_test';
const iso = (s: number) => new Date(Date.UTC(2026, 10, 14, 9, 0, s)).toISOString();

const msg = (over: Partial<Message>): Message => ({
  id: 'x',
  conversationId: CID,
  parentId: null,
  role: 'user',
  content: '',
  toolResults: [],
  attachments: [],
  status: 'complete',
  feedback: null,
  error: null,
  model: null,
  createdAt: iso(1),
  ...over,
});

const user = msg({ id: 'u1', content: 'Hello' });
const assistant = msg({ id: 'a1', parentId: 'u1', role: 'assistant', status: 'streaming', model: 'keyring-mock', createdAt: iso(2) });
const conversation = {
  id: CID,
  title: 'Greeting',
  pinned: false,
  shared: false,
  createdAt: iso(0),
  updatedAt: iso(3),
  preview: 'Hi',
};

/** A fetch whose body yields the given chunks (optionally hanging or erroring). */
function sseResponse(chunks: string[], opts: { hang?: boolean; status?: number; json?: unknown } = {}) {
  return vi.fn(async (_url: unknown, init?: RequestInit) => {
    if (opts.status && opts.status >= 400) {
      return new Response(JSON.stringify(opts.json ?? {}), {
        status: opts.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        if (!opts.hang) controller.close();
        init?.signal?.addEventListener('abort', () => controller.error(new DOMException('aborted', 'AbortError')));
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
}

function setup(fetchImpl: ReturnType<typeof sseResponse>) {
  const qc = new QueryClient();
  qc.setQueryData<ConversationWithMessages>(queryKeys.conversation(CID), {
    conversation: { ...conversation, title: 'New chat' },
    messages: [],
  });
  const frames: (() => void)[] = [];
  const engine = createChatEngine({
    queryClient: qc,
    fetch: fetchImpl as unknown as typeof fetch,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: () => undefined,
    isOnline: () => true,
  });
  return { qc, engine, frames };
}

const messages = (qc: QueryClient) =>
  qc.getQueryData<ConversationWithMessages>(queryKeys.conversation(CID))!.messages;

const ev = (e: StreamEvent) => encodeSseEvent(e);
const delta = (d: string): StreamEvent => ({ type: 'text_delta', messageId: 'a1', delta: d });

beforeEach(() => {
  useStreamStore.setState({ streams: {} });
});

describe('chat engine', () => {
  it('streams a full reply, batching deltas per animation frame', async () => {
    const final = { ...assistant, status: 'complete' as const, content: 'Hi there!' };
    const body = [
      ev({ type: 'message_start', userMessage: user, assistantMessage: assistant }),
      ev(delta('Hi')) + ev(delta(' there')),
      ev(delta('!')).slice(0, 20), // split mid-event
      ev(delta('!')).slice(20),
      ev({ type: 'message_end', message: final, conversation }),
    ];
    const { qc, engine, frames } = setup(sseResponse(body));
    const renders: string[] = [];
    const unsub = useStreamStore.subscribe((s) => renders.push(s.streams[CID]?.text ?? ''));

    await engine.start(CID, { intent: 'send', content: 'Hello', parentId: null });
    unsub();

    // 3 deltas arrived but only one rAF was ever requested before message_end flushed it.
    expect(frames.length).toBeLessThanOrEqual(1);
    expect(renders.filter((t) => t.length > 0 && t !== 'Hi there!')).toEqual([]);
    expect(messages(qc).map((m) => [m.id, m.status, m.content])).toEqual([
      ['u1', 'complete', 'Hello'],
      ['a1', 'complete', 'Hi there!'],
    ]);
    expect(getStream(CID).phase).toBe('idle');
    const title = qc.getQueryData<ConversationWithMessages>(queryKeys.conversation(CID))!.conversation.title;
    expect(title).toBe('Greeting');
  });

  it('keeps partial text and marks the reply as errored when the connection drops', async () => {
    const body = [ev({ type: 'message_start', userMessage: user, assistantMessage: assistant }), ev(delta('Partial answer'))];
    const { qc, engine } = setup(sseResponse(body));
    await engine.start(CID, { intent: 'send', content: 'Hello', parentId: null });
    const s = getStream(CID);
    expect(s.phase).toBe('error');
    expect(s.error).toMatchObject({ kind: 'network', retryable: true });
    expect(s.assistantId).toBe('a1');
    expect(messages(qc).find((m) => m.id === 'a1')).toMatchObject({ status: 'error', content: 'Partial answer' });
  });

  it('ignores malformed events and continues', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const final = { ...assistant, status: 'complete' as const, content: 'ok' };
    const body = [
      ev({ type: 'message_start', userMessage: user, assistantMessage: assistant }),
      'event: text_delta\ndata: {not json\n\n',
      'data: {"type":"text_delta"}\n\n',
      ev(delta('ok')),
      ev({ type: 'message_end', message: final, conversation }),
    ];
    const { engine } = setup(sseResponse(body));
    await engine.start(CID, { intent: 'send', content: 'Hello', parentId: null });
    expect(getStream(CID).phase).toBe('idle');
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('maps provider error events to a retryable error state', async () => {
    const body = [
      ev({ type: 'message_start', userMessage: user, assistantMessage: assistant }),
      ev(delta('Some')),
      ev({ type: 'error', messageId: 'a1', code: 'provider_error', message: 'Upstream failed', retryable: true }),
    ];
    const { qc, engine } = setup(sseResponse(body));
    await engine.start(CID, { intent: 'send', content: 'Hello', parentId: null });
    expect(getStream(CID).error).toMatchObject({ kind: 'provider', message: 'Upstream failed' });
    expect(messages(qc).find((m) => m.id === 'a1')?.content).toBe('Some');
  });

  it('reports rate limits with a retry time and keeps the unsent message pending', async () => {
    const fetchImpl = sseResponse([], {
      status: 429,
      json: { error: { code: 'rate_limited', message: 'Slow down', retryAfterMs: 8000 } },
    });
    const { engine } = setup(fetchImpl);
    const before = Date.now();
    await engine.start(
      CID,
      { intent: 'send', content: 'Hello', parentId: null },
      { pendingUser: { content: 'Hello', attachments: [], parentId: null, createdAt: iso(1) } },
    );
    const s = getStream(CID);
    expect(s.error?.kind).toBe('rate_limited');
    expect(s.error!.retryAt!).toBeGreaterThanOrEqual(before + 8000);
    expect(s.pendingUser?.content).toBe('Hello');
  });

  it('stop() aborts the fetch, keeps partial text and marks the reply stopped', async () => {
    const body = [ev({ type: 'message_start', userMessage: user, assistantMessage: assistant }), ev(delta('Half a'))];
    const { qc, engine, frames } = setup(sseResponse(body, { hang: true }));
    const done = engine.start(CID, { intent: 'send', content: 'Hello', parentId: null });
    await vi.waitFor(() => expect(getStream(CID).phase).toBe('streaming'));
    await vi.waitFor(() => expect(frames.length).toBe(1));
    engine.stop(CID);
    await done;
    expect(messages(qc).find((m) => m.id === 'a1')).toMatchObject({ status: 'stopped', content: 'Half a' });
    expect(getStream(CID).phase).toBe('idle');
  });
});
