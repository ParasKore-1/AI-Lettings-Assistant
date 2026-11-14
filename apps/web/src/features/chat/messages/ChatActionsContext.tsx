import type { Feedback, Message } from '@keyring/shared';
import { createContext, useContext } from 'react';

/**
 * Actions available to message rows. Provided once per conversation with
 * stable identities, so memoised rows don't re-render when the list does.
 */
export interface ChatRowActions {
  conversationId: string;
  readOnly: boolean;
  regenerate: (userMessageId: string) => void;
  resume: (assistantMessageId: string) => void;
  retry: () => void;
  editAndResend: (message: Message, content: string) => void;
  /** Shows the previous/next sibling branch of this message. */
  stepSibling: (message: Message, delta: -1 | 1) => void;
  setFeedback: (messageId: string, feedback: Feedback) => void;
  /** Sends a follow-up at the end of the visible thread (used by card buttons). */
  sendFollowUp: (text: string) => void;
}

const noop = () => undefined;

export const READ_ONLY_ACTIONS: ChatRowActions = {
  conversationId: '',
  readOnly: true,
  regenerate: noop,
  resume: noop,
  retry: noop,
  editAndResend: noop,
  stepSibling: noop,
  setFeedback: noop,
  sendFollowUp: noop,
};

export const ChatActionsContext = createContext<ChatRowActions>(READ_ONLY_ACTIONS);
export const useChatActions = () => useContext(ChatActionsContext);
