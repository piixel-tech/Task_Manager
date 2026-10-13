import React, { useEffect, useState } from 'react';
import type { Task } from '../../types';
import { formatHours } from '../../utils/format';
import { getNowISO, calculateDurationSeconds } from '../../utils/time';
import { ProgressBar } from './ProgressRing';

export interface TaskProgressBarProps {
  task: Task;
  userId?: string;
  estimatedHours?: number;
  tone?: 'primary' | 'ok' | 'warn' | 'bad';
  showLabel?: boolean;
}

export const TaskProgressBar: React.FC<TaskProgressBarProps> = ({
  task,
  userId,
  estimatedHours,
  tone,
  showLabel = true
}) => {
  const [nowISO, setNowISO] = useState(getNowISO());
  const activeSession = task.sessions.find((s) => !s.endTime && (!userId || s.userId === userId));

  useEffect(() => {
    if (!activeSession) return;
    const interval = setInterval(() => {
      setNowISO(getNowISO());
    }, 1000);
    return () => clearInterval(interval);
  }, [activeSession]);

  let totalSeconds = (task.loggedHours || 0) * 3600;
  if (activeSession) {
    totalSeconds += calculateDurationSeconds(activeSession.startTime, nowISO);
  }

  const liveHours = totalSeconds / 3600;
  const est = estimatedHours || task.estimatedHours || 8;
  const pct = Math.min(100, (liveHours / est) * 100);

  return (
    <div className="space-y-1 w-full">
      {showLabel && (
        <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--tm-ink-muted)]">
          <span className="font-extrabold text-[var(--tm-ink)] tabular-nums">
            {formatHours(liveHours)}
          </span>
        </div>
      )}
      <ProgressBar value={pct} tone={tone || (task.status === 'completed' ? 'ok' : 'primary')} height={6} />
    </div>
  );
};
