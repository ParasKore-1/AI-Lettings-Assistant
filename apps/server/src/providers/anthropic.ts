import Anthropic from '@anthropic-ai/sdk';
import type { ModelInfo, ResponseMode } from '@keyring/shared';
import { z } from 'zod';
import {
  findProperty,
  maintenanceTicketResult,
  propertyCardsResult,
  searchProperties,
  viewingSlotsResult,
} from './fixtures';
import { ProviderError, type ChatProvider, type ProviderEvent, type ProviderInput } from './types';

const SYSTEM_PROMPT = `You are Keyring, a friendly, precise assistant for UK tenants, landlords and letting agents (focus on England unless told otherwise).
- Use concise GitHub-flavoured Markdown: short paragraphs, lists and tables where they help.
- Give general information, not legal advice; when rules matter, suggest checking GOV.UK.
- Property listings, viewing slots and maintenance tickets come only from your tools. All listings are fictional demo data; never invent real addresses.
- When the user wants homes, call search_properties. When they want to view a home, call get_viewing_slots. When they report a repair, call create_maintenance_ticket. The UI renders tool results as cards, so don't repeat every field in prose.`;

const EFFORT: Record<ResponseMode, 'low' | 'medium' | 'high'> = {
  fast: 'low',
  balanced: 'medium',
  thorough: 'high',
};

/** Models that accept server-side refusal fallbacks. */
const FALLBACK_MODELS = new Set(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-fable-5-2']);

const SearchInput = z.object({
  area: z.string().optional(),
  maxRentPcm: z.number().int().positive().optional(),
  minBeds: z.number().int().nonnegative().optional(),
});
const SlotsInput = z.object({ propertyId: z.string() });
const TicketInput = z.object({
  title: z.string().min(3).max(120),
  category: z.enum(['plumbing', 'heating', 'electrical', 'damp-mould', 'appliance', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'emergency']),
  description: z.string().min(3).max(1000),
  address: z.string().min(3).max(200),
});

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'search_properties',
    description:
      'Search the (fictional) Keyring listings. Returns up to 3 homes. All filters are optional.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'City or neighbourhood, e.g. "Bristol"' },
        maxRentPcm: { type: 'integer', description: 'Maximum monthly rent in GBP' },
        minBeds: { type: 'integer', description: 'Minimum bedrooms (0 = studio)' },
      },
    },
  },
  {
    name: 'get_viewing_slots',
    description: 'Get bookable 30-minute viewing slots for a property id returned by search_properties.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: { propertyId: { type: 'string' } },
      required: ['propertyId'],
    },
  },
  {
    name: 'create_maintenance_ticket',
    description: 'Log a repair or maintenance issue reported by a tenant and return the ticket.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        category: {
          type: 'string',
          enum: ['plumbing', 'heating', 'electrical', 'damp-mould', 'appliance', 'other'],
        },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'emergency'] },
        description: { type: 'string' },
        address: { type: 'string', description: 'Use "Flat 4, 27 Wrenfield Road" if unknown' },
      },
      required: ['title', 'category', 'priority', 'description', 'address'],
    },
  },
];

type MessageParam = Anthropic.Beta.BetaMessageParam;
type ContentBlockParam = Anthropic.Beta.BetaContentBlockParam;

/** Turns stored history into API messages, replaying native transcripts where we have them. */
function toApiMessages(input: ProviderInput): MessageParam[] {
  const messages: MessageParam[] = [];
  for (const m of input.history) {
    if (m.role === 'user') {
      const blocks: ContentBlockParam[] = [];
      for (const a of m.attachments) {
        const file = input.loadAttachment(a.id);
        if (!file) continue;
        const data = Buffer.from(file.data).toString('base64');
        if (file.mimeType === 'application/pdf') {
          blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } });
        } else {
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: file.mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp',
              data,
            },
          });
        }
      }
      blocks.push({ type: 'text', text: m.content });
      messages.push({ role: 'user', content: blocks });
    } else if (m.role === 'assistant') {
      const trace = TraceSchema.safeParse(m.providerTrace);
      // Replay the exact blocks (incl. thinking + tool turns) when this model produced them;
      // otherwise fall back to the visible text.
      if (trace.success && trace.data.model === input.model && m.status === 'complete') {
        messages.push(...(trace.data.messages as MessageParam[]));
      } else if (m.content.trim()) {
        messages.push({ role: 'assistant', content: m.content });
      }
    }
  }
  if (input.prefix.trim()) {
    messages.push({ role: 'assistant', content: input.prefix });
    messages.push({
      role: 'user',
      content:
        'Your previous reply was interrupted. Continue it exactly where it stopped, without repeating any text or adding a preamble.',
    });
  }
  return messages;
}

