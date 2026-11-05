import { create } from 'zustand';
import { timerApi, type TimerCurrent } from '../services/http/timerApi';
import { socket } from '../services/socket';
import { useAuthStore } from './authStore';
import { toast } from './useToastStore';

interface TimerState {
  /** null until the first answer from the server. */
  current: TimerCurrent | null;
  /** Browser time when `current` arrived. Only the difference to "now" is used to tick the clock; the numbers are the server's. */
  receivedAt: number;
  /** Goes up on every change, so lists showing tasks know to fetch again. */
  rev: number;
  busy: boolean;

  load: () => Promise<void>;
  play: (task: { id: string; title: string }) => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
}

let syncing = false;

/**
 * Keep the store honest when the timer changes somewhere else: the server pushes every change to all of the person's tabs and
 * devices over the websocket (`timer`), asks again when the socket (re)connects, and on focus as a safety net.
 */
const watchOtherTabs = (reload: () => void, apply: (next: TimerCurrent) => void) => {
  if (syncing || typeof document === 'undefined') return;
  syncing = true;
  socket.on('timer', (next: TimerCurrent) => apply(next));
  socket.on('connected', reload);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reload());
  window.addEventListener('focus', reload);
};

export const useTimerStore = create<TimerState>((set, get) => {
  /**
   * Take the server's answer. Lists are told to fetch again only when the timer really moved, so the answer to my own click and
   * the push that follows it (same state) do not fetch twice.
   */
  const accept = (next: TimerCurrent) =>
    set((s) => {
      const prev = s.current;
      const moved = !prev || prev.state !== next.state || prev.task?.id !== next.task?.id || prev.started_at !== next.started_at;
      return { current: next, receivedAt: Date.now(), rev: moved ? s.rev + 1 : s.rev };
    });

  /** Run one timer call: block double clicks, show the error as a toast, and fetch the truth again if it failed. */
  const run = async (work: () => Promise<void>) => {
    if (get().busy) return;
    set({ busy: true });
    try {
      await work();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      await get().load();
    } finally {
      set({ busy: false });
    }
  };

  return {
    current: null,
    receivedAt: 0,
    rev: 0,
    busy: false,

    load: async () => {
      watchOtherTabs(() => void get().load(), accept);
      try {
        accept(await timerApi.current());
      } catch {
        /* the buttons simply fall back to what the task list says */
      }
    },

    play: (task) =>
      run(async () => {
        const res = await timerApi.start(task.id);
        accept(res);
        toast.info(res.stopped_task ? `Paused ${res.stopped_task.title}, started ${task.title}` : `Started ${task.title}`);
      }),

    pause: () =>
      run(async () => {
        const name = get().current?.task?.title;
        accept(await timerApi.pause());
        toast.info(name ? `Paused ${name}` : 'Timer paused');
      }),

    resume: () =>
      run(async () => {
        const res = await timerApi.resume();
        accept(res);
        toast.info(res.task ? `Resumed ${res.task.title}` : 'Timer resumed');
      })
  };
});

let ensuring: Promise<void> | null = null;

/** The first screen that needs the timer asks the server where it is; the rest share the answer. */
export const ensureTimerLoaded = () => {
  if (useTimerStore.getState().current || ensuring) return;
  ensuring = useTimerStore
    .getState()
    .load()
    .finally(() => {
      ensuring = null;
    });
};

// Another person signing in on this browser must never see the previous person's timer.
useAuthStore.subscribe((state, prev) => {
  if (state.user?.id !== prev.user?.id) useTimerStore.setState({ current: null, receivedAt: 0, rev: 0, busy: false });
});
