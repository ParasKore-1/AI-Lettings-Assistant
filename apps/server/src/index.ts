import { serve } from '@hono/node-server';
import { createApp, createDeps } from './app';
import { seedDemoData } from './db/seed';
import { loadEnv } from './env';

try {
  process.loadEnvFile();
} catch {
  // no .env file — rely on the real environment
}

const env = loadEnv();
const deps = createDeps(env);
const recovered = deps.repo.recoverInterruptedMessages();
if (env.SEED_ON_EMPTY && deps.repo.listConversations({ limit: 1 }).items.length === 0) {
  seedDemoData(deps.repo);
  console.info('[keyring] empty database: seeded demo conversations');
}
const app = createApp(deps);

const server = serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  const providers = deps.registry.models.map((m) => m.id).join(', ');
  console.info(`[keyring] API listening on http://localhost:${info.port}`);
  console.info(`[keyring] models: ${providers} · debug ${env.debugEnabled ? 'on' : 'off'}`);
  if (recovered > 0) console.info(`[keyring] marked ${recovered} interrupted replies as resumable`);
});

const shutdown = () => {
  server.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