const TraceSchema = z.object({ model: z.string(), messages: z.array(z.unknown()) });

function mapError(err: unknown): ProviderError {
  if (err instanceof Anthropic.RateLimitError) {
    const retryAfter = Number(err.headers?.get?.('retry-after'));
    return new ProviderError(
      'rate_limited',
      'The model is receiving too many requests. Try again shortly.',
      true,
      Number.isFinite(retryAfter) ? retryAfter * 1000 : 10_000,
    );
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('provider_error', 'The server’s model credentials were rejected.', false);
  }
  if (err instanceof Anthropic.BadRequestError) {
    return new ProviderError('bad_request', `The model rejected the request: ${err.message}`, false);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new ProviderError('provider_error', 'Couldn’t reach the model provider.', true);
  }
  if (err instanceof Anthropic.APIError) {
    return new ProviderError('provider_error', `Model provider error (${err.status ?? 'unknown'}).`, true);
  }
  if (err instanceof ProviderError) return err;
  return new ProviderError('internal', err instanceof Error ? err.message : 'Unknown error', true);
}

export function createAnthropicProvider(opts: { apiKey: string; model: string }): ChatProvider {
  const client = new Anthropic({ apiKey: opts.apiKey });
  const models: ModelInfo[] = [
    {
      id: opts.model,
      label: opts.model === 'claude-opus-5-5' ? 'Claude Opus 5.5' : opts.model,
      description: 'Real model via the Anthropic API (server-side key).',
      provider: 'anthropic',
    },
  ];

  async function runTool(block: Anthropic.Beta.BetaToolUseBlock, seed: string) {
    switch (block.name) {
      case 'search_properties': {
        const parsed = SearchInput.safeParse(block.input);
        if (!parsed.success) return { error: parsed.error.message };
        const homes = searchProperties(parsed.data);
        return { card: propertyCardsResult(homes, `${seed}:${block.id}`), summary: homes };
      }
      case 'get_viewing_slots': {
        const parsed = SlotsInput.safeParse(block.input);
        if (!parsed.success) return { error: parsed.error.message };
        const property = findProperty(parsed.data.propertyId);
        if (!property) return { error: `Unknown propertyId ${parsed.data.propertyId}` };
        const card = viewingSlotsResult(property, `${seed}:${block.id}`);
        return { card, summary: card };
      }
      case 'create_maintenance_ticket': {
        const parsed = TicketInput.safeParse(block.input);
        if (!parsed.success) return { error: parsed.error.message };
        const card = maintenanceTicketResult(parsed.data, `${seed}:${block.id}`);
        return { card, summary: card };
      }
      default:
        return { error: `Unknown tool ${block.name}` };
    }
  }

  return {
    id: 'anthropic',
    models,
    async *stream(input: ProviderInput): AsyncIterable<ProviderEvent> {
      const messages = toApiMessages(input);
      const appended: MessageParam[] = [];
      const useFallbacks = FALLBACK_MODELS.has(input.model);
      let producedText = false;

      try {
        for (let turn = 0; turn < 6; turn++) {
          const stream = client.beta.messages.stream(
            {
              model: input.model,
              max_tokens: 16000,
              system: SYSTEM_PROMPT,
              output_config: { effort: EFFORT[input.mode] },
              tools: TOOLS,
              messages: [...messages, ...appended],
              ...(useFallbacks
                ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
                : {}),
            },
            { signal: input.signal },
          );

          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              producedText = true;
              yield { type: 'text', delta: event.delta.text };
            }
          }
          const message = await stream.finalMessage();

          if (message.stop_reason === 'refusal') {
            if (!producedText) {
              yield { type: 'text', delta: 'Sorry — I can’t help with that request.' };
            }
            return; // never persist a refused turn as a replayable trace
          }

          appended.push({ role: 'assistant', content: message.content as ContentBlockParam[] });
          const toolUses = message.content.filter(
            (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use',
          );
          if (toolUses.length === 0 || message.stop_reason !== 'tool_use') break;

          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const block of toolUses) {
            const outcome = await runTool(block, input.assistantMessageId);
            if ('error' in outcome) {
              results.push({ type: 'tool_result', tool_use_id: block.id, is_error: true, content: outcome.error ?? 'error' });
              continue;
            }
            yield { type: 'tool_result', result: outcome.card };
            results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(outcome.summary) });
          }
          appended.push({ role: 'user', content: results });
          if (producedText) yield { type: 'text', delta: '\n\n' };
        }
        if (!input.prefix) yield { type: 'trace', trace: { model: input.model, messages: appended } };
      } catch (err) {
        if (input.signal.aborted) throw err;
        throw mapError(err);
      }
    },
  };
}
