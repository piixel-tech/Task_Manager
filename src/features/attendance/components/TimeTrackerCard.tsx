import React, { useEffect, useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Play, Pause, Square, Coffee } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { useAttendanceStore } from '../../../store/useAttendanceStore';
import type { AttendanceDay } from '../../../types';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { DailyUpdateModal } from '../../gamification/components/DailyUpdateModal';
import {
  calculateDurationMinutes,
  calculateDurationSeconds,
  formatTime,
  getNowISO
} from '../../../utils/time';
import { formatHours } from '../../../utils/format';

/** Subtle curved diagonal line pattern SVG matching design spec */
const CurvedDiagonalPattern: React.FC = () => (
  <svg
    className="pointer-events-none absolute inset-0 h-full w-full opacity-15"
    viewBox="0 0 560 240"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden
    focusable="false"
  >
    <g fill="none" stroke="#ffffff" strokeWidth="1.25">
      <path d="M-60 210C60 210 120 60 260 60s200 150 360 150" />
      <path d="M-60 238C60 238 120 88 260 88s200 150 360 150" />
      <path d="M-60 182C60 182 120 32 260 32s200 150 360 150" />
      <path d="M-60 154C60 154 120 4 260 4s200 150 360 150" />
      <path d="M-60 266C60 266 120 116 260 116s200 150 360 150" />
    </g>
  </svg>
);

