import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUi } from '../stores/ui';

export interface Shortcut {
  keys: string[];
  description: string;
}

export const SHORTCUTS = (mod: string): Shortcut[] => [
  { keys: [mod, 'K'], description: 'Search chats' },
  { keys: [mod, 'Shift', 'O'], description: 'New chat' },
  { keys: ['Esc'], description: 'Stop generating' },
  { keys: ['Enter'], description: 'Send message' },
  { keys: ['Shift', 'Enter'], description: 'New line' },
  { keys: ['/'], description: 'Slash commands (in an empty composer)' },
  { keys: ['F2'], description: 'Rename the focused chat in the sidebar' },
  { keys: [mod, '/'], description: 'Show keyboard shortcuts' },
  { keys: ['?'], description: 'Show keyboard shortcuts (outside text fields)' },
];

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

export function useGlobalShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      const ui = useUi.getState();

      if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault();
        if (window.matchMedia('(max-width: 1023px)').matches) ui.setDrawerOpen(true);
        else if (ui.sidebarCollapsed) ui.toggleSidebar();
        requestAnimationFrame(() => ui.focusSearch());
        return;
      }
      if (mod && e.shiftKey && key === 'o') {
        e.preventDefault();
        ui.setDrawerOpen(false);
        navigate('/');
        requestAnimationFrame(() => ui.focusComposer());
        return;
      }
      if ((mod && key === '/') || (!mod && e.key === '?' && !isTyping(e.target))) {
        e.preventDefault();
        ui.setShortcutsOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
