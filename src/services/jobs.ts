import axios from 'axios';
import { useJobsStore, type Job } from '../store/useJobsStore';

/** Thrown to whoever started a job when the person cancelled it (or dismissed its error). */
export class JobCancelled extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'JobCancelled';
  }
}
export const isJobCancelled = (err: unknown): err is JobCancelled => err instanceof JobCancelled;

/** What a job's work uses to report progress and to honour Pause and Cancel. */
export interface JobControl {
  /** Aborted on Cancel, and on Pause (the transfer in flight stops and is started again after Resume). */
  readonly signal: AbortSignal;
  /** Await this between steps: it waits while paused and throws {@link JobCancelled} after Cancel. */
  checkpoint(): Promise<void>;
  /** Item `index` has now sent/received `loaded` of its size. */
  progress(index: number, loaded: number): void;
  finish(index: number): void;
  /** True when `err` is only the abort caused by Pause, so the step should simply be tried again. */
  interrupted(err: unknown): boolean;
}

export interface JobSpec<T> {
  title: string;
  /** Real steps (files). Leave out for a single action: the card then shows "Working…" instead of a made-up percentage. */
  items?: { name: string; size: number }[];
  pausable?: boolean;
  /**
   * Does the work. It may be run again after a failure when the person presses Retry, so keep results outside and skip what
   * is already done.
   */
  run: (ctl: JobControl) => Promise<T>;
}

interface Handle {
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retry: () => void;
  dismiss: () => void;
}
const handles = new Map<string, Handle>();
let seq = 0;

export const HIDE_AFTER_MS = 3000;

/** What the progress card's buttons call. */
export const jobControls = {
  pause: (id: string) => handles.get(id)?.pause(),
  resume: (id: string) => handles.get(id)?.resume(),
  cancel: (id: string) => handles.get(id)?.cancel(),
  retry: (id: string) => handles.get(id)?.retry(),
  dismiss: (id: string) => handles.get(id)?.dismiss(),
  toggle: (id: string) => useJobsStore.getState().patch(id, (j) => ({ ...j, expanded: !j.expanded }))
};

const store = () => useJobsStore.getState();

/**
 * Runs `spec.run` and shows it in the progress toast. Resolves with its result once it succeeds (the card ticks and hides after
 * 3 seconds). If it fails the card shows the error with Retry and the returned promise keeps waiting: Retry runs it again,
 * Dismiss rejects with the original error, Cancel rejects with {@link JobCancelled}.
 */
export function runJob<T>(spec: JobSpec<T>): Promise<T> {
  const id = `job-${++seq}`;
  const determinate = !!spec.items;
  const job: Job = {
    id,
    title: spec.title,
    status: 'running',
    determinate,
    pausable: !!spec.pausable,
    expanded: false,
    activeMs: 0,
    resumedAt: Date.now(),
    items: (spec.items ?? [{ name: spec.title, size: 1 }]).map((it, i) => ({
      id: `${id}-${i}`,
      name: it.name,
      size: Math.max(1, it.size),
      loaded: 0,
      status: 'queued'
    }))
  };
  store().add(job);

  return new Promise<T>((resolve, reject) => {
    let abort = new AbortController();
    let paused = false;
    let cancelled = false;
    let dismissed = false;
    let waiters: (() => void)[] = [];
    let onRetry: (() => void) | null = null;
    let lastError: unknown = null;

    const stopClock = () =>
      store().patch(id, (j) => ({ ...j, activeMs: j.activeMs + (j.resumedAt ? Date.now() - j.resumedAt : 0), resumedAt: null }));
    const startClock = () => store().patch(id, (j) => ({ ...j, resumedAt: Date.now() }));
    const wake = () => waiters.splice(0).forEach((w) => w());

    const ctl: JobControl = {
      get signal() {
        return abort.signal;
      },
      async checkpoint() {
        while (paused && !cancelled) await new Promise<void>((r) => waiters.push(r));
        if (cancelled) throw new JobCancelled();
      },
      progress(index, loaded) {
        store().patch(id, (j) => ({
          ...j,
          items: j.items.map((it, i) => (i === index ? { ...it, status: 'running', loaded: Math.min(loaded, it.size) } : it))
        }));
      },
      finish(index) {
        store().patch(id, (j) => ({ ...j, items: j.items.map((it, i) => (i === index ? { ...it, status: 'done', loaded: it.size } : it)) }));
      },
      interrupted(err) {
        return !cancelled && (axios.isCancel(err) || (err instanceof DOMException && err.name === 'AbortError'));
      }
    };

    const leave = () => {
      store().remove(id);
      handles.delete(id);
    };

    handles.set(id, {
      pause() {
        if (!spec.pausable || paused || cancelled || store().jobs.find((j) => j.id === id)?.status !== 'running') return;
        paused = true;
        stopClock();
        // The transfer in flight stops and starts again from the beginning after Resume.
        store().patch(id, (j) => ({
          ...j,
          status: 'paused',
          items: j.items.map((it) => (it.status === 'running' ? { ...it, status: 'queued', loaded: 0 } : it))
        }));
        const old = abort;
        abort = new AbortController();
        old.abort();
      },
      resume() {
        if (!paused) return;
        paused = false;
        startClock();
        store().patch(id, (j) => ({ ...j, status: 'running' }));
        wake();
      },
      cancel() {
        if (cancelled) return;
        cancelled = true;
        paused = false;
        abort.abort();
        wake();
        onRetry?.(); // a failed job that is waiting for Retry stops waiting
        // Work that cannot be aborted (a plain request) keeps going in the background, but the person is not kept waiting.
        leave();
        reject(new JobCancelled());
      },
      retry() {
        onRetry?.();
      },
      dismiss() {
        const status = store().jobs.find((j) => j.id === id)?.status;
        if (status === 'error') {
          dismissed = true;
          onRetry?.();
        } else {
          store().remove(id);
          handles.delete(id);
        }
      }
    });

    void (async () => {
      for (;;) {
        try {
          const value = await spec.run(ctl);
          stopClock();
          store().patch(id, (j) => ({ ...j, status: 'done', error: undefined, items: j.items.map((it) => ({ ...it, status: 'done', loaded: it.size })) }));
          setTimeout(leave, HIDE_AFTER_MS);
          resolve(value);
          return;
        } catch (err) {
          if (cancelled || err instanceof JobCancelled) {
            leave();
            reject(new JobCancelled());
            return;
          }
          lastError = err;
          stopClock();
          store().patch(id, (j) => ({
            ...j,
            status: 'error',
            error: err instanceof Error ? err.message : 'Something went wrong',
            items: j.items.map((it) => (it.status === 'done' ? it : { ...it, status: it.status === 'running' ? 'error' : it.status }))
          }));
          await new Promise<void>((r) => (onRetry = r));
          onRetry = null;
          if (cancelled) {
            leave();
            reject(new JobCancelled());
            return;
          }
          if (dismissed) {
            leave();
            reject(lastError);
            return;
          }
          // Retry: only what is not finished is tried again.
          abort = new AbortController();
          startClock();
          store().patch(id, (j) => ({
            ...j,
            status: 'running',
            error: undefined,
            items: j.items.map((it) => (it.status === 'done' ? it : { ...it, status: 'queued', loaded: 0 }))
          }));
        }
      }
    })();
  });
}
