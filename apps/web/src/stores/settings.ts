import type { ResponseMode } from '@keyring/shared';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type ThemePref = 'system' | 'light' | 'dark';
export type FontSize = 'sm' | 'md' | 'lg';
export type MotionPref = 'system' | 'reduce' | 'full';

interface SettingsState {
  theme: ThemePref;
  fontSize: FontSize;
  motion: MotionPref;
  model: string | null;
  mode: ResponseMode;
  setTheme: (t: ThemePref) => void;
  setFontSize: (f: FontSize) => void;
  setMotion: (m: MotionPref) => void;
  setModel: (m: string) => void;
  setMode: (m: ResponseMode) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'system',
      fontSize: 'md',
      motion: 'system',
      model: null,
      mode: 'balanced',
      setTheme: (theme) => set({ theme }),
      setFontSize: (fontSize) => set({ fontSize }),
      setMotion: (motion) => set({ motion }),
      setModel: (model) => set({ model }),
      setMode: (mode) => set({ mode }),
    }),
    {
      name: 'keyring:settings',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ theme, fontSize, motion, model, mode }) => ({ theme, fontSize, motion, model, mode }),
    },
  ),
);

export function resolveTheme(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
