import { create } from 'zustand';

export type JobStatus = 'running' | 'paused' | 'done' | 'error';
export type ItemStatus = 'queued' | 'running' | 'done' | 'error';

export interface JobItem {
  id: string;
  name: string;
  /** Bytes for an upload, or 1 for a step with no byte count. */
  size: number;
  loaded: number;
  status: ItemStatus;
}

/** One piece of background work shown in the progress toast: an upload, a Drive attach, assigning a task… */
export interface Job {
  id: string;
  title: string;
  status: JobStatus;
  items: JobItem[];
  /** True when the percentage is real (an upload, a list of files). Otherwise the bar just shows that it is working. */
  determinate: boolean;
  /** Whether Pause does anything (uploads stop the transfer and restart it on resume). */
  pausable: boolean;
  expanded: boolean;
  /** Time spent actually working, without the time spent paused or waiting on an error. */
  activeMs: number;
  /** When the current working stretch began (null while paused or finished). */
  resumedAt: number | null;
  error?: string;
}

interface JobsState {
  jobs: Job[];
  add: (job: Job) => void;
  patch: (id: string, change: (job: Job) => Job) => void;
  remove: (id: string) => void;
}

export const useJobsStore = create<JobsState>((set) => ({
  jobs: [],
  add: (job) => set((s) => ({ jobs: [...s.jobs, job] })),
  patch: (id, change) => set((s) => ({ jobs: s.jobs.map((j) => (j.id === id ? change(j) : j)) })),
  remove: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) }))
}));

// --- What the card shows -------------------------------------------------------------------------------------------
export function jobPercent(job: Job): number {
  if (job.status === 'done') return 100;
  const total = job.items.reduce((n, i) => n + i.size, 0);
  if (!total) return 0;
  const loaded = job.items.reduce((n, i) => n + (i.status === 'done' ? i.size : Math.min(i.loaded, i.size)), 0);
  return Math.min(100, Math.floor((loaded / total) * 100));
}

export function elapsedMs(job: Job, now: number): number {
  return job.activeMs + (job.resumedAt ? Math.max(0, now - job.resumedAt) : 0);
}

/** Seconds left at the speed so far, or null while it is too early to say. */
export function secondsLeft(job: Job, now: number): number | null {
  if (!job.determinate || job.status !== 'running') return null;
  const total = job.items.reduce((n, i) => n + i.size, 0);
  const loaded = job.items.reduce((n, i) => n + (i.status === 'done' ? i.size : Math.min(i.loaded, i.size)), 0);
  const secs = elapsedMs(job, now) / 1000;
  if (secs < 1 || loaded <= 0) return null;
  return Math.max(0, Math.ceil((total - loaded) / (loaded / secs)));
}

export function formatLeft(seconds: number): string {
  if (seconds < 60) return `${seconds} ${seconds === 1 ? 'second' : 'seconds'} left`;
  const mins = Math.ceil(seconds / 60);
  return `${mins} ${mins === 1 ? 'minute' : 'minutes'} left`;
}

/** "75% · 4 seconds left", or the state the job is in. */
export function jobSummary(job: Job, now: number): string {
  if (job.status === 'done') return 'Done';
  if (job.status === 'error') return job.error || 'Something went wrong';
  if (!job.determinate) return job.status === 'paused' ? 'Paused' : 'Working…';
  const pct = `${jobPercent(job)}%`;
  if (job.status === 'paused') return `${pct} · Paused`;
  const left = secondsLeft(job, now);
  return left === null ? `${pct} · Estimating time…` : `${pct} · ${formatLeft(left)}`;
}
