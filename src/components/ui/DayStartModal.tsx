import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sun, CheckCircle2, Palmtree } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { attendanceService } from '../../services';
import { Modal } from './Modal';
import { getTodayDateString, formatDate } from '../../utils/time';

export const DayStartModal: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user || user.role === 'admin') return;

    const todayStr = getTodayDateString();
    attendanceService.getAttendance(user.id, todayStr).then((records) => {
      if (records.length === 0) {
        setIsOpen(true);
      } else {
        const todayRecord = records[0];
        if (todayRecord.status === 'on_leave') {
          if (window.location.pathname.startsWith('/app/tasks') || window.location.pathname.startsWith('/app/attendance')) {
            navigate('/app/leave', { replace: true });
          }
        }
      }
    });
  }, [user, navigate]);

  if (!isOpen || !user || user.role === 'admin') return null;

  const handleSelectStatus = async (status: 'present' | 'on_leave') => {
    setLoading(true);
    try {
      await attendanceService.markDayStatus(user.id, status);
      setIsOpen(false);
      if (status === 'on_leave') {
        navigate('/app/leave', { replace: true });
      }
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {}}
      maxWidth="md"
    >
      <div className="text-center p-2 space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center mx-auto shadow-xs">
          <Sun className="w-7 h-7" />
        </div>

        <div>
          <span className="text-[11px] font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider">
            {formatDate(getTodayDateString(), 'EEEE, MMMM dd, yyyy')}
          </span>
          <h3 className="text-xl font-bold text-[var(--tm-ink)] mt-1">
            Good morning, {user.name}!
          </h3>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
            Please select your shift status for today to continue to your workspace.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => handleSelectStatus('present')}
            className="p-5 rounded-2xl border-2 border-[var(--tm-success-ring)] hover:border-[var(--tm-success)] bg-[var(--tm-success-bg)] hover:bg-[var(--tm-success-bg)] text-left transition-all group"
          >
            <CheckCircle2 className="w-6 h-6 text-[var(--tm-success)] mb-2 group-hover:scale-110 transition-transform" />
            <div className="font-bold text-[var(--tm-ink)] text-base">Present</div>
            <div className="text-xs text-[var(--tm-ink-muted)] mt-0.5">Start work shift & punch in</div>
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={() => handleSelectStatus('on_leave')}
            className="p-5 rounded-2xl border-2 border-[var(--tm-warning-ring)] hover:border-[var(--tm-warning)] bg-[var(--tm-warning-bg)] hover:bg-[var(--tm-warning-bg)] text-left transition-all group"
          >
            <Palmtree className="w-6 h-6 text-[var(--tm-warning)] mb-2 group-hover:scale-110 transition-transform" />
            <div className="font-bold text-[var(--tm-ink)] text-base">On Leave</div>
            <div className="text-xs text-[var(--tm-ink-muted)] mt-0.5">Taking the day off today</div>
          </button>
        </div>
      </div>
    </Modal>
  );
};
