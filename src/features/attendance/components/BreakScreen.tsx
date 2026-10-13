import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useAttendanceStore } from '../../../store/useAttendanceStore';
import { useAppStore } from '../../../store/useAppStore';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';

export interface BreakScreenProps {
  /** Optional manual override if needed */
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * Calm full-screen overlay for breaks.
 * - Shows "Enjoy your break 🍵" with a soft, peaceful background.
 * - Completely hides work-related context: no tasks, no timer countdown, no notifications.
 * - Only shows an "I'm back" button that triggers existing endBreak action.
 */
export const BreakScreen: React.FC<BreakScreenProps> = ({ isOpen: manualIsOpen, onClose: manualOnClose }) => {
  const { user } = useAuthStore();
  const { todayAttendance, endBreak, fetchTodayAttendance } = useAttendanceStore();
  const { showToast } = useAppStore();
  const { reduced } = useMotionPrefs();
  const [isEnding, setIsEnding] = useState(false);

  React.useEffect(() => {
    if (user && !todayAttendance) {
      fetchTodayAttendance(user.id).catch(() => {});
    }
  }, [user, todayAttendance, fetchTodayAttendance]);

  // Check if current user is active on a break
  const activePunch = todayAttendance?.punchSessions.find((s) => !s.punchOut);
  const activeBreak = activePunch?.breaks.find((b) => !b.breakEnd);

  const isBreakActive = manualIsOpen !== undefined ? manualIsOpen : Boolean(activeBreak);

  const handleEndBreak = async () => {
    if (!user || isEnding) return;
    try {
      setIsEnding(true);
      await endBreak(user.id);
      showToast('Welcome back! Your work session has resumed.');
      manualOnClose?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to end break');
    } finally {
      setIsEnding(false);
    }
  };

  return (
    <AnimatePresence>
      {isBreakActive && (
        <motion.div
          key="break-overlay"
          initial={reduced ? { opacity: 0 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0.15 : 0.4 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6 text-center select-none"
          style={{
            background: 'radial-gradient(ellipse at center, #0F2D1F 0%, #081B13 60%, #04100A 100%)'
          }}
          role="dialog"
          aria-modal="true"
          aria-label="Break Screen"
        >
          {/* Subtle Ambient Organic Backlight */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'radial-gradient(circle at 50% 40%, rgba(52, 211, 153, 0.25) 0%, transparent 65%)'
            }}
          />

          <div className="relative z-10 max-w-lg mx-auto flex flex-col items-center">
            {/* Calming Tea Icon / Soft Floating Glow */}
            <motion.div
              initial={reduced ? undefined : { scale: 0.8, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative mb-6"
            >
              <div className="grid h-24 w-24 place-items-center rounded-3xl bg-emerald-500/15 border border-emerald-400/20 text-4xl shadow-2xl backdrop-blur-md">
                🍵
              </div>
              <motion.div
                animate={reduced ? undefined : { rotate: [0, 10, -10, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
                className="absolute -top-1 -right-1 text-emerald-300"
              >
                <Sparkles className="h-5 w-5" />
              </motion.div>
            </motion.div>

            {/* Main Headline */}
            <motion.h1
              initial={reduced ? undefined : { opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-4xl sm:text-5xl font-black tracking-tight text-white"
            >
              Enjoy your break 🍵
            </motion.h1>

            {/* Peaceful, non-work description */}
            <motion.p
              initial={reduced ? undefined : { opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-4 text-base sm:text-lg font-medium text-emerald-100/75 leading-relaxed max-w-md"
            >
              Step away, stretch, sip some tea, and give your mind a restful pause.
              Everything will be right here when you return.
            </motion.p>

            {/* Single Action: "I'm back" button */}
            <motion.div
              initial={reduced ? undefined : { opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-10"
            >
              <button
                type="button"
                onClick={handleEndBreak}
                disabled={isEnding}
                className="group relative inline-flex items-center justify-center gap-2.5 rounded-full bg-white px-8 py-4 text-base font-extrabold text-[#081B13] shadow-xl hover:bg-emerald-50 hover:shadow-2xl transition-all active:scale-95 disabled:opacity-75 cursor-pointer"
              >
                <span>{isEnding ? 'Resuming shift...' : "I'm back"}</span>
              </button>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
