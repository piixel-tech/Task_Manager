import React, { useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { Check, Sparkles, Leaf } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useTaskStore } from '../../../store/useTaskStore';
import { getTodayDateString } from '../../../utils/time';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { Card, CardContent } from '../../../components/ui/Card';

export interface DailyProgressRingProps {
  className?: string;
}

/**
 * Daily Progress Ring Component for Employee's Home / Dashboard
 * Shows "X of Y tasks done today", where Y = tasks assigned to user due today,
 * X = how many of those are completed.
 * Turns celebratory color at 100% with "All done for today ✨".
 * If Y = 0, shows "No tasks today, enjoy a calm day 🌿".
 */
export const DailyProgressRing: React.FC<DailyProgressRingProps> = ({ className = '' }) => {
  const { user } = useAuthStore();
  const storeTasks = useTaskStore((state) => state.tasks);
  const fetchTasks = useTaskStore((state) => state.fetchTasks);
  const { reduced } = useMotionPrefs();

  useEffect(() => {
    if (storeTasks.length === 0) {
      fetchTasks().catch(() => {});
    }
  }, [fetchTasks, storeTasks.length]);

  const todayStr = getTodayDateString();

  // Tasks assigned to user that are due today
  const { totalToday, completedToday, percentage, isAllDone, hasNoTasks } = useMemo(() => {
    if (!user) {
      return { totalToday: 0, completedToday: 0, percentage: 0, isAllDone: false, hasNoTasks: true };
    }

    const tasksDueToday = storeTasks.filter((t) => {
      if (t.assignedUserId !== user.id) return false;
      if (!t.dueDate) return false;
      return t.dueDate.slice(0, 10) === todayStr;
    });

    const total = tasksDueToday.length;
    const completed = tasksDueToday.filter((t) => t.status === 'completed').length;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const allDone = total > 0 && completed === total;

    return {
      totalToday: total,
      completedToday: completed,
      percentage: pct,
      isAllDone: allDone,
      hasNoTasks: total === 0
    };
  }, [storeTasks, user, todayStr]);

  // SVG ring geometry
  const size = 112;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <Card className={`relative overflow-hidden ${className}`}>
      <CardContent className="p-5 flex flex-col justify-between h-full">
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--tm-ink-muted)]">
            Daily Task Progress
          </div>
          {isAllDone && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2 py-0.5 text-[10.5px] font-extrabold text-emerald-700 dark:text-emerald-300">
              <Sparkles className="h-3 w-3" /> 100%
            </span>
          )}
        </div>

        {hasNoTasks ? (
          /* Calm State: No tasks scheduled for today */
          <div className="my-auto flex flex-col items-center justify-center text-center py-2 px-1">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mb-2.5 shadow-xs">
              <Leaf className="h-6 w-6" />
            </div>
            <h4 className="text-[14.5px] font-bold text-[var(--tm-ink)] leading-snug">
              No tasks today, enjoy a calm day 🌿
            </h4>
            <p className="mt-1 text-[11.5px] text-[var(--tm-ink-muted)]">
              All caught up on today's schedule
            </p>
          </div>
        ) : (
          /* Active Ring State */
          <div className="flex items-center gap-4 sm:gap-5 my-auto">
            {/* SVG Progress Ring */}
            <div className="relative shrink-0 flex items-center justify-center">
              <svg width={size} height={size} className="-rotate-90">
                {/* Background track */}
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="var(--tm-bg-sunken)"
                  strokeWidth={strokeWidth}
                />

                {/* Animated value ring */}
                <motion.circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={isAllDone ? '#10b981' : 'var(--tm-primary)'}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset }}
                  transition={{
                    duration: reduced ? 0 : 0.85,
                    ease: [0.16, 1, 0.3, 1]
                  }}
                />
              </svg>

              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                {isAllDone ? (
                  <motion.div
                    initial={reduced ? undefined : { scale: 0.5, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 20 }}
                    className="grid h-8 w-8 place-items-center rounded-full bg-emerald-500 text-white shadow-xs"
                  >
                    <Check className="h-4 w-4 stroke-[3]" />
                  </motion.div>
                ) : (
                  <span className="text-[20px] font-black tabular-nums text-[var(--tm-ink)] leading-none">
                    {percentage}%
                  </span>
                )}
              </div>
            </div>

            {/* Content next to ring */}
            <div className="min-w-0 flex-1">
              {isAllDone ? (
                <>
                  <h4 className="text-[15.5px] font-black text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 leading-tight">
                    All done for today ✨
                  </h4>
                  <p className="mt-1 text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
                    {completedToday} of {totalToday} tasks done today
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--tm-ink-muted)]">
                    Fantastic work completing all of today's deliverables!
                  </p>
                </>
              ) : (
                <>
                  <h4 className="text-[15.5px] font-bold text-[var(--tm-ink)] leading-tight">
                    {completedToday} of {totalToday} tasks done today
                  </h4>
                  <p className="mt-1 text-[12px] font-medium text-[var(--tm-ink-muted)]">
                    {totalToday - completedToday} remaining for today
                  </p>
                  {/* Subtle progress track */}
                  <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--tm-bg-sunken)]">
                    <motion.div
                      className="h-full rounded-full bg-[var(--tm-primary)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${percentage}%` }}
                      transition={{ duration: reduced ? 0 : 0.6 }}
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export const ProgressRing = DailyProgressRing;
