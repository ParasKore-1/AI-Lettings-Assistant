import type { ToolResult } from '@keyring/shared';

export type ReplySegment = { kind: 'text'; text: string; key: string } | { kind: 'tool'; result: ToolResult; key: string };

/**
 * Interleaves reply text with tool-result cards at the offsets where the
 * server emitted them. Cards without an offset go after the text.
 */
export function buildSegments(text: string, toolResults: readonly ToolResult[]): ReplySegment[] {
  if (toolResults.length === 0) return text ? [{ kind: 'text', text, key: 't0' }] : [];
  const sorted = [...toolResults].sort((a, b) => (a.offset ?? Infinity) - (b.offset ?? Infinity));
  const out: ReplySegment[] = [];
  let cursor = 0;
  sorted.forEach((result, i) => {
    const at = Math.min(result.offset ?? text.length, text.length);
    if (at > cursor) {
      out.push({ kind: 'text', text: text.slice(cursor, at), key: `t${cursor}` });
      cursor = at;
    }
    out.push({ kind: 'tool', result, key: `tool-${result.id}-${i}` });
  });
  if (cursor < text.length) out.push({ kind: 'text', text: text.slice(cursor), key: `t${cursor}` });
  return out;
}
