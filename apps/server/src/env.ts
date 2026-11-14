import { z } from 'zod';

const booleanish = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  WEB_ORIGIN: z.string().default('*'),
  DATABASE_PATH: z.string().default('./data/keyring.sqlite'),
  ENABLE_DEBUG: booleanish.optional(),
  /** Seed demo conversations when the database is empty (handy for a fresh deploy). */
  SEED_ON_EMPTY: booleanish.default('true'),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(20),
  /** Multiplies mock token delays; 0 makes the mock stream as fast as possible. */
  MOCK_SPEED: z.coerce.number().min(0).max(10).default(1),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-opus-5-5'),
});

export type Env = z.infer<typeof EnvSchema> & { debugEnabled: boolean };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // Treat empty strings (e.g. `ANTHROPIC_API_KEY=` in .env) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = EnvSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid server environment:\n${issues}`);
  }
  const env = parsed.data;
  return { ...env, debugEnabled: env.ENABLE_DEBUG ?? env.NODE_ENV !== 'production' };
}
