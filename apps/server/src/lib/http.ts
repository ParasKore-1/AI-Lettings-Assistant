import type { ApiError } from '@keyring/shared';
import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ZodTypeAny, z } from 'zod';

export function apiError(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  retryAfterMs?: number,
) {
  const body: ApiError = { error: { code, message, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) } };
  if (retryAfterMs !== undefined) c.header('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
  return c.json(body, status);
}

export async function parseJson<S extends ZodTypeAny>(
  c: Context,
  schema: S,
): Promise<{ ok: true; data: z.output<S> } | { ok: false; message: string }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return { ok: false, message: 'Request body must be valid JSON' };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
    };
  }
  return { ok: true, data: parsed.data };
}

export function clientKey(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  if (forwarded) return forwarded;
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? 'local';
}
