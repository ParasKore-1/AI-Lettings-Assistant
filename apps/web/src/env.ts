import { z } from 'zod';

/** The only place that reads import.meta.env. Validated once at startup. */
const EnvSchema = z.object({
  VITE_API_URL: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\//.test(v), 'VITE_API_URL must be empty or an http(s) URL')
    .transform((v) => v.replace(/\/+$/, ''))
    .default(''),
  MODE: z.string(),
  DEV: z.boolean(),
});

const parsed = EnvSchema.safeParse(import.meta.env);
if (!parsed.success) {
  throw new Error(`Invalid web environment: ${parsed.error.issues.map((i) => i.message).join('; ')}`);
}

export const env = {
  apiUrl: parsed.data.VITE_API_URL,
  isDev: parsed.data.DEV,
  mode: parsed.data.MODE,
} as const;

/** Resolves an API path (e.g. "/api/attachments/f_1") against the configured API origin. */
export const apiUrl = (path: string) => (/^https?:\/\//.test(path) ? path : `${env.apiUrl}${path}`);
