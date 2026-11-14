import type { ModelInfo } from '@keyring/shared';
import type { Env } from '../env';
import { createAnthropicProvider } from './anthropic';
import { createMockProvider, MOCK_MODEL_ID } from './mock';
import type { ChatProvider } from './types';

export interface ProviderRegistry {
  models: ModelInfo[];
  defaultModel: string;
  resolve(modelId: string | undefined): { provider: ChatProvider; model: string };
}

export function createProviderRegistry(env: Env): ProviderRegistry {
  const providers: ChatProvider[] = [createMockProvider({ speed: env.MOCK_SPEED })];
  if (env.ANTHROPIC_API_KEY) {
    providers.unshift(createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL }));
  }
  const byModel = new Map<string, ChatProvider>();
  for (const p of providers) for (const m of p.models) byModel.set(m.id, p);

  // Mock stays the default so the public demo never spends API credits unless chosen.
  const defaultModel = MOCK_MODEL_ID;

  return {
    models: providers.flatMap((p) => p.models),
    defaultModel,
    resolve(modelId) {
      const id = modelId && byModel.has(modelId) ? modelId : defaultModel;
      return { provider: byModel.get(id)!, model: id };
    },
  };
}
