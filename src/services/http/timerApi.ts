import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';

export interface TimerTask {
  id: string;
  title: string;
  subfolder_id: string;
  /** The task's progress, 0-100. */
  progress: number;
  /** Everything tracked on the task, a running session included, as of `server_now`. */
  total_seconds: number;
}

/** Where the signed-in person's timer is. Every time in it comes from the server. */
export interface TimerCurrent {
  server_now: string;
  state: 'running' | 'paused' | 'idle';
  /** The running task, or the one Resume would carry on with. */
  task: TimerTask | null;
  started_at: string | null;
  /** The timer this call closed (Play on another task). */
  stopped_task: TimerTask | null;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

/** One timer session on a task: play (or resume) to pause. `ended_at` is empty while it runs. */
export interface TimerLogEntry {
  id: string;
  user: UserBrief;
  started_at: string;
  ended_at: string | null;
  seconds: number;
  running: boolean;
}

export interface TimerLog {
  server_now: string;
  total_seconds: number;
  /** Newest first. */
  entries: TimerLogEntry[];
}

/** Someone with a timer running on a task of a subfolder. */
export interface WorkingNow {
  task_id: string;
  started_at: string;
  user: UserBrief;
}

/** Pushed over the websocket to everyone who can open the subfolder when a timer starts or stops on one of its tasks. */
export interface PresenceEvent {
  subfolder_id: string;
  task_id: string;
  running: boolean;
  started_at: string | null;
  user: UserBrief;
}

export const timerApi = {
  current: () => call<TimerCurrent>(() => api.get('/timer/current'), 'Could not load the timer'),
  start: (taskId: string) => call<TimerCurrent>(() => api.post('/timer/start', { task_id: taskId }), 'Could not start the timer'),
  pause: () => call<TimerCurrent>(() => api.post('/timer/pause'), 'Could not pause the timer'),
  working: (subfolderId: string) => call<WorkingNow[]>(() => api.get(`/timer/working/${subfolderId}`), 'Could not load who is working'),
  /** Read-only log of a task's sessions; 403 unless you are the assignee, a head of the subfolder or an admin. */
  log: (taskId: string) => call<TimerLog>(() => api.get(`/timer/log/${taskId}`), 'Could not load the timer log'),
  resume: () => call<TimerCurrent>(() => api.post('/timer/resume'), 'Could not resume the timer')
};
