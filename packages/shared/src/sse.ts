import { StreamEventSchema, type StreamEvent } from './schemas';

/**
 * Incremental Server-Sent Events parser following the WHATWG
 * "event stream interpretation" rules:
 *
 * - lines end in CRLF, LF or CR (a CR at the end of one chunk followed by an
 *   LF at the start of the next is a single line ending)
 * - a blank line dispatches the buffered event
 * - lines starting with ":" are comments (used for heartbeats)
 * - `data` fields accumulate, joined by "\n"
 * - a trailing, un-terminated event at end of stream is discarded
 *
 * It accepts decoded text; callers use `TextDecoder#decode(chunk, { stream: true })`
 * so multi-byte UTF-8 sequences split across network chunks are handled there.
 */
export interface SseMessage {
  event: string;
  data: string;
  id: string | undefined;
  retry: number | undefined;
}

export interface SseParser {
  feed(chunk: string): void;
  /** Clears any partially buffered line/event (e.g. before a retry). */
  reset(): void;
}

export function createSseParser(onMessage: (message: SseMessage) => void): SseParser {
  let buffer = '';
  let pendingCR = false;
  let eventType = '';
  let data: string[] = [];
  let lastEventId: string | undefined;
  let retry: number | undefined;
  let hasData = false;

  const dispatch = () => {
    if (hasData) {
      onMessage({ event: eventType || 'message', data: data.join('\n'), id: lastEventId, retry });
    }
    eventType = '';
    data = [];
    hasData = false;
    retry = undefined;
  };

  const processLine = (line: string) => {
    if (line === '') {
      dispatch();
      return;
    }
    if (line.startsWith(':')) return; // comment / heartbeat

    const colon = line.indexOf(':');
    let field: string;
    let value: string;
    if (colon === -1) {
      field = line;
      value = '';
    } else {
      field = line.slice(0, colon);
      value = line.slice(colon + 1);
      if (value.startsWith(' ')) value = value.slice(1);
    }

    switch (field) {
      case 'event':
        eventType = value;
        break;
      case 'data':
        data.push(value);
        hasData = true;
        break;
      case 'id':
        if (!value.includes('\0')) lastEventId = value;
        break;
      case 'retry':
        if (/^\d+$/.test(value)) retry = Number(value);
        break;
      default:
        break; // unknown fields are ignored per spec
    }
  };

  return {
    feed(chunk: string) {
      if (chunk.length === 0) return;
      let text = chunk;
      if (pendingCR) {
        pendingCR = false;
        if (text.startsWith('\n')) text = text.slice(1);
      }
      buffer += text;

      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const ch = buffer[i];
        if (ch === '\n' || ch === '\r') {
          processLine(buffer.slice(start, i));
          if (ch === '\r') {
            if (i + 1 < buffer.length) {
              if (buffer[i + 1] === '\n') i++;
            } else {
              pendingCR = true;
            }
          }
          start = i + 1;
        }
      }
      buffer = buffer.slice(start);
    },
    reset() {
      buffer = '';
      pendingCR = false;
      eventType = '';
      data = [];
      hasData = false;
      retry = undefined;
    },
  };
}

export type ParsedStreamEvent =
  | { ok: true; event: StreamEvent }
  | { ok: false; reason: 'invalid_json' | 'invalid_shape'; raw: string; detail: string };

/** Validates one SSE message's `data` payload against the shared StreamEvent schema. */
export function parseStreamEvent(message: SseMessage): ParsedStreamEvent {
  let json: unknown;
  try {
    json = JSON.parse(message.data);
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid_json',
      raw: message.data,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
  const result = StreamEventSchema.safeParse(json);
  if (!result.success) {
    return {
      ok: false,
      reason: 'invalid_shape',
      raw: message.data,
      detail: result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, event: result.data };
}

/** Serialises a StreamEvent as one SSE frame. JSON never contains raw newlines. */
export function encodeSseEvent(event: StreamEvent, id?: string): string {
  const idLine = id === undefined ? '' : `id: ${id}\n`;
  return `${idLine}event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

export const SSE_HEARTBEAT = ': ping\n\n';
