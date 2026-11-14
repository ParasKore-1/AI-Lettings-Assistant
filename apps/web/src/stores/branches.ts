import { create } from 'zustand';

/** Which sibling is shown at each fork of a conversation tree (keyed by parentKey). */
interface BranchState {
  selections: Record<string, Record<string, string>>;
  select: (conversationId: string, parentKey: string, childId: string) => void;
}

const EMPTY: Record<string, string> = {};

export const useBranches = create<BranchState>()((set) => ({
  selections: {},
  select: (conversationId, parentKey, childId) =>
    set((s) => ({
      selections: {
        ...s.selections,
        [conversationId]: { ...(s.selections[conversationId] ?? EMPTY), [parentKey]: childId },
      },
    })),
}));

export const useBranchSelections = (conversationId: string) =>
  useBranches((s) => s.selections[conversationId] ?? EMPTY);
