import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface UiState {
  /** Mobile drawer open state (not persisted). */
  drawerOpen: boolean;
  /** Desktop sidebar collapsed (persisted). */
  sidebarCollapsed: boolean;
  shortcutsOpen: boolean;
  settingsOpen: boolean;
  /** Bumped to ask the sidebar search box to focus itself (Ctrl/Cmd+K). */
  searchFocusTick: number;
  /** Bumped to ask the composer to focus itself. */
  composerFocusTick: number;
  setDrawerOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setShortcutsOpen: (open: boolean) => void;
  setSettingsOpen: (open: boolean) => void;
  focusSearch: () => void;
  focusComposer: () => void;
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      drawerOpen: false,
      sidebarCollapsed: false,
      shortcutsOpen: false,
      settingsOpen: false,
      searchFocusTick: 0,
      composerFocusTick: 0,
      setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      focusSearch: () => set((s) => ({ searchFocusTick: s.searchFocusTick + 1 })),
      focusComposer: () => set((s) => ({ composerFocusTick: s.composerFocusTick + 1 })),
    }),
    {
      name: 'keyring:ui',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ sidebarCollapsed }) => ({ sidebarCollapsed }),
    },
  ),
);
