import { DebugBodySchema, type ModelsResponse } from '@keyring/shared';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { openDatabase } from './db/database';
import { createRepository, type Repository } from './db/repository';
import type { Env } from './env';
import { createDebugState, type DebugState } from './lib/debug';
import { apiError, parseJson } from './lib/http';
import { createRateLimiter } from './lib/rateLimit';
import { createProviderRegistry, type ProviderRegistry } from './providers/registry';
import { conversationRoutes } from './routes/conversations';
import { streamRoutes } from './routes/stream';

export interface AppDeps {
  env: Env;
  repo: Repository;
  registry: ProviderRegistry;
  debug: DebugState;
  limiter: ReturnType<typeof createRateLimiter>;
}

export function createDeps(env: Env, overrides: Partial<AppDeps> = {}): AppDeps {
  const repo = overrides.repo ?? createRepository(openDatabase(env.DATABASE_PATH));
  return {
    env,
    repo,
    registry: overrides.registry ?? createProviderRegistry(env),
    debug: overrides.debug ?? createDebugState(env.debugEnabled),
    limiter: overrides.limiter ?? createRateLimiter(env.RATE_LIMIT_PER_MINUTE),
  };
}

export function createApp(deps: AppDeps) {
  const app = new Hono();
  const origins = deps.env.WEB_ORIGIN.split(',').map((o) => o.trim());

  app.use('*', secureHeaders({ crossOriginResourcePolicy: 'cross-origin' }));
  app.use(
    '/api/*',
    cors({
      origin: origins.includes('*') ? '*' : origins,
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'x-keyring-debug'],
      exposeHeaders: ['Retry-After'],
      maxAge: 600,
    }),
  );
  app.use('/api/conversations/*', bodyLimit({ maxSize: 64 * 1024 }));

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/api/models', (c) => {
    const body: ModelsResponse = {
      models: deps.registry.models,
      defaultModel: deps.registry.defaultModel,
      debugEnabled: deps.debug.enabled,
    };
    return c.json(body);
  });

  if (deps.debug.enabled) {
    app.get('/api/debug', (c) => c.json(deps.debug.get()));
    app.post('/api/debug', async (c) => {
      const body = await parseJson(c, DebugBodySchema);
      if (!body.ok) return apiError(c, 400, 'bad_request', body.message);
      deps.debug.set(body.data.mode, body.data.once);
      return c.json(deps.debug.get());
    });
  }

  app.route('/api', conversationRoutes(deps));
  app.route('/api', streamRoutes(deps));

  app.notFound((c) => apiError(c, 404, 'not_found', 'Route not found'));
  app.onError((err, c) => {
    console.error('[server] unhandled error', err);
    return apiError(c, 500, 'internal', 'Internal server error');
  });

  return app;
}
