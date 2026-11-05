import { useEffect } from 'react';
import { formatClock } from '../../../utils/format';
import { useMyTimer } from './useMyTimer';

/** While my timer runs the browser tab reads "▶ 42:18 · Task name"; when it stops the original title comes back. */
export function useTimerTitle() {
  const { running, task, seconds } = useMyTimer();
  const name = task?.title;

  // Remember the normal title when the timer starts, and put it back when it stops (or the task changes).
  useEffect(() => {
    if (!running || !name) return;
    const normal = document.title;
    return () => {
      document.title = normal;
    };
  }, [running, name]);

  useEffect(() => {
    if (running && name) document.title = `▶ ${formatClock(seconds)} · ${name}`;
  }, [running, name, seconds]);
}
