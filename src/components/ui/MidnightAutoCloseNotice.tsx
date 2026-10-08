import React, { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { attendanceService } from '../../services';
import type { AttendanceDay } from '../../types';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';
import { getTodayDateString, formatDate } from '../../utils/time';

export const MidnightAutoCloseNotice: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [flaggedRecord, setFlaggedRecord] = useState<AttendanceDay | null>(null);
  const [correctedTime, setCorrectedTime] = useState('');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!user || user.role === 'admin') return;

    const todayStr = getTodayDateString();
    attendanceService.getAttendance(user.id).then((records) => {
      // Find past records that have unclosed punch sessions or are flagged
      for (const rec of records) {
        if (rec.date < todayStr) {
          const openSess = rec.punchSessions.find((s) => !s.punchOut);
          if (openSess) {
            // Auto-close past day at 23:59:59
            const closedISO = `${rec.date}T23:59:59.000Z`;
            openSess.punchOut = closedISO;
            rec.flagged = true;
            rec.autoClosed = true;
          }
          if (rec.flagged) {
            setFlaggedRecord(rec);
            setCorrectedTime('18:00'); // default suggested punch out
            break;
          }
        }
      }
    });
  }, [user]);

  if (!flaggedRecord || !user) return null;

  const handleCorrectTime = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctedTime || !reason) return;

    try {
      const correctedISO = `${flaggedRecord.date}T${correctedTime}:00.000Z`;
      await attendanceService.correctPunchOutTime(flaggedRecord.id, correctedISO, reason);
      showToast('Punch-out time corrected and submitted for audit log.');
      setFlaggedRecord(null);
    } catch (err: any) {
      showToast(err.message || 'Error saving time correction');
    }
  };

  return (
    <Modal
      isOpen={!!flaggedRecord}
      onClose={() => {}} // Mandatory correction prompt
      title="Attendance Time Correction Required"
      maxWidth="md"
    >
      <form onSubmit={handleCorrectTime} className="space-y-4">
        <div className="p-3 bg-[var(--tm-warning-bg)] border border-[var(--tm-warning-ring)] rounded-xl text-[var(--tm-warning)] text-xs flex items-start gap-2.5">
          <AlertCircle className="w-5 h-5 text-[var(--tm-warning)] shrink-0 mt-0.5" />
          <div>
            <div className="font-bold">Unclosed Shift Flagged</div>
            <p className="mt-0.5 text-[var(--tm-warning)]">
              Your shift on <span className="font-bold">{formatDate(flaggedRecord.date)}</span> was not punched out before midnight and was auto-closed. Please enter your actual punch-out time and reason.
            </p>
          </div>
        </div>

        <Input
          label="Actual Punch Out Time"
          type="time"
          value={correctedTime}
          onChange={(e) => setCorrectedTime(e.target.value)}
          required
        />

        <div className="space-y-1">
          <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
            Reason for Correction
          </label>
          <textarea
            className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
            rows={3}
            placeholder="e.g. Forgot to punch out before leaving office at 6 PM..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-[var(--tm-border)]">
          <Button variant="primary" type="submit">
            Submit Time Correction
          </Button>
        </div>
      </form>
    </Modal>
  );
};
