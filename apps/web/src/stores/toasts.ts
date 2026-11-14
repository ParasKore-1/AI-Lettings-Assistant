import { create } from 'zustand';

export interface Toast {
  id: string;
  title: string;
  description?: string | undefined;
  tone: 'neutral' | 'success' | 'danger';
  action?: { label: string; onClick: () => void } | undefined;
  durationMs: number;
}

interface ToastState {
  toasts: Toast[];
  push: (t: Omit<Toast, 'id' | 'tone' | 'durationMs'> & Partial<Pick<Toast, 'tone' | 'durationMs'>>) => string;
  dismiss: (id: string) => void;
}

let counter = 0;

export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  push: (t) => {
    const id = `t${++counter}`;
    set((s) => ({
      toasts: [...s.toasts.slice(-3), { tone: 'neutral', durationMs: 5000, ...t, id }],
    }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (t: Parameters<ToastState['push']>[0]) => useToasts.getState().push(t);
