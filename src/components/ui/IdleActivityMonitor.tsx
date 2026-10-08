import React, { useEffect, useState, useRef } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { taskService } from '../../services';
import type { Task } from '../../types';
import { Modal } from './Modal';
import { Button } from './Button';

const IDLE_INACTIVITY_MS = 30 * 60 * 1000; // 30 minutes
const COUNTDOWN_SECONDS = 5 * 60; // 5 minutes countdown

export const IdleActivityMonitor: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [runningTask, setRunningTask] = useState<Task | null>(null);
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);

  const lastActivityRef = useRef<number>(Date.now());
  const countdownIntervalRef = useRef<any>(null);

  // Activity listeners
  useEffect(() => {
    const handleUserActivity = () => {
      lastActivityRef.current = Date.now();
    };

    window.addEventListener('mousemove', handleUserActivity);
    window.addEventListener('keydown', handleUserActivity);
    window.addEventListener('click', handleUserActivity);
    window.addEventListener('scroll', handleUserActivity);

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('click', handleUserActivity);
      window.removeEventListener('scroll', handleUserActivity);
    };
  }, []);

  // Poll for running task & check 30 min idle threshold
  useEffect(() => {
    if (!user || user.role === 'admin') return;

    const checkTimer = setInterval(async () => {
      try {
        const userTasks = await taskService.getTasks(undefined, user.id);
        const active = userTasks.find((t) => t.sessions.some((s) => !s.endTime && s.userId === user.id));

        setRunningTask(active || null);

        if (active && !isPromptOpen) {
          const idleTime = Date.now() - lastActivityRef.current;
          if (idleTime >= IDLE_INACTIVITY_MS) {
            setIsPromptOpen(true);
            setCountdown(COUNTDOWN_SECONDS);
          }
        }
      } catch {
        // error handling
      }
    }, 10000); // Check every 10 sec

    return () => clearInterval(checkTimer);
  }, [user, isPromptOpen]);

  // Handle countdown when prompt is open
  useEffect(() => {
    if (!isPromptOpen || !runningTask || !user) return;

    countdownIntervalRef.current = setInterval(async () => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          // Auto-pause running task after 5 min with no answer
          taskService.stopTaskSession(runningTask.id, user.id).then(() => {
            showToast(`Task "${runningTask.title}" auto-paused due to inactivity.`);
            setIsPromptOpen(false);
            setRunningTask(null);
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownIntervalRef.current);
  }, [isPromptOpen, runningTask, user, showToast]);

  const handleStillWorking = () => {
    lastActivityRef.current = Date.now();
    setIsPromptOpen(false);
    showToast('Activity confirmed. Task timer remains active!');
  };

  const handlePauseTaskNow = async () => {
    if (runningTask && user) {
      await taskService.stopTaskSession(runningTask.id, user.id);
      showToast(`Task "${runningTask.title}" paused.`);
      setIsPromptOpen(false);
      setRunningTask(null);
    }
  };

  if (!isPromptOpen || !runningTask) return null;

  const minutesLeft = Math.floor(countdown / 60);
  const secondsLeft = countdown % 60;

  return (
    <Modal isOpen={isPromptOpen} onClose={handleStillWorking} maxWidth="md">
      <div className="text-center p-4 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] flex items-center justify-center mx-auto animate-bounce">
          <AlertTriangle className="w-7 h-7" />
        </div>

        <div>
          <h3 className="text-xl font-bold text-[var(--tm-ink)]">Still working on this?</h3>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5 max-w-sm mx-auto">
            No mouse or keyboard activity detected for 30 minutes on{' '}
            <span className="font-bold text-[var(--tm-ink)]">"{runningTask.title}"</span>.
          </p>
        </div>

        <div className="bg-[var(--tm-warning-bg)] p-3 rounded-xl border border-[var(--tm-warning-ring)] text-[var(--tm-warning)] text-xs font-semibold flex items-center justify-center gap-2">
          <Clock className="w-4 h-4 text-[var(--tm-warning)] animate-pulse" />
          <span>
            Auto-pausing in {minutesLeft}:{String(secondsLeft).padStart(2, '0')}
          </span>
        </div>

        <div className="flex justify-center gap-3 pt-4 border-t border-[var(--tm-border)]">
          <Button variant="outline" onClick={handlePauseTaskNow}>
            Pause Timer Now
          </Button>
          <Button variant="primary" onClick={handleStillWorking} className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]">
            Yes, Still Working!
          </Button>
        </div>
      </div>
    </Modal>
  );
};