/** Single rolling digit component for smooth HH:MM:SS rolls */
const RollingDigit: React.FC<{ value: string }> = ({ value }) => {
  const { reduced } = useMotionPrefs();

  return (
    <span className="relative inline-block h-[1.15em] w-[0.62em] overflow-hidden text-center align-middle">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={reduced ? undefined : { y: '80%', opacity: 0.3 }}
          animate={{ y: '0%', opacity: 1 }}
          exit={reduced ? undefined : { y: '-80%', opacity: 0.3 }}
          transition={{ duration: reduced ? 0 : 0.25, ease: [0.16, 1, 0.3, 1] }}
          className="absolute inset-0 flex items-center justify-center font-light"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
};

export interface TimeTrackerCardProps {
  todayRecord?: AttendanceDay | null;
  onRefresh?: () => void;
  className?: string;
}

export const TimeTrackerCard: React.FC<TimeTrackerCardProps> = ({
  todayRecord: externalRecord,
  onRefresh,
  className = ''
}) => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const { reduced } = useMotionPrefs();
  const {
    todayAttendance: storeRecord,
    punchIn: storePunchIn,
    punchOut: storePunchOut,
    endBreak: storeEndBreak,
    endMyDay: storeEndMyDay,
    fetchTodayAttendance
  } = useAttendanceStore();

  const [nowISO, setNowISO] = useState(getNowISO());
  const [isEndDayModalOpen, setIsEndDayModalOpen] = useState(false);
  const [isDailyUpdateModalOpen, setIsDailyUpdateModalOpen] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchTodayAttendance(user.id);
    }
  }, [user, fetchTodayAttendance]);

  useEffect(() => {
    const interval = setInterval(() => {
      setNowISO(getNowISO());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const todayRecord = externalRecord !== undefined ? externalRecord : storeRecord;

  const activePunch = todayRecord?.punchSessions.find((s) => !s.punchOut);
  const activeBreak = activePunch?.breaks.find((b) => !b.breakEnd);
  const firstPunchInTime = todayRecord?.punchSessions[0]?.punchIn;
  const lastPunchOutSession = todayRecord?.punchSessions.slice().reverse().find((s) => s.punchOut);
  const lastPunchOutTime = lastPunchOutSession?.punchOut;

  // Calculate live break minutes
  let liveBreakMinutes = 0;
  if (todayRecord) {
    for (const session of todayRecord.punchSessions) {
      for (const b of session.breaks) {
        if (b.breakStart) {
          liveBreakMinutes += calculateDurationMinutes(b.breakStart, b.breakEnd || nowISO);
        }
      }
    }
  }

  // Calculate live worked seconds from stored punch timestamps
  let liveWorkedSeconds = 0;
  if (todayRecord) {
    for (const session of todayRecord.punchSessions) {
      if (session.punchIn) {
        const sessSecs = calculateDurationSeconds(session.punchIn, session.punchOut || (activeBreak ? activeBreak.breakStart : nowISO));
        let breakSecs = 0;
        for (const b of session.breaks) {
          if (b.breakStart) {
            breakSecs += calculateDurationSeconds(
              b.breakStart,
              b.breakEnd || (session.punchOut ? session.punchOut : nowISO)
            );
          }
        }
        liveWorkedSeconds += Math.max(0, sessSecs - breakSecs);
      }
    }
  }

  const liveWorkedHours = liveWorkedSeconds / 3600;

  // Format HH:MM:SS
  const formatHHMMSS = (totalSecs: number) => {
    const s = Math.floor(totalSecs % 60);
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerString = formatHHMMSS(Math.floor(liveWorkedSeconds));

  // On break timer calculation
  const breakElapsedSecs = useMemo(() => {
    if (!activeBreak?.breakStart) return 0;
    return Math.floor(calculateDurationSeconds(activeBreak.breakStart, nowISO));
  }, [activeBreak, nowISO]);

  const breakTimerString = useMemo(() => {
    const s = Math.floor(breakElapsedSecs % 60);
    const m = Math.floor((breakElapsedSecs / 60) % 60);
    const h = Math.floor(breakElapsedSecs / 3600);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }, [breakElapsedSecs]);

  // Handle Punch In / Punch Out
  const handleTogglePunch = async () => {
    if (!user) return;
    try {
      if (!activePunch) {
        await storePunchIn(user.id);
        showToast('Punched in! Shift active.');
      } else {
        await storePunchOut(user.id);
        showToast('Punched out. Shift timer paused.');
      }
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to toggle punch');
    }
  };

  const handleEndBreak = async () => {
    if (!user) return;
    try {
      await storeEndBreak(user.id);
      showToast('Break ended. Resumed work session.');
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to end break');
    }
  };

  const handleConfirmEndDay = async () => {
    if (!user) return;
    try {
      await storeEndMyDay(user.id);
      showToast('Shift officially ended!');
      setIsEndDayModalOpen(false);
      setIsDailyUpdateModalOpen(true);
      onRefresh?.();
    } catch (err: any) {
      showToast(err.message || 'Failed to end day');
    }
  };


  return (
    <>
      <div
        className={`relative overflow-hidden rounded-[24px] p-7 sm:p-8 shadow-hero text-white select-none ${className}`}
        style={{
          background: 'linear-gradient(135deg, #0B2A1C 0%, #0F3D27 100%)'
        }}
      >
        <CurvedDiagonalPattern />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Top-left Title Header */}
          <div className="w-full flex items-center justify-between mb-4">
            <h3 className="text-[17px] font-extrabold tracking-tight text-white">
              Time Tracker
            </h3>

            {activeBreak && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11.5px] font-extrabold text-white backdrop-blur-md">
                <Coffee className="h-3.5 w-3.5" />
                On break · {breakTimerString}
              </span>
            )}
          </div>

          {/* Big Centered Timer HH:MM:SS with Smooth Rolling Digits */}
          <div
            className="my-3 text-[52px] sm:text-[68px] font-light leading-none tracking-wider text-white"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {timerString.split('').map((char, i) =>
              char === ':' ? (
                <span key={`colon-${i}`} className="opacity-70 px-0.5">
                  :
                </span>
              ) : (
                <RollingDigit key={`digit-${i}`} value={char} />
              )
            )}
          </div>

          {/* Action Buttons: Play/Pause circle + Stop circle */}
          <div className="mt-7 flex items-center justify-center gap-5">
            {/* Play/Pause Round White Button */}
            {activeBreak ? (
              <motion.button
                type="button"
                whileTap={reduced ? undefined : { scale: 0.95 }}
                onClick={handleEndBreak}
                className="grid h-14 w-14 place-items-center rounded-full bg-white text-[#0F3D27] shadow-lg transition-all hover:scale-105"
                title="End break and resume shift"
              >
                <Play className="h-6 w-6 fill-current ml-0.5" />
              </motion.button>
            ) : (
              <motion.button
                type="button"
                whileTap={reduced ? undefined : { scale: 0.95 }}
                onClick={handleTogglePunch}
                className="grid h-14 w-14 place-items-center rounded-full bg-white text-[#0F3D27] shadow-lg transition-all hover:scale-105"
                title={activePunch ? 'Pause shift / Punch Out' : 'Start shift / Punch In'}
              >
                <AnimatePresence mode="wait" initial={false}>
                  {activePunch ? (
                    <motion.div
                      key="pause-icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: reduced ? 0 : 0.15 }}
                    >
                      <Pause className="h-6 w-6" fill="currentColor" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="play-icon"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      transition={{ duration: reduced ? 0 : 0.15 }}
                    >
                      <Play className="h-6 w-6 fill-current ml-0.5" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            )}

            {/* Red Circle Stop Button = End My Day */}
            <motion.button
              type="button"
              whileTap={reduced ? undefined : { scale: 0.95 }}
              onClick={() => setIsEndDayModalOpen(true)}
              className="grid h-14 w-14 place-items-center rounded-full bg-[#a32a2a] text-white shadow-lg transition-all hover:scale-105"
              title="End My Day"
            >
              <Square className="h-5 w-5 fill-current" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal before End My Day */}
      <Modal
        isOpen={isEndDayModalOpen}
        onClose={() => setIsEndDayModalOpen(false)}
        title="End my shift"
        description="Review today's totals before officially closing the day."
      >
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-5 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-5">
            {[
              ['First punch in', formatTime(firstPunchInTime)],
              ['Last punch out', formatTime(lastPunchOutTime || nowISO)],
              ['Total hours worked', formatHours(liveWorkedHours)],
              ['Break minutes', `${liveBreakMinutes} min`]
            ].map(([label, value]) => (
              <div key={label}>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">
                  {label}
                </div>
                <div className="mt-1 text-[17px] font-extrabold tabular-nums text-[var(--tm-ink)]">
                  {value}
                </div>
              </div>
            ))}
          </div>

          <SlideToConfirm
            label="Slide to end day"
            confirmedLabel="Day ended"
            onConfirm={handleConfirmEndDay}
          />

          <div className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={() => setIsEndDayModalOpen(false)}>
              Keep shift open
            </Button>
          </div>
        </div>
      </Modal>

      {/* Daily Update Summary Modal after ending day */}
      <DailyUpdateModal
        isOpen={isDailyUpdateModalOpen}
        onClose={() => setIsDailyUpdateModalOpen(false)}
      />
    </>
  );
};
