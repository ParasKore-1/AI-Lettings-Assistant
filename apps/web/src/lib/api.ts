import {
  ApiErrorSchema,
  AttachmentSchema,
  ConversationPageSchema,
  ConversationSchema,
  ConversationWithMessagesSchema,
  MessageSchema,
  ModelsResponseSchema,
  type Attachment,
  type Conversation,
  type ConversationPage,
  type ConversationWithMessages,
  type CreateConversationBody,
  type DebugBody,
  type Message,
  type ModelsResponse,
  type PatchConversationBody,
  type PatchMessageBody,
} from '@keyring/shared';
import type { ZodTypeAny, z } from 'zod';
import { apiUrl } from '../env';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Converts a non-2xx Response into a typed ApiError (shared with the streaming hook). */
export async function toApiError(res: Response): Promise<ApiError> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body */
  }
  const parsed = ApiErrorSchema.safeParse(body);
  const headerRetry = Number(res.headers.get('retry-after'));
  const retryAfterMs = parsed.success
    ? parsed.data.error.retryAfterMs
    : Number.isFinite(headerRetry) && headerRetry > 0
      ? headerRetry * 1000
      : undefined;
  return new ApiError(
    res.status,
    parsed.success ? parsed.data.error.code : `http_${res.status}`,
    parsed.success ? parsed.data.error.message : `Request failed (${res.status})`,
    retryAfterMs,
  );
}

async function request<S extends ZodTypeAny>(
  path: string,
  schema: S | null,
  init: RequestInit = {},
): Promise<z.output<S>> {
  const res = await fetch(apiUrl(path), {
    ...init,
    headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) throw await toApiError(res);
  if (!schema || res.status === 204) return undefined as z.output<S>;
  return schema.parse(await res.json());
}

const body = (value: unknown) => JSON.stringify(value);

export const api = {
  listConversations: (params: { cursor?: string | undefined; q?: string | undefined; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params.cursor) qs.set('cursor', params.cursor);
    if (params.q) qs.set('q', params.q);
    qs.set('limit', String(params.limit ?? 30));
    return request(`/api/conversations?${qs}`, ConversationPageSchema) as Promise<ConversationPage>;
  },
  getConversation: (id: string, signal?: AbortSignal) =>
    request(`/api/conversations/${encodeURIComponent(id)}`, ConversationWithMessagesSchema, {
      ...(signal ? { signal } : {}),
    }) as Promise<ConversationWithMessages>,
  createConversation: (input: CreateConversationBody) =>
    request('/api/conversations', ConversationSchema, { method: 'POST', body: body(input) }) as Promise<Conversation>,
  patchConversation: (id: string, patch: PatchConversationBody) =>
    request(`/api/conversations/${encodeURIComponent(id)}`, ConversationSchema, {
      method: 'PATCH',
      body: body(patch),
    }) as Promise<Conversation>,
  deleteConversation: (id: string) =>
    request(`/api/conversations/${encodeURIComponent(id)}`, null, { method: 'DELETE' }) as Promise<void>,
  restoreConversation: (id: string) =>
    request(`/api/conversations/${encodeURIComponent(id)}/restore`, ConversationSchema, {
      method: 'POST',
    }) as Promise<Conversation>,
  patchMessage: (id: string, patch: PatchMessageBody) =>
    request(`/api/messages/${encodeURIComponent(id)}`, MessageSchema, {
      method: 'PATCH',
      body: body(patch),
    }) as Promise<Message>,
  getShared: (id: string) =>
    request(`/api/share/${encodeURIComponent(id)}`, ConversationWithMessagesSchema) as Promise<ConversationWithMessages>,
  getModels: () => request('/api/models', ModelsResponseSchema) as Promise<ModelsResponse>,
  setDebug: (input: DebugBody) => request('/api/debug', null, { method: 'POST', body: body(input) }),
};

/**
 * Uploads with XMLHttpRequest because fetch() still has no upload progress events.
 * Returns an abort function alongside the promise.
 */
export function uploadAttachment(
  file: File,
  onProgress: (fraction: number) => void,
): { promise: Promise<Attachment>; abort: () => void } {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<Attachment>((resolve, reject) => {
    xhr.open('POST', apiUrl('/api/attachments'));
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const parsed = AttachmentSchema.safeParse(xhr.response);
        if (parsed.success) resolve(parsed.data);
        else reject(new ApiError(xhr.status, 'bad_response', 'Unexpected upload response'));
        return;
      }
      const err = ApiErrorSchema.safeParse(xhr.response);
      reject(
        new ApiError(
          xhr.status,
          err.success ? err.data.error.code : `http_${xhr.status}`,
          err.success ? err.data.error.message : 'Upload failed',
        ),
      );
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Network error while uploading'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}
