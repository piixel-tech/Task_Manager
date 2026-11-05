import { useEffect, useState } from 'react';
import { ensureTimerLoaded, useTimerStore } from '../../../store/useTimerStore';

/**
 * My own timer for the rail and the browser tab: where it is, the task, and the task's total time ticking up while it runs.
 * The seconds start from the server's total in the last answer; the browser only adds the time that passed since.
 */
export function useMyTimer() {
  const current = useTimerStore((s) => s.current);
  const receivedAt = useTimerStore((s) => s.receivedAt);
  const busy = useTimerStore((s) => s.busy);
  const running = current?.state === 'running';

  useEffect(() => ensureTimerLoaded(), []);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const task = current?.task ?? null;
  const seconds = task ? task.total_seconds + (running ? Math.max(0, (now - receivedAt) / 1000) : 0) : 0;
  return { state: current?.state ?? 'idle', running, paused: current?.state === 'paused', task, seconds, busy };
}
