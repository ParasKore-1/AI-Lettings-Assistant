import type { ModelInfo, ResponseMode, StreamErrorCode, ToolResult } from '@keyring/shared';
import type { StoredMessage } from '../db/repository';

export interface ProviderInput {
  /** Root → current user message (inclusive), on the active branch only. */
  history: StoredMessage[];
  assistantMessageId: string;
  /** Text already generated for this reply (resume after stop/error). */
  prefix: string;
  /** Cards already emitted for this reply (resume). */
  existingToolResults: ToolResult[];
  model: string;
  mode: ResponseMode;
  signal: AbortSignal;
  loadAttachment: (id: string) => { mimeType: string; data: Uint8Array } | null;
}

export type ProviderEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_result'; result: ToolResult }
  /** Provider-native transcript persisted (server-side only) to replay history faithfully. */
  | { type: 'trace'; trace: unknown };

export interface ChatProvider {
  readonly id: 'mock' | 'anthropic';
  readonly models: ModelInfo[];
  stream(input: ProviderInput): AsyncIterable<ProviderEvent>;
}

export class ProviderError extends Error {
  constructor(
    readonly code: StreamErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ProviderError';
  }
}
