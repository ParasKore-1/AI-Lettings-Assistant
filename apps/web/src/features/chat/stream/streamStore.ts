import type { Attachment, SendMessageBody, ToolResult } from '@keyring/shared';
import { create } from 'zustand';

export type StreamPhase = 'idle' | 'sending' | 'streaming' | 'error';
export type StreamErrorKind = 'network' | 'offline' | 'server' | 'rate_limited' | 'provider' | 'bad_request';

export interface StreamError {
  kind: StreamErrorKind;
  message: string;
  retryable: boolean;
  /** Epoch ms before which retrying is pointless (rate limits). */
  retryAt: number | null;
}

/** A user message shown optimistically before the server confirms it. */
export interface PendingUser {
  content: string;
  attachments: Attachment[];
  parentId: string | null;
  createdAt: string;
}

export interface ConversationStream {
  phase: StreamPhase;
  /** The assistant message receiving tokens (also kept after an error for resume). */
  assistantId: string | null;
  /** Live text of the streaming reply, flushed once per animation frame. */
  text: string;
  toolResults: ToolResult[];
  pendingUser: PendingUser | null;
  error: StreamError | null;
  lastRequest: { body: SendMessageBody; ensureConversation: boolean } | null;
}

export const IDLE_STREAM: ConversationStream = Object.freeze({
  phase: 'idle',
  assistantId: null,
  text: '',
  toolResults: [],
  pendingUser: null,
  error: null,
  lastRequest: null,
}) as ConversationStream;

interface StreamStoreState {
  streams: Record<string, ConversationStream>;
  patch: (
    conversationId: string,
    update: Partial<ConversationStream> | ((s: ConversationStream) => Partial<ConversationStream>),
  ) => void;
  reset: (conversationId: string) => void;
}

export const useStreamStore = create<StreamStoreState>()((set) => ({
  streams: {},
  patch: (id, update) =>
    set((state) => {
      const current = state.streams[id] ?? IDLE_STREAM;
      const next = typeof update === 'function' ? update(current) : update;
      return { streams: { ...state.streams, [id]: { ...current, ...next } } };
    }),
  reset: (id) =>
    set((state) => {
      const rest = { ...state.streams };
      delete rest[id];
      return { streams: rest };
    }),
}));

export const getStream = (id: string) => useStreamStore.getState().streams[id] ?? IDLE_STREAM;

/* Narrow selectors so components re-render only for the slice they show. */
export const useStreamPhase = (id: string) => useStreamStore((s) => (s.streams[id] ?? IDLE_STREAM).phase);
export const useStreamText = (id: string) => useStreamStore((s) => (s.streams[id] ?? IDLE_STREAM).text);
export const useStreamToolResults = (id: string) =>
  useStreamStore((s) => (s.streams[id] ?? IDLE_STREAM).toolResults);
export const useStreamError = (id: string) => useStreamStore((s) => (s.streams[id] ?? IDLE_STREAM).error);
export const useStreamAssistantId = (id: string) =>
  useStreamStore((s) => (s.streams[id] ?? IDLE_STREAM).assistantId);
export const usePendingUser = (id: string) => useStreamStore((s) => (s.streams[id] ?? IDLE_STREAM).pendingUser);

/* Screen-reader announcements for completed replies (not per token). */
interface AnnouncerState {
  messages: { id: number; text: string }[];
  announce: (text: string) => void;
}
let announceId = 0;
export const useAnnouncer = create<AnnouncerState>()((set) => ({
  messages: [],
  announce: (text) => set((s) => ({ messages: [...s.messages.slice(-4), { id: ++announceId, text }] })),
}));
