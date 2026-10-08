import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { CheckCircle2, Edit2, Target } from 'lucide-react';
import { gamificationService } from '../../../services';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { CurvePattern } from '../../../components/ui/HeroCard';
import { CountUp } from '../../../components/ui/CountUp';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { EASE_OUT } from '../../../components/ui/motion';

export const TeamMonthlyGoalBar: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const { reduced } = useMotionPrefs();
  const [goalData, setGoalData] = useState<{ finished: number; goal: number } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState('');

  const isAdmin = user?.role === 'admin';

  const loadGoal = () => {
    gamificationService
      .getTeamMonthlyGoal()
      .then((data) => {
        setGoalData(data);
        setNewGoalInput(data.goal ? String(data.goal) : '');
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadGoal();
  }, []);

  if (!goalData) return null;

  const handleSaveGoal = async () => {
    const parsed = parseInt(newGoalInput, 10);
    if (isNaN(parsed) || parsed <= 0) {
      showToast('Please enter a valid positive number for team goal');
      return;
    }
    try {
      const updated = await gamificationService.setTeamMonthlyGoal(parsed);
      setGoalData(updated);
      setIsEditing(false);
      showToast(`Team monthly task goal updated to ${parsed}`);
    } catch {
      showToast('Failed to update team goal');
    }
  };

  /**
   * The service can hand back an undefined goal when none has been stored yet,
   * so guard before dividing — otherwise the bar renders "NaN%".
   */
  const goal = Number.isFinite(goalData.goal) && goalData.goal > 0 ? goalData.goal : 0;
  const hasGoal = goal > 0;
  const percent = hasGoal ? Math.min(100, Math.round((goalData.finished / goal) * 100)) : 0;

  return (
    <div
      className="relative mb-6 overflow-hidden rounded-[var(--tm-radius-xl)] p-6 text-white shadow-hero"
      style={{
        backgroundImage:
          'linear-gradient(135deg, var(--tm-primary) 0%, var(--tm-primary-dark) 70%)'
      }}
    >
      <CurvePattern opacity={0.15} />

      <div className="relative">
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-white/15 backdrop-blur-sm">
              <Target className="h-5 w-5" />
            </span>

            <div>
              <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-extrabold tracking-[-0.01em]">
                Monthly team goal
                {percent >= 100 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-wider">
                    <CheckCircle2 className="h-3 w-3" /> Achieved
                  </span>
                )}
              </h3>
              <p className="mt-0.5 text-[12.5px] text-white/70">
                {hasGoal ? (
                  <>
                    Team finished{' '}
                    <strong className="font-bold text-white">{goalData.finished}</strong> of{' '}
                    <strong className="font-bold text-white">{goal}</strong> tasks this month
                  </>
                ) : (
                  <>
                    Team finished{' '}
                    <strong className="font-bold text-white">{goalData.finished}</strong>{' '}
                    {goalData.finished === 1 ? 'task' : 'tasks'} this month — no target set yet
                  </>
                )}
              </p>
            </div>
          </div>

          {isAdmin && (
            <div className="shrink-0">
              {isEditing ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={newGoalInput}
                    onChange={(e) => setNewGoalInput(e.target.value)}
                    className="w-20 rounded-full border border-white/25 bg-white/10 px-3.5 py-1.5
                      text-[12.5px] font-semibold text-white outline-none
                      placeholder:text-white/50 focus:border-white/50"
                  />
                  <button
                    onClick={handleSaveGoal}
                    className="rounded-full bg-white px-4 py-1.5 text-[12.5px] font-bold
                      text-[var(--tm-primary-dark)] transition-opacity hover:opacity-90"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="rounded-full px-3 py-1.5 text-[12.5px] font-semibold text-white/70 hover:text-white"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white/12 px-4 py-2
                    text-[12.5px] font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/22"
                >
                  <Edit2 className="h-3.5 w-3.5" /> Edit target
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress track — the remainder is hatched */}
        <div className="hatch-light h-2.5 w-full overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-white"
            initial={{ width: reduced ? `${percent}%` : 0 }}
            animate={{ width: `${percent}%` }}
            transition={{ duration: reduced ? 0 : 0.85, ease: EASE_OUT }}
          />
        </div>

        <div className="mt-2 flex justify-between text-[11px] font-semibold text-white/60">
          <span>0%</span>
          {hasGoal ? (
            <>
              <span className="text-white">
                <CountUp value={percent} suffix="% completed" />
              </span>
              <span>100% · {goal} tasks</span>
            </>
          ) : (
            <>
              <span className="text-white">Set a target to track progress</span>
              <span>100%</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
