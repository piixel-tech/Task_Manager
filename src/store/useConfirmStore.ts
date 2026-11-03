import { create } from 'zustand';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  /** Red confirm button, for deletes and deactivations. */
  danger?: boolean;
  /** Submits, requests, bookings and invites: the confirm button is the Send button (plane, "Sent!", "Failed · Retry"). */
  send?: boolean;
  /** Runs when the user confirms. Throw to keep the dialog open and show the error. */
  action: () => Promise<unknown>;
  /** Success toast shown once `action` resolves. */
  successTitle?: string;
  successMessage?: string;
}

interface ConfirmState {
  request: (ConfirmOptions & { resolve: (ok: boolean) => void }) | null;
  busy: boolean;
  error: string | null;
  open: (options: ConfirmOptions) => Promise<boolean>;
  setBusy: (busy: boolean) => void;
  setError: (error: string | null) => void;
  close: (ok: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  request: null,
  busy: false,
  error: null,
  open: (options) =>
    new Promise<boolean>((resolve) => {
      set({ request: { ...options, resolve }, busy: false, error: null });
    }),
  setBusy: (busy) => set({ busy }),
  setError: (error) => set({ error }),
  close: (ok) => {
    get().request?.resolve(ok);
    set({ request: null, busy: false, error: null });
  }
}));
