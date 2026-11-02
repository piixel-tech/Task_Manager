import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Sparkles } from 'lucide-react';
import { create } from 'zustand';
import type { Task } from '../../../types';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { projectService } from '../../../services';
import { amFocused } from '../../../store/useFocusStore';

const SOUND_STORAGE_KEY = 'tm_sound_enabled';

/**
 * Reads the sound preference from localStorage. Defaults to true ('on').
 */
export const getSoundPreference = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const stored = localStorage.getItem(SOUND_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
};

/**
 * Saves the sound preference to localStorage and broadcasts the change.
 */
export const setSoundPreference = (enabled: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent('tm_sound_pref_changed', { detail: enabled }));
  } catch {
    // Ignore localStorage errors
  }
};

/**
 * Hook to reactively subscribe to the sound preference.
 */
export const useSoundPreference = () => {
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(getSoundPreference());

  useEffect(() => {
    const handleStorage = () => setSoundEnabledState(getSoundPreference());
    const handleCustom = (e: any) => {
      if (typeof e.detail === 'boolean') {
        setSoundEnabledState(e.detail);
      } else {
        setSoundEnabledState(getSoundPreference());
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('tm_sound_pref_changed', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('tm_sound_pref_changed', handleCustom);
    };
  }, []);

  const toggleSound = useCallback((val?: boolean) => {
    const nextVal = typeof val === 'boolean' ? val : !getSoundPreference();
    setSoundPreference(nextVal);
    setSoundEnabledState(nextVal);
  }, []);

  return { soundEnabled, setSoundEnabled: toggleSound };
};

/**
 * Synthesizes a soft, subtle "ding" sound via Web Audio API.
 * Uses a gentle two-tone harmonic bell decay (zero external audio file dependencies).
 */
export const playDingSound = (): void => {
  if (!getSoundPreference() || amFocused()) return; // no sounds in Focus mode

  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const ctx = new AudioContextClass();
    const now = ctx.currentTime;

    // Primary fundamental tone: E5 (659.25Hz) sliding smoothly to A5 (880Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain1.gain.setValueAtTime(0.0001, now);
    gain1.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.65);

    osc1.connect(gain1);
    gain1.connect(ctx.destination);

    // Warm harmonic overtone for chime resonance
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1318.5, now); // E6 overtone

    gain2.gain.setValueAtTime(0.0001, now);
    gain2.gain.linearRampToValueAtTime(0.04, now + 0.02);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);

    osc2.connect(gain2);
    gain2.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.7);
    osc2.stop(now + 0.7);

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Fail silently if browser blocks autoplay or Web Audio is unavailable
  }
};

interface CelebrationState {
  active: {
    type: 'task' | 'project';
    taskTitle: string;
    projectName?: string;
  } | null;
  trigger: (options: {
    type: 'task' | 'project';
    taskTitle: string;
    projectName?: string;
  }) => void;
  clear: () => void;
}

export const useCelebrationStore = create<CelebrationState>((set) => ({
  active: null,
  trigger: (options) => {
    set({ active: options });
  },
  clear: () => set({ active: null })
}));

/**
 * Triggers task celebration.
 * - If all tasks in the project are 100% complete: triggers full celebration.
 * - Otherwise: plays subtle task complete checkmark pop (< 1s).
 */
export const triggerTaskCelebration = (
  task: Task,
  options?: {
    allProjectTasks?: Task[];
    projectName?: string;
  }
) => {
  // Play soft ding sound
  playDingSound();

  const projectTasks = options?.allProjectTasks;
  let isProject100 = false;

  if (projectTasks && projectTasks.length > 0) {
    // A project is 100% complete if all tasks in it are now completed
    isProject100 = projectTasks.every((t) => t.id === task.id || t.status === 'completed');
  }

  if (isProject100) {
    if (!options?.projectName && task.projectId) {
      projectService
        .getProjectById(task.projectId)
        .then((prj) => {
          useCelebrationStore.getState().trigger({
            type: 'project',
            taskTitle: task.title,
            projectName: prj?.name || 'Project'
          });
        })
        .catch(() => {
          useCelebrationStore.getState().trigger({
            type: 'project',
            taskTitle: task.title,
            projectName: 'Project'
          });
        });
      return;
    }

    useCelebrationStore.getState().trigger({
      type: 'project',
      taskTitle: task.title,
      projectName: options?.projectName || 'Project'
    });
  } else {
    useCelebrationStore.getState().trigger({
      type: 'task',
      taskTitle: task.title
    });
  }
};

/**
 * Canvas Confetti Particle Renderer
 */
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  vRot: number;
  alpha: number;
}

/** Confetti is drawn on a canvas, which cannot use CSS variables, so read the current palette's colours. */
const CONFETTI_VARS = ['--primary', '--accent', '--text', '--primary-soft', '--tm-primary-light', '--tm-success', '--tm-danger', '--tm-info'];
const confettiColors = (): string[] => {
  const style = getComputedStyle(document.documentElement);
  return CONFETTI_VARS.map((v) => style.getPropertyValue(v).trim()).filter(Boolean);
};

