import { describe, expect, it } from 'vitest';
import { createSseParser, encodeSseEvent, parseStreamEvent, type SseMessage } from './sse';
import type { StreamEvent } from './schemas';

function collect() {
  const out: SseMessage[] = [];
  const parser = createSseParser((m) => out.push(m));
  return { out, parser };
}

const delta = (text: string): StreamEvent => ({ type: 'text_delta', messageId: 'm1', delta: text });

describe('createSseParser', () => {
  it('parses a single complete event', () => {
    const { out, parser } = collect();
    parser.feed('event: text_delta\ndata: {"a":1}\n\n');
    expect(out).toEqual([{ event: 'text_delta', data: '{"a":1}', id: undefined, retry: undefined }]);
  });

  it('handles an event split across many chunks, including mid-field and mid-line-ending', () => {
    const { out, parser } = collect();
    const frame = encodeSseEvent(delta('Hello, tenant!'));
    for (const ch of frame) parser.feed(ch);
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0]!.data)).toEqual(delta('Hello, tenant!'));
  });

  it('emits multiple events contained in one chunk, in order', () => {
    const { out, parser } = collect();
    parser.feed(encodeSseEvent(delta('a')) + encodeSseEvent(delta('b')) + encodeSseEvent(delta('c')));
    expect(out.map((m) => JSON.parse(m.data).delta)).toEqual(['a', 'b', 'c']);
  });

  it('buffers a trailing partial event until it is completed by the next chunk', () => {
    const { out, parser } = collect();
    const second = encodeSseEvent(delta('two'));
    parser.feed(encodeSseEvent(delta('one')) + second.slice(0, 10));
    expect(out).toHaveLength(1);
    parser.feed(second.slice(10));
    expect(out).toHaveLength(2);
  });

  it('supports CRLF and bare CR line endings, including CR/LF split across chunks', () => {
    const { out, parser } = collect();
    parser.feed('data: one\r');
    parser.feed('\n\r');
    parser.feed('\ndata: two\r\r');
    expect(out.map((m) => m.data)).toEqual(['one', 'two']);
  });

  it('ignores comments (heartbeats) and unknown fields', () => {
    const { out, parser } = collect();
    parser.feed(': ping\n\nfoo: bar\ndata: x\n\n');
    expect(out.map((m) => m.data)).toEqual(['x']);
  });

  it('joins multi-line data with \\n and strips exactly one leading space', () => {
    const { out, parser } = collect();
    parser.feed('data:  two spaces\ndata:none\n\n');
    expect(out[0]!.data).toBe(' two spaces\nnone');
  });

  it('does not dispatch blocks with no data field and defaults event type to "message"', () => {
    const { out, parser } = collect();
    parser.feed('event: lonely\n\ndata: hi\n\n');
    expect(out).toEqual([{ event: 'message', data: 'hi', id: undefined, retry: undefined }]);
  });

  it('tracks id and retry fields', () => {
    const { out, parser } = collect();
    parser.feed('id: 7\nretry: 1500\ndata: x\n\n');
    expect(out[0]).toMatchObject({ id: '7', retry: 1500 });
  });

  it('discards an unterminated event at end of stream and reset() clears state', () => {
    const { out, parser } = collect();
    parser.feed('data: partial');
    parser.reset();
    parser.feed('data: fresh\n\n');
    expect(out.map((m) => m.data)).toEqual(['fresh']);
  });

  it('handles multi-byte characters when decoded with a streaming TextDecoder', () => {
    const { out, parser } = collect();
    const bytes = new TextEncoder().encode(encodeSseEvent(delta('£1,250 pcm — ok ✓')));
    const decoder = new TextDecoder();
    // split inside the "£" (2 bytes) and "✓" (3 bytes) sequences
    for (let i = 0; i < bytes.length; i += 3) {
      parser.feed(decoder.decode(bytes.slice(i, i + 3), { stream: true }));
    }
    parser.feed(decoder.decode());
    expect(JSON.parse(out[0]!.data).delta).toBe('£1,250 pcm — ok ✓');
  });
});

describe('parseStreamEvent', () => {
  const msg = (data: string): SseMessage => ({ event: 'x', data, id: undefined, retry: undefined });

  it('returns a typed event for valid payloads', () => {
    const result = parseStreamEvent(msg(JSON.stringify(delta('hi'))));
    expect(result).toEqual({ ok: true, event: delta('hi') });
  });

  it('reports malformed JSON without throwing', () => {
    const result = parseStreamEvent(msg('{"type":"text_delta",'));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('invalid_json');
  });

  it('reports schema violations (unknown type, missing fields)', () => {
    const unknown = parseStreamEvent(msg('{"type":"nope"}'));
    const missing = parseStreamEvent(msg('{"type":"text_delta","messageId":"m1"}'));
    expect(unknown.ok || missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe('invalid_shape');
  });
});
