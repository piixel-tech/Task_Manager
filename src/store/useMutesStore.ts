import { create } from 'zustand';
import { notificationApi } from '../services/http/notificationApi';
import { toast } from './useToastStore';

export type MuteDuration = '8h' | '1w' | 'always' | 'off';

interface MutesState {
  /** "chat:<id>" / "subfolder:<id>" -> ISO time the mute ends, or "always". Saved on the account. */
  mutes: Record<string, string>;
  load: () => Promise<void>;
  set: (key: string, duration: MuteDuration) => Promise<void>;
}

export const isMutedKey = (mutes: Record<string, string>, key: string): boolean => {
  const until = mutes[key];
  return !!until && (until === 'always' || new Date(until).getTime() > Date.now());
};

export const useMutesStore = create<MutesState>((set) => ({
  mutes: {},
  load: async () => {
    try {
      set({ mutes: await notificationApi.mutes() });
    } catch {
      /* nothing is muted until it loads */
    }
  },
  set: async (key, duration) => {
    try {
      set({ mutes: await notificationApi.setMute(key, duration) });
    } catch {
      toast.error('Could not change the mute');
    }
  }
}));

/** Non-hook check for sockets: is this chat or subfolder muted right now? */
export const isMuted = (key: string): boolean => isMutedKey(useMutesStore.getState().mutes, key);
