import type { Attachment, Message } from '@keyring/shared';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useSettings } from '../../../stores/settings';
import { getCachedMessage } from '../../conversations/cache';
import type { ChatEngine } from './chatEngine';
import { getStream, useStreamStore } from './streamStore';

export const ChatEngineContext = createContext<ChatEngine | null>(null);

export function useChatEngine(): ChatEngine {
  const engine = useContext(ChatEngineContext);
  if (!engine) throw new Error('ChatEngineContext is missing');
  return engine;
}

/**
 * Per-conversation chat controller: send, stop, retry, regenerate,
 * edit-and-resend and resume. State lives in the stream store; this hook only
 * wires actions (all callbacks are stable for a given conversation).
 */
export function useChatStream(conversationId: string) {
  const engine = useChatEngine();
  const qc = useQueryClient();
  const phase = useStreamStore((s) => s.streams[conversationId]?.phase ?? 'idle');
  const error = useStreamStore((s) => s.streams[conversationId]?.error ?? null);

  const settings = () => {
    const { model, mode } = useSettings.getState();
    return { ...(model ? { model } : {}), mode };
  };

  const send = useCallback(
    (
      content: string,
      opts: { attachments?: Attachment[]; parentId: string | null; ensureConversation?: boolean },
    ) => {
      const attachments = opts.attachments ?? [];
      return engine.start(
        conversationId,
        {
          intent: 'send',
          content,
          parentId: opts.parentId,
          attachmentIds: attachments.map((a) => a.id),
          ...settings(),
        },
        {
          pendingUser: { content, attachments, parentId: opts.parentId, createdAt: new Date().toISOString() },
          ensureConversation: opts.ensureConversation ?? false,
        },
      );
    },
    [engine, conversationId],
  );

  const stop = useCallback(() => engine.stop(conversationId), [engine, conversationId]);

  const resume = useCallback(
    (assistantMessageId: string) =>
      engine.start(conversationId, { intent: 'resume', assistantMessageId, ...settings() }),
    [engine, conversationId],
  );

  const regenerate = useCallback(
    (userMessageId: string) =>
      engine.start(conversationId, { intent: 'regenerate', userMessageId, ...settings() }),
    [engine, conversationId],
  );

  /** Edit-and-resend creates a sibling of the edited message (a new branch). */
  const editAndResend = useCallback(
    (message: Message, content: string) =>
      send(content, { attachments: message.attachments, parentId: message.parentId }),
    [send],
  );

  const retry = useCallback(() => {
    const s = getStream(conversationId);
    if (s.error?.retryAt && Date.now() < s.error.retryAt) return;
    const assistant = s.assistantId ? getCachedMessage(qc, conversationId, s.assistantId) : undefined;
    if (assistant && (assistant.status === 'error' || assistant.status === 'stopped')) {
      // Mid-stream failure: continue the same reply, keeping its partial text.
      return resume(assistant.id);
    }
    if (s.lastRequest) {
      return engine.start(conversationId, s.lastRequest.body, {
        pendingUser: s.pendingUser,
        ensureConversation: s.lastRequest.ensureConversation,
      });
    }
  }, [engine, conversationId, qc, resume]);

  const discardPending = useCallback(
    () => useStreamStore.getState().reset(conversationId),
    [conversationId],
  );

  // Reconnect: if the stream failed because we went offline, resume when back online.
  useEffect(() => {
    if (phase !== 'error' || error?.kind !== 'offline') return;
    const onOnline = () => void retry();
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [phase, error, retry]);

  return useMemo(
    () => ({ phase, error, send, stop, retry, resume, regenerate, editAndResend, discardPending }),
    [phase, error, send, stop, retry, resume, regenerate, editAndResend, discardPending],
  );
}

export type ChatController = ReturnType<typeof useChatStream>;
