/**
 * Splits Markdown into top-level blocks at blank lines, never inside a fenced
 * code block and never before an indented continuation line. While a reply
 * streams only the final block changes, so memoised earlier blocks skip
 * re-parsing — Markdown cost per frame stays O(last block), not O(message).
 */
export function splitMarkdownBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    if (current.length > 0 && current.some((l) => l.trim() !== '')) blocks.push(current.join('\n'));
    current = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const fenceMatch = /^\s{0,3}(`{3,}|~{3,})/.exec(line);
    if (fenceMatch) {
      const marker = fenceMatch[1]!;
      if (fence === null) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      current.push(line);
      continue;
    }
    if (fence === null && line.trim() === '') {
      const next = lines.slice(i + 1).find((l) => l.trim() !== '');
      const continues = next !== undefined && /^\s+\S/.test(next);
      if (!continues) {
        flush();
        continue;
      }
    }
    current.push(line);
  }
  flush();
  return blocks;
}
