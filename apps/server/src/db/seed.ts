/**
 * Seeds demo conversations spread across the sidebar date groups, plus one
 * 600-message conversation for exercising virtualisation.
 *   pnpm seed            # adds demo data
 *   pnpm seed --reset    # wipes the database first
 */
import { rmSync } from 'node:fs';
import type { ToolResult } from '@keyring/shared';
import { loadEnv } from '../env';
import { buildMockScript } from '../providers/mockScripts';
import { MOCK_MODEL_ID } from '../providers/mock';
import { openDatabase } from './database';
import { createRepository, type Repository } from './repository';

const DAY = 86_400_000;

export function seedDemoData(repo: Repository, now = Date.now()) {
  const make = (title: string, daysAgo: number, prompts: string[], pinned = false) => {
    let t = now - daysAgo * DAY - 3_600_000;
    const at = () => new Date((t += 45_000)).toISOString();
    const convo = repo.createConversation({ title, createdAt: at() });
    let parentId: string | null = null;
    for (const prompt of prompts) {
      const user = repo.createMessage({
        conversationId: convo.id,
        parentId,
        role: 'user',
        content: prompt,
        status: 'complete',
        createdAt: at(),
      });
      const script = buildMockScript({ userText: prompt, attachments: [], seed: `${convo.id}:${user.id}` });
      let text = '';
      const tools: ToolResult[] = [];
      for (const s of script.segments) {
        if ('text' in s) text += s.text;
        else tools.push({ ...s.tool, offset: text.length });
      }
      const reply = repo.createMessage({
        conversationId: convo.id,
        parentId: user.id,
        role: 'assistant',
        content: text,
        status: 'complete',
        model: MOCK_MODEL_ID,
        toolResults: tools,
        createdAt: at(),
      });
      parentId = reply.id;
    }
    repo.updateConversation(convo.id, { pinned });
    // updated_at = time of last message
    return convo;
  };

  make('Deposit protection rules', 0, ['What deposit protection rules apply?'], true);
  make('Booking a viewing', 0, ['Find me a 2-bed flat in Bristol', 'Book a viewing for Wrenfield Road']);
  make('Maintenance request', 1, ['My boiler has stopped working and there is no hot water']);
  make('Rent reminder draft', 3, ['/rent-reminder for Flat 4, rent is 10 days late']);
  make('Landlord compliance checklist', 5, ['What compliance checklist do I need — gas safety, EICR, EPC?']);
  make('Pro-rata rent calculation', 12, ['How do I calculate pro-rata rent? Show me code']);
  make('HTML sanitisation demo', 20, ['Show me how you handle raw HTML and an XSS script tag']);

  const prompts = Array.from({ length: 300 }, (_, i) =>
    ['Hello', 'What deposit protection rules apply?', 'Find me a studio in Manchester', 'Explain the renting journey in detail', 'How do I calculate pro-rata rent?'][i % 5]!,
  );
  make('Long conversation (600 messages)', 30, prompts);
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('db/seed.ts');
if (isMain) {
  try {
    process.loadEnvFile();
  } catch {
    /* optional */
  }
  const env = loadEnv();
  if (process.argv.includes('--reset') && env.DATABASE_PATH !== ':memory:') {
    for (const suffix of ['', '-wal', '-shm']) rmSync(env.DATABASE_PATH + suffix, { force: true });
  }
  const repo = createRepository(openDatabase(env.DATABASE_PATH));
  seedDemoData(repo);
  console.info(`[seed] demo data written to ${env.DATABASE_PATH}`);
}
