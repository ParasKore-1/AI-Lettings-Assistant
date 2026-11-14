import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/** Key used for the composer on the new-chat screen. */
export const NEW_CHAT_DRAFT = '__new__';

interface DraftsState {
  drafts: Record<string, string>;
  setDraft: (key: string, text: string) => void;
  clearDraft: (key: string) => void;
}

/** Unsent composer text per conversation, persisted across reloads. */
export const useDrafts = create<DraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      setDraft: (key, text) =>
        set((s) => {
          if (!text) {
            if (!(key in s.drafts)) return s;
            const rest = { ...s.drafts };
            delete rest[key];
            return { drafts: rest };
          }
          return { drafts: { ...s.drafts, [key]: text.slice(0, 20_000) } };
        }),
      clearDraft: (key) =>
        set((s) => {
          const rest = { ...s.drafts };
          delete rest[key];
          return { drafts: rest };
        }),
    }),
    { name: 'keyring:drafts', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
);
