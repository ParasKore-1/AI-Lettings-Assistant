import { describe, expect, it } from 'vitest';
import { buildThread, indexChildren, pathTo, ROOT_KEY, siblingInfo, type TreeNode } from './thread';

const n = (id: string, parentId: string | null, t: number): TreeNode => ({
  id,
  parentId,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, t)).toISOString(),
});

// u1 → a1 → u2 → a2
//          ↘ u2b → a2b   (edit of u2, newer)
//    ↘ a1b (regenerate, newer)
const nodes = [
  n('u1', null, 1),
  n('a1', 'u1', 2),
  n('u2', 'a1', 3),
  n('a2', 'u2', 4),
  n('u2b', 'a1', 5),
  n('a2b', 'u2b', 6),
  n('a1b', 'u1', 7),
];

describe('thread helpers', () => {
  it('follows the newest branch by default', () => {
    expect(buildThread(nodes).map((x) => x.id)).toEqual(['u1', 'a1b']);
  });

  it('honours explicit selections', () => {
    const thread = buildThread(nodes, { u1: 'a1', a1: 'u2' });
    expect(thread.map((x) => x.id)).toEqual(['u1', 'a1', 'u2', 'a2']);
  });

  it('defaults deeper levels to newest under the selected branch', () => {
    expect(buildThread(nodes, { u1: 'a1' }).map((x) => x.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
  });

  it('computes root→node paths', () => {
    expect(pathTo(nodes, 'a2b').map((x) => x.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
    expect(pathTo(nodes, 'missing')).toEqual([]);
  });

  it('reports sibling position', () => {
    const children = indexChildren(nodes);
    expect(siblingInfo(children, nodes[4]!)).toEqual({ index: 1, total: 2, ids: ['u2', 'u2b'] });
    expect(children.get(ROOT_KEY)?.map((x) => x.id)).toEqual(['u1']);
  });
});