export const TaskCompletionCelebration: React.FC = () => {
  const { active, clear } = useCelebrationStore();
  const { reduced } = useMotionPrefs();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Auto dismiss timers:
  // Under 1s for single task (850ms), 2s for project celebration (2000ms)
  useEffect(() => {
    if (!active) return;
    const duration = active.type === 'project' ? 2200 : 850;
    const timer = setTimeout(() => {
      clear();
    }, duration);
    return () => clearTimeout(timer);
  }, [active, clear]);

  // Canvas particle animation
  useEffect(() => {
    if (!active || reduced || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const width = (canvas.width = window.innerWidth);
    const height = (canvas.height = window.innerHeight);

    const colors = confettiColors();
    const isProject = active.type === 'project';
    const particleCount = isProject ? 120 : 28;
    const particles: Particle[] = [];

    // Origin: center screen for project, bottom-center / middle for subtle task pop
    const originX = width / 2;
    const originY = isProject ? height * 0.35 : height * 0.5;

    for (let i = 0; i < particleCount; i++) {
      const angle = isProject
        ? Math.random() * Math.PI * 2
        : (Math.random() * Math.PI * 1.5) - Math.PI * 0.75;
      const speed = isProject ? Math.random() * 8 + 3 : Math.random() * 5 + 2;

      particles.push({
        x: originX + (Math.random() - 0.5) * 40,
        y: originY + (Math.random() - 0.5) * 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (isProject ? 2 : 3),
        size: Math.random() * 6 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 0.2,
        alpha: 1
      });
    }

    const gravity = isProject ? 0.28 : 0.35;
    const startTime = performance.now();
    const maxDuration = isProject ? 2000 : 800;

    const render = (time: number) => {
      const elapsed = time - startTime;
      ctx.clearRect(0, 0, width, height);

      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += gravity;
        p.vx *= 0.98;
        p.rotation += p.vRot;

        if (elapsed > maxDuration * 0.6) {
          p.alpha = Math.max(0, 1 - (elapsed - maxDuration * 0.6) / (maxDuration * 0.4));
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });

      if (elapsed < maxDuration) {
        animId = requestAnimationFrame(render);
      }
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [active, reduced]);

  if (!active) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center select-none"
      aria-live="polite"
    >
      {/* Confetti canvas for non-reduced motion */}
      {!reduced && (
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
        />
      )}

      <AnimatePresence>
        {active.type === 'task' ? (
          /* Subtle Task Completion Pop (under 1 second) */
          <motion.div
            key="task-pop"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -10 }}
            transition={{ duration: reduced ? 0.15 : 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="flex items-center gap-3 rounded-full bg-[var(--tm-ink)]/90 px-5 py-3 text-[var(--tm-ink-invert)] shadow-soft-xl backdrop-blur-md border border-[var(--tm-ink-invert)]/10"
          >
            <motion.span
              initial={reduced ? undefined : { scale: 0.2, rotate: -20 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ duration: 0.25, delay: 0.05 }}
              className="grid h-7 w-7 place-items-center rounded-full bg-[var(--tm-success)] text-[var(--tm-on-primary)] shadow-soft-sm"
            >
              <Check className="h-4 w-4 stroke-[3]" />
            </motion.span>
            <div className="flex flex-col">
              <span className="text-[13px] font-extrabold leading-tight">Task complete!</span>
              {active.taskTitle && (
                <span className="max-w-[220px] truncate text-[11px] text-[var(--tm-ink-invert)]/70">
                  {active.taskTitle}
                </span>
              )}
            </div>
          </motion.div>
        ) : (
          /* Full Project Completion Celebration (100% complete, ~2 seconds) */
          <motion.div
            key="project-pop"
            initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -15 }}
            transition={{ duration: reduced ? 0.2 : 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative flex flex-col items-center rounded-[var(--tm-radius-lg)] bg-[var(--tm-card)] p-8 text-center shadow-soft-lg border-2 border-[var(--tm-success)]/30 max-w-sm mx-4 backdrop-blur-lg"
          >
            <motion.div
              initial={reduced ? undefined : { scale: 0.5, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="grid h-16 w-16 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-success)] text-[var(--tm-on-primary)] shadow-soft-lg mb-4"
            >
              {reduced ? (
                <Check className="h-9 w-9 stroke-[3]" />
              ) : (
                <Sparkles className="h-9 w-9" />
              )}
            </motion.div>
            <h2 className="text-2xl font-black text-[var(--tm-ink)]">
              Project complete 🎉
            </h2>
            <p className="mt-2 text-sm font-semibold text-[var(--tm-ink-soft)]">
              {active.projectName
                ? `All tasks in "${active.projectName}" are completed!`
                : '100% of project tasks have been finished!'}
            </p>
            <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-success-bg)] px-3.5 py-1 text-xs font-bold text-[var(--tm-success)] dark:text-[var(--tm-success-ring)]">
              <Check className="h-3.5 w-3.5 stroke-[3]" />
              <span>100% Done</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
