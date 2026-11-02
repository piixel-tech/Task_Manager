import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { create } from 'zustand';
import { useAuthStore } from '../../store/authStore';

export interface Shortcut {
  keys: string[];
  label: string;
}

export const SHORTCUTS: Shortcut[] = [
  { keys: ['Ctrl', 'K'], label: 'Search and jump to anything' },
  { keys: ['?'], label: 'Show these shortcuts' },
  { keys: ['g', 'h'], label: 'Go to Home' },
  { keys: ['g', 'i'], label: 'Go to Activity' },
  { keys: ['g', 'c'], label: 'Go to Chats' },
  { keys: ['g', 't'], label: 'Go to Tasks' },
  { keys: ['g', 'p'], label: 'Go to Projects' },
  { keys: ['g', 'k'], label: 'Go to Calendar' },
  { keys: ['g', 'o'], label: 'Go to Office board' },
  { keys: ['g', 's'], label: 'Go to Settings' },
  { keys: ['Enter'], label: 'Send a chat message (Shift+Enter for a new line)' },
  { keys: ['Esc'], label: 'Close a dialog or menu' }
];

interface ShortcutsStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useShortcutsStore = create<ShortcutsStore>((set) => ({ open: false, setOpen: (open) => set({ open }) }));

const GO_TO: Record<string, string> = { h: 'dashboard', i: 'activity', c: 'chat', t: 'tasks', p: 'projects', k: 'calendar', o: 'office', s: 'settings' };
const CHORD_MS = 1200;

const typingIn = (el: EventTarget | null) => {
  const node = el as HTMLElement | null;
  return !!node && (node.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(node.tagName));
};

/** "?" opens the shortcut list; "g" then a letter jumps somewhere. Ignored while typing in a field. */
export function useShortcuts(): void {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    if (!role || role === 'client') return;
    const prefix = role === 'admin' ? '/admin' : '/app';
    let armed = 0; // when "g" was pressed
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target)) return;
      if (e.key === '?') {
        e.preventDefault();
        useShortcutsStore.getState().setOpen(true);
        return;
      }
      if (e.key === 'g') {
        armed = Date.now();
        return;
      }
      const target = GO_TO[e.key];
      if (target && Date.now() - armed < CHORD_MS) {
        armed = 0;
        e.preventDefault();
        navigate(`${prefix}/${target}`);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [navigate, role]);
}
