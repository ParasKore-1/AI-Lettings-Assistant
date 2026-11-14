import type { ModelInfo } from '@keyring/shared';
import { createRng, hashString, sleep } from '../lib/util';
import { buildMockScript, type Segment } from './mockScripts';
import type { ChatProvider, ProviderEvent, ProviderInput } from './types';

export const MOCK_MODEL_ID = 'keyring-mock';

/**
 * Splits text into LLM-ish tokens: words with their trailing whitespace,
 * long words broken into 3–6 character pieces.
 */
export function tokenize(text: string, rng: ReturnType<typeof createRng>): string[] {
  const words = text.match(/\S+\s*|\s+/g) ?? [];
  const tokens: string[] = [];
  for (const w of words) {
    if (w.length <= 7) {
      tokens.push(w);
      continue;
    }
    let i = 0;
    while (i < w.length) {
      const size = rng.int(3, 6);
      tokens.push(w.slice(i, i + size));
      i += size;
    }
  }
  return tokens;
}

export function createMockProvider(opts: { speed: number }): ChatProvider {
  const models: ModelInfo[] = [
    {
      id: MOCK_MODEL_ID,
      label: 'Keyring Mock',
      description: 'Scripted lettings answers streamed token by token. Free, no API key.',
      provider: 'mock',
    },
  ];

  return {
    id: 'mock',
    models,
    async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
      const user = input.history[input.history.length - 1];
      const userText = user?.role === 'user' ? user.content : '';
      // Seed from the assistant message id so a resumed reply regenerates the same script.
      const script = buildMockScript({
        userText,
        attachments: user?.attachments ?? [],
        seed: input.assistantMessageId,
      });
      const rng = createRng(hashString(input.assistantMessageId + ':timing'));
      const pace = input.mode === 'fast' ? 0.4 : input.mode === 'thorough' ? 1.4 : 1;
      const delay = (min: number, max: number) => rng.int(min, max) * pace * opts.speed;

      // Time to first token.
      await sleep(delay(250, 600), input.signal);

      let emitted = 0; // characters of text produced so far (including resumed prefix)
      const skip = input.prefix.length;
      const alreadyHaveTools = new Set(input.existingToolResults.map((t) => t.id));

      for (const segment of script.segments as Segment[]) {
        if ('tool' in segment) {
          if (alreadyHaveTools.has(segment.tool.id)) continue;
          await sleep(delay(300, 700), input.signal); // "calling a tool"
          yield { type: 'tool_result', result: segment.tool };
          continue;
        }
        const tokens = tokenize(segment.text, rng);
        let i = 0;
        while (i < tokens.length) {
          // Emit 1–3 tokens per delta, like real providers batching on the wire.
          const n = rng.int(1, 3);
          let chunk = tokens.slice(i, i + n).join('');
          i += n;
          const start = emitted;
          emitted += chunk.length;
          if (emitted <= skip) continue; // already sent before the interruption
          if (start < skip) chunk = chunk.slice(skip - start);
          await sleep(delay(12, 45), input.signal);
          yield { type: 'text', delta: chunk };
        }
      }
    },
  };
}
