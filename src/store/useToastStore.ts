import { create } from 'zustand';
import type { AppNotification } from '../types';

export type ToastTone = 'info' | 'success' | 'error';

export interface Toast {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
  /** In-app route opened when the toast is clicked. */
  link?: string;
  /** Set for notification popups: shows that notification's icon instead of the generic bell. */
  notification?: Pick<AppNotification, 'type' | 'title' | 'actor'>;
}

const MAX_VISIBLE = 3;

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>, durationMs?: number) => number;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast, durationMs = 5000) => {
    const id = nextId++;
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }].slice(-MAX_VISIBLE) })); // newest 3 stay
    setTimeout(() => get().dismiss(id), durationMs);
    return id;
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
}));

/** Non-hook access for services and sockets. */
export const toast = {
  info: (title: string, message?: string, link?: string, notification?: Toast['notification']): number =>
    useToastStore.getState().push({ tone: 'info', title, message, link, notification }),
  success: (title: string, message?: string) =>
    useToastStore.getState().push({ tone: 'success', title, message }),
  error: (title: string, message?: string, link?: string) =>
    useToastStore.getState().push({ tone: 'error', title, message, link })
};
