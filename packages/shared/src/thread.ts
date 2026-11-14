/**
 * Conversations are trees: editing a user message or regenerating a reply adds
 * a sibling instead of overwriting history. These helpers turn the flat list
 * into the single visible thread.
 */
export interface TreeNode {
  id: string;
  parentId: string | null;
  createdAt: string;
}

export const ROOT_KEY = '__root__';

export function parentKey(parentId: string | null): string {
  return parentId ?? ROOT_KEY;
}

/** Groups children by parent, each list sorted oldest → newest (stable by id). */
export function indexChildren<T extends TreeNode>(nodes: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const node of nodes) {
    const key = parentKey(node.parentId);
    const list = map.get(key);
    if (list) list.push(node);
    else map.set(key, [node]);
  }
  for (const list of map.values()) {
    list.sort((a, b) =>
      a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1,
    );
  }
  return map;
}

/**
 * Walks from the root, at each level taking the child chosen in `selections`
 * (keyed by parentKey) or, by default, the newest child.
 */
export function buildThread<T extends TreeNode>(
  nodes: readonly T[],
  selections: Readonly<Record<string, string>> = {},
): T[] {
  const children = indexChildren(nodes);
  const thread: T[] = [];
  let key = ROOT_KEY;
  const guard = new Set<string>();
  for (;;) {
    const list = children.get(key);
    if (!list || list.length === 0) break;
    const selectedId = selections[key];
    const next = list.find((n) => n.id === selectedId) ?? list[list.length - 1]!;
    if (guard.has(next.id)) break; // defensive: malformed cycles
    guard.add(next.id);
    thread.push(next);
    key = next.id;
  }
  return thread;
}

/** Root → node path (inclusive). Returns [] if the id is unknown. */
export function pathTo<T extends TreeNode>(nodes: readonly T[], id: string): T[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const path: T[] = [];
  let current = byId.get(id);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export interface SiblingInfo {
  index: number;
  total: number;
  ids: string[];
}

export function siblingInfo<T extends TreeNode>(
  children: Map<string, T[]>,
  node: T,
): SiblingInfo {
  const list = children.get(parentKey(node.parentId)) ?? [node];
  const ids = list.map((n) => n.id);
  return { index: Math.max(0, ids.indexOf(node.id)), total: ids.length, ids };
}
