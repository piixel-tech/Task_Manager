import { useEffect, useState } from 'react';
import { taskApi } from '../../../services/http/taskApi';
import { leaveApi } from '../../../services/http/leaveApi';
import { getTodayDateString } from '../../../utils/time';
import { isFirstDayBack } from './greetingText';

const OPEN = ['todo', 'in_progress', 'changes_requested'];

/** How my day looks for the greeting subtitle: open tasks overdue / due today, and whether it is my first day back from leave. Quiet on errors. */
export function useDayContext() {
  const [ctx, setCtx] = useState({ overdue: 0, dueToday: 0, backFromLeave: false });

  useEffect(() => {
    let alive = true;
    const today = getTodayDateString();
    taskApi
      .list({ mine: true })
      .then((tasks) => {
        const open = tasks.filter((t) => OPEN.includes(t.status));
        if (alive)
          setCtx((c) => ({
            ...c,
            overdue: open.filter((t) => t.due_date && t.due_date < today).length,
            dueToday: open.filter((t) => t.due_date === today).length
          }));
      })
      .catch(() => undefined);
    leaveApi
      .mine()
      .then((leaves) => alive && setCtx((c) => ({ ...c, backFromLeave: isFirstDayBack(leaves, today) })))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return ctx;
}
