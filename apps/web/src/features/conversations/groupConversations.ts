import type { Conversation } from '@keyring/shared';

export type GroupLabel = 'Pinned' | 'Today' | 'Yesterday' | 'Previous 7 days' | 'Previous 30 days' | 'Older';

export interface ConversationGroup {
  label: GroupLabel;
  items: Conversation[];
}

const ORDER: GroupLabel[] = ['Pinned', 'Today', 'Yesterday', 'Previous 7 days', 'Previous 30 days', 'Older'];

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function groupLabelFor(updatedAt: string, now: Date): Exclude<GroupLabel, 'Pinned'> {
  const today = startOfLocalDay(now);
  const day = startOfLocalDay(new Date(updatedAt));
  const diffDays = Math.round((today - day) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays <= 7) return 'Previous 7 days';
  if (diffDays <= 30) return 'Previous 30 days';
  return 'Older';
}

/** Groups by recency (local calendar days); pinned chats always come first. */
export function groupConversations(items: Conversation[], now = new Date()): ConversationGroup[] {
  const buckets = new Map<GroupLabel, Conversation[]>();
  for (const c of items) {
    const label = c.pinned ? 'Pinned' : groupLabelFor(c.updatedAt, now);
    const list = buckets.get(label);
    if (list) list.push(c);
    else buckets.set(label, [c]);
  }
  return ORDER.filter((l) => buckets.has(l)).map((label) => ({
    label,
    items: buckets.get(label)!.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
  }));
}
