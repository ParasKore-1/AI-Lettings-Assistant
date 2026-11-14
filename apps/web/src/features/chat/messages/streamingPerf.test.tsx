/**
 * Streaming render-cost benchmark (numbers are recorded in DECISIONS.md).
 *
 * Streams 200 tokens into the last reply of a 40-message conversation and
 * counts component renders three ways:
 *   A. naive     – reply text lives in the message list state; rows not memoised
 *   B. isolated  – real MessageRow (memo) + only the streaming body subscribes
 *   C. batched   – B plus the engine's rAF batching (tokens arrive ~4 per frame)
 */
import type { Message } from '@keyring/shared';
import { act, render } from '@testing-library/react';
import { memo, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { startProfiling, stopProfiling } from '../../../lib/profiling';
import { useStreamStore } from '../stream/streamStore';
import { ChatActionsContext, READ_ONLY_ACTIONS } from './ChatActionsContext';
import { MessageRow } from './MessageBubble';

const CID = 'perf';
const TOKENS = Array.from({ length: 200 }, (_, i) => `tok${i} `);
const TOKENS_PER_FRAME = 4;

function makeHistory(): Message[] {
  const out: Message[] = [];
  for (let i = 0; i < 20; i++) {
    const base = { conversationId: CID, toolResults: [], attachments: [], feedback: null, error: null, model: null };
    out.push({ ...base, id: `u${i}`, parentId: i ? `a${i - 1}` : null, role: 'user', content: `Question ${i}`, status: 'complete', createdAt: new Date(i * 2000).toISOString() });
    out.push({ ...base, id: `a${i}`, parentId: `u${i}`, role: 'assistant', content: `Answer **${i}** with a [link](https://example.com).`, status: 'complete', createdAt: new Date(i * 2000 + 1000).toISOString() });
  }
  out[out.length - 1] = { ...out[out.length - 1]!, content: '', status: 'streaming' };
  return out;
}

const actions = { ...READ_ONLY_ACTIONS, conversationId: CID, readOnly: false };

/* A: the naive approach — the whole list re-renders for every token. */
let naiveRenders = 0;
function NaiveRow({ message }: { message: Message }) {
  naiveRenders++;
  return <p>{message.content}</p>;
}
let pushNaive: (t: string) => void = () => undefined;
function NaiveList({ initial }: { initial: Message[] }) {
  const [messages, setMessages] = useState(initial);
  pushNaive = (t) =>
    setMessages((list) => list.map((m, i) => (i === list.length - 1 ? { ...m, content: m.content + t } : m)));
  return (
    <>
      {messages.map((m) => (
        <NaiveRow key={m.id} message={m} />
      ))}
    </>
  );
}

/* B/C: the real rows. The list itself never re-renders during streaming. */
const RealList = memo(function RealList({ messages }: { messages: Message[] }) {
  return (
    <ChatActionsContext.Provider value={actions}>
      {messages.map((m) => (
        <MessageRow key={m.id} message={m} siblingIndex={0} siblingTotal={1} canEdit={false} />
      ))}
    </ChatActionsContext.Provider>
  );
});

function rowRenders(map: Map<string, number>) {
  let total = 0;
  for (const [k, v] of map) if (k.startsWith('row:')) total += v;
  return total;
}

afterEach(() => {
  stopProfiling();
  useStreamStore.setState({ streams: {} });
});

describe('streaming render cost', () => {
  it('only the streaming body re-renders, and rAF batching divides that by tokens-per-frame', () => {
    const history = makeHistory();
    const streamingId = history[history.length - 1]!.id;

    // A — naive
    render(<NaiveList initial={history} />);
    naiveRenders = 0;
    for (const t of TOKENS) act(() => pushNaive(t));
    const naivePerToken = naiveRenders / TOKENS.length;

    // B — isolated subscription, one commit per token (no batching)
    useStreamStore.getState().patch(CID, { phase: 'streaming', assistantId: streamingId, text: '' });
    const b = startProfiling();
    const { unmount } = render(<RealList messages={history} />);
    const mountRows = rowRenders(b);
    b.clear();
    for (const t of TOKENS) act(() => useStreamStore.getState().patch(CID, (s) => ({ text: s.text + t })));
    const isolatedRows = rowRenders(b);
    const isolatedBody = b.get('streaming-body') ?? 0;
    unmount();

    // C — isolated + rAF batching (engine commits once per frame)
    useStreamStore.getState().patch(CID, { text: '' });
    const c = startProfiling();
    render(<RealList messages={history} />);
    c.clear();
    for (let i = 0; i < TOKENS.length; i += TOKENS_PER_FRAME) {
      const chunk = TOKENS.slice(i, i + TOKENS_PER_FRAME).join('');
      act(() => useStreamStore.getState().patch(CID, (s) => ({ text: s.text + chunk })));
    }
    const batchedBody = c.get('streaming-body') ?? 0;
    const batchedRows = rowRenders(c);

    console.info(
      [
        `[perf] ${history.length} messages, ${TOKENS.length} tokens`,
        `  A naive:    ${naiveRenders} row renders → ${naivePerToken.toFixed(1)} per token`,
        `  B isolated: ${isolatedRows} row renders, ${isolatedBody} streaming-body renders → ${(isolatedBody / TOKENS.length).toFixed(2)} per token (mount: ${mountRows})`,
        `  C batched:  ${batchedRows} row renders, ${batchedBody} streaming-body renders → ${(batchedBody / TOKENS.length).toFixed(2)} per token`,
      ].join('\n'),
    );

    expect(naivePerToken).toBe(history.length); // every row, every token
    expect(isolatedRows).toBe(0); // memoised rows never re-render while streaming
    expect(isolatedBody).toBe(TOKENS.length);
    expect(batchedRows).toBe(0);
    expect(batchedBody).toBe(TOKENS.length / TOKENS_PER_FRAME);
  });
});
