import {
  createSseParser,
  parentKey,
  parseStreamEvent,
  type SendMessageBody,
  type StreamEvent,
} from '@keyring/shared';
import type { QueryClient } from '@tanstack/react-query';
import { apiUrl } from '../../../env';
import { ApiError, api, toApiError } from '../../../lib/api';
import { queryKeys } from '../../../lib/utils';
import { useBranches } from '../../../stores/branches';
import {
  getCachedMessage,
  patchMessage,
  setCachedConversation,
  upsertConversationInLists,
  upsertMessages,
} from '../../conversations/cache';
import { getStream, useAnnouncer, useStreamStore, type PendingUser, type StreamError } from './streamStore';

export interface ChatEngineDeps {
  queryClient: QueryClient;
  fetch?: typeof fetch;
  requestFrame?: (cb: () => void) => number;
  cancelFrame?: (handle: number) => void;
  isOnline?: () => boolean;
  now?: () => number;
}

export interface StartOptions {
  pendingUser?: PendingUser | null;
  /** Create the conversation on the server first (first message of a new chat). */
  ensureConversation?: boolean;
}

export type ChatEngine = ReturnType<typeof createChatEngine>;

const STOP = 'user-stop';
const SUPERSEDED = 'superseded';

/**
 * Drives one streamed reply per conversation, outside React:
 *
 *   fetch(POST) → ReadableStream → TextDecoder(stream) → SSE parser → Zod →
 *   rAF-batched store updates + TanStack Query cache reconciliation.
 *
 * Text deltas are buffered and committed at most once per animation frame,
 * and only the streaming row subscribes to that text, so the rest of the
 * message list never re-renders per token.
 */
export function createChatEngine(deps: ChatEngineDeps) {
  const qc = deps.queryClient;
  const doFetch = deps.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const requestFrame =
    deps.requestFrame ??
    (typeof requestAnimationFrame === 'function'
      ? (cb: () => void) => requestAnimationFrame(cb)
      : (cb: () => void) => setTimeout(cb, 16) as unknown as number);
  const cancelFrame =
    deps.cancelFrame ??
    (typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : (h: number) => clearTimeout(h));
  const isOnline = deps.isOnline ?? (() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const now = deps.now ?? Date.now;
  const controllers = new Map<string, AbortController>();
  const patch = useStreamStore.getState().patch;

  async function start(conversationId: string, body: SendMessageBody, options: StartOptions = {}) {
    controllers.get(conversationId)?.abort(SUPERSEDED);
    const controller = new AbortController();
    controllers.set(conversationId, controller);

    const resumeId = body.intent === 'resume' ? body.assistantMessageId : null;
    const resumed = resumeId ? getCachedMessage(qc, conversationId, resumeId) : undefined;
    if (resumeId) patchMessage(qc, conversationId, resumeId, { status: 'streaming', error: null });

    patch(conversationId, {
      phase: 'sending',
      error: null,
      pendingUser: options.pendingUser ?? null,
      assistantId: resumeId,
      text: resumed?.content ?? '',
      toolResults: resumed?.toolResults ?? [],
      lastRequest: { body, ensureConversation: options.ensureConversation ?? false },
    });

    let buffer = '';
    let frame: number | null = null;
    let terminal = false;

    const flush = () => {
      if (frame !== null) {
        cancelFrame(frame);
        frame = null;
      }
      if (!buffer) return;
      const chunk = buffer;
      buffer = '';
      patch(conversationId, (s) => ({ text: s.text + chunk }));
    };
    const scheduleFlush = () => {
      if (frame === null) {
        frame = requestFrame(() => {
          frame = null;
          flush();
        });
      }
    };

    /** Picks up server-side changes made at the end of a reply (e.g. the auto-generated title). */
    const resyncSoon = (includeDetail: boolean) =>
      setTimeout(() => {
        void qc.invalidateQueries({ queryKey: queryKeys.conversationsAll });
        if (includeDetail) void qc.invalidateQueries({ queryKey: queryKeys.conversation(conversationId) });
      }, 400);

    const fail = (error: StreamError) => {
      flush();
      resyncSoon(false);
      const s = getStream(conversationId);
      if (s.assistantId) {
        patchMessage(qc, conversationId, s.assistantId, {
          status: 'error',
          content: s.text,
          toolResults: s.toolResults,
          error: { code: error.kind, message: error.message },
        });
      }
      patch(conversationId, { phase: 'error', error });
    };

    const handle = (event: StreamEvent) => {
      switch (event.type) {
        case 'message_start': {
          const { userMessage, assistantMessage } = event;
          upsertMessages(qc, conversationId, userMessage ? [userMessage, assistantMessage] : [assistantMessage]);
          const select = useBranches.getState().select;
          if (userMessage) select(conversationId, parentKey(userMessage.parentId), userMessage.id);
          select(conversationId, parentKey(assistantMessage.parentId), assistantMessage.id);
          patch(conversationId, {
            phase: 'streaming',
            assistantId: assistantMessage.id,
            text: assistantMessage.content,
            toolResults: assistantMessage.toolResults,
            pendingUser: null,
          });
          break;
        }
        case 'text_delta': {
          if (event.messageId !== getStream(conversationId).assistantId) return;
          buffer += event.delta;
          scheduleFlush();
          break;
        }
        case 'tool_result': {
          flush();
          patch(conversationId, (s) => ({ toolResults: [...s.toolResults, event.result] }));
          break;
        }
        case 'message_end': {
          flush();
          terminal = true;
          upsertMessages(qc, conversationId, [event.message]);
          setCachedConversation(qc, event.conversation);
          upsertConversationInLists(qc, event.conversation);
          patch(conversationId, {
            phase: 'idle',
            assistantId: null,
            text: '',
            toolResults: [],
            error: null,
            pendingUser: null,
          });
          const summary = event.message.content.replace(/[#*_`>|-]+/g, ' ').replace(/\s+/g, ' ').trim();
          useAnnouncer
            .getState()
            .announce(`Keyring replied: ${summary.slice(0, 220)}${summary.length > 220 ? '…' : ''}`);
          break;
        }
        case 'error': {
          terminal = true;
          fail({
            kind: event.code === 'rate_limited' ? 'rate_limited' : event.code === 'bad_request' ? 'bad_request' : 'provider',
            message: event.message,
            retryable: event.retryable,
            retryAt: event.retryAfterMs ? now() + event.retryAfterMs : null,
          });
          break;
        }
        default: {
          const exhaustive: never = event;
          return exhaustive;
        }
      }
    };

    try {
      if (options.ensureConversation) {
        await api.createConversation({ id: conversationId }).catch((err: unknown) => {
          if (!(err instanceof ApiError && err.status === 409)) throw err; // 409: already created
        });
      }

      const res = await doFetch(apiUrl(`/api/conversations/${encodeURIComponent(conversationId)}/messages`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw await toApiError(res);
      if (!res.body) throw new ApiError(0, 'no_body', 'The server returned an empty response.');

      const parser = createSseParser((message) => {
        const parsed = parseStreamEvent(message);
        if (!parsed.ok) {
          // A malformed event is skipped rather than killing the whole reply.
          console.warn(`[keyring] ignored ${parsed.reason} stream event`, parsed.detail);
          return;
        }
        handle(parsed.event);
      });
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.feed(decoder.decode(value, { stream: true }));
      }
      parser.feed(decoder.decode());

      if (!terminal) {
        fail({
          kind: isOnline() ? 'network' : 'offline',
          message: 'The connection dropped before the reply finished.',
          retryable: true,
          retryAt: null,
        });
      }
    } catch (err) {
      const reason: unknown = controller.signal.reason;
      if (controller.signal.aborted && reason === SUPERSEDED) return;
      if (controller.signal.aborted && reason === STOP) {
        flush();
        const s = getStream(conversationId);
        if (s.assistantId) {
          patchMessage(qc, conversationId, s.assistantId, {
            status: 'stopped',
            content: s.text,
            toolResults: s.toolResults,
          });
        }
        patch(conversationId, { phase: 'idle', assistantId: null, text: '', toolResults: [], pendingUser: null, error: null });
        // Re-sync once the server has processed the abort (title, and messages created before
        // message_start). A refetch racing the abort is harmless: rows that the server still
        // reports as 'streaming' but aren't this tab's live stream render as stopped.
        resyncSoon(true);
        return;
      }
      if (err instanceof ApiError && err.status > 0) {
        fail({
          kind:
            err.status === 429 ? 'rate_limited' : err.status >= 500 ? 'server' : 'bad_request',
          message: err.message,
          retryable: err.status === 429 || err.status >= 500,
          retryAt: err.retryAfterMs ? now() + err.retryAfterMs : null,
        });
        return;
      }
      fail({
        kind: isOnline() ? 'network' : 'offline',
        message: isOnline()
          ? 'Couldn’t reach Keyring. Check your connection and try again.'
          : 'You’re offline. The reply will resume when you reconnect.',
        retryable: true,
        retryAt: null,
      });
    } finally {
      if (frame !== null) cancelFrame(frame);
      if (controllers.get(conversationId) === controller) controllers.delete(conversationId);
    }
  }

  return {
    start,
    stop(conversationId: string) {
      controllers.get(conversationId)?.abort(STOP);
    },
    isActive(conversationId: string) {
      return controllers.has(conversationId);
    },
    stopAll() {
      for (const c of controllers.values()) c.abort(STOP);
    },
  };
}
