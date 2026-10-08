import React, { useEffect, useState } from 'react';
import { Lock, Copy, Key } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { attendanceService, userService } from '../../../services';
import type { AttendanceDay } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { UserName } from '../../../components/ui/UserName';
import { getTodayDateString, getMonthInfo } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { EmployeeTaskTabs } from '../../tasks/components/EmployeeTaskTabs';

export const ProfilePage: React.FC = () => {
  const { user, changePassword, isLoading, setUser } = useAuthStore();
  const { showToast } = useAppStore();

  const [birthdateInput, setBirthdateInput] = useState(user?.birthday || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [monthAttendance, setMonthAttendance] = useState<AttendanceDay[]>([]);

  const todayStr = getTodayDateString();
  const [year, month] = todayStr.split('-').map(Number);
  const { totalDays } = getMonthInfo(year, month - 1);

  useEffect(() => {
    if (user?.id) {
      attendanceService.getAttendance(user.id).then((records) => {
        setMonthAttendance(records);
      });
      if (user.birthday) setBirthdateInput(user.birthday);
    }
  }, [user]);

  const handleUpdateBirthdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
      const updated = await userService.updateUser(user.id, { birthday: birthdateInput });
      if (updated) {
        setUser(updated);
        showToast('Birthdate saved successfully! 🎂');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to update birthdate');
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    try {
      await changePassword(newPassword);
      showToast('Password updated successfully!');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update password');
    }
  };

  const copyLoginId = () => {
    if (user?.loginId) {
      navigator.clipboard.writeText(user.loginId);
      showToast('Login ID copied to clipboard!');
    }
  };

  // Build daily hours array for current month (days 1 to totalDays)
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const dailyHoursData = Array.from({ length: totalDays }).map((_, idx) => {
    const dayNum = idx + 1;
    const dateStr = `${monthPrefix}-${String(dayNum).padStart(2, '0')}`;
    const att = monthAttendance.find((a) => a.date === dateStr);
    return {
      dayNum,
      dateStr,
      hours: att ? att.totalHours : 0,
      status: att ? att.status : 'not_marked'
    };
  });

  const maxHours = Math.max(...dailyHoursData.map((d) => d.hours), 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">Employee Profile</h1>
        <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
          Personal credentials, company assignment, and monthly hours breakdown.
        </p>
      </div>

      {/* User Info Header Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            {user && <UserName user={user} size="lg" showBadge={false} />}

            <div className="flex items-center gap-2 bg-[var(--tm-card-muted)] p-2 px-3 rounded-xl border border-[var(--tm-border)]">
              <span className="text-xs text-[var(--tm-ink-muted)] font-semibold">Login ID:</span>
              <span className="font-mono text-xs font-bold text-[var(--tm-primary)] bg-[var(--tm-primary-softer)] px-2 py-0.5 rounded">
                {user?.loginId}
              </span>
              <button
                onClick={copyLoginId}
                className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink-soft)] p-1 rounded"
                title="Copy Login ID"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Birthdate & Profile Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-extrabold flex items-center gap-2">
            🎂 Birthdate &amp; Personal Info
          </CardTitle>
          <CardDescription>Enter your birthdate to receive birthday wishes and badges.</CardDescription>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleUpdateBirthdate} className="flex flex-col sm:flex-row items-end gap-4 max-w-md">
            <Input
              label="Birthdate"
              type="date"
              value={birthdateInput}
              onChange={(e) => setBirthdateInput(e.target.value)}
              className="flex-1"
              required
            />
            <Button type="submit" variant="primary">
              Save Birthdate
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* 4 Task Tabs Section */}
      {user && (
        <Card>
          <CardContent className="p-6">
            <EmployeeTaskTabs userId={user.id} />
          </CardContent>
        </Card>
      )}

      {/* Monthly Worked Hours Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Hours Worked This Month</CardTitle>
          <CardDescription>Daily shift hours breakdown for current month</CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="h-44 flex items-end gap-1 sm:gap-1.5 pt-6 pb-2 px-2 overflow-x-auto border-b border-[var(--tm-border)]">
            {dailyHoursData.map((d) => {
              const heightPercent = Math.round((d.hours / maxHours) * 100);
              const barColor =
                d.hours >= 8
                  ? 'bg-[var(--tm-success)]'
                  : d.hours > 0
                  ? 'bg-[var(--tm-primary)]'
                  : d.status === 'on_leave'
                  ? 'bg-[var(--tm-danger)]'
                  : 'bg-[var(--tm-bg-sunken)]';

              return (
                <div key={d.dayNum} className="flex-1 min-w-[14px] flex flex-col items-center gap-1 group relative">
                  {/* Hover tooltip */}
                  <div className="absolute -top-8 hidden group-hover:flex bg-[var(--tm-ink)] text-white text-[10px] px-2 py-0.5 rounded whitespace-nowrap shadow-md z-10">
                    Day {d.dayNum}: {formatHours(d.hours)}
                  </div>
                  <div
                    className={`w-full ${barColor} rounded-t transition-all duration-300 group-hover:opacity-80`}
                    style={{ height: `${Math.max(4, heightPercent)}%` }}
                  />
                  <span className="text-[9px] font-semibold text-[var(--tm-ink-muted)]">{d.dayNum}</span>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-6 text-xs text-[var(--tm-ink-muted)] pt-2">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[var(--tm-success)]" /> Target Reached (8h+)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[var(--tm-primary)]" /> Partial Shift
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded bg-[var(--tm-danger)]" /> On Leave
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Security & Password Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Key className="w-5 h-5 text-[var(--tm-primary)]" />
            <CardTitle>Change Password</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <form onSubmit={handleChangePassword} className="max-w-md space-y-4">
            {passwordError && (
              <div className="p-3 rounded-lg bg-[var(--tm-danger-bg)] border border-[var(--tm-danger-ring)] text-[var(--tm-danger)] text-xs font-medium">
                {passwordError}
              </div>
            )}

            <Input
              label="New Password"
              type="password"
              placeholder="Enter new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />

            <Input
              label="Confirm New Password"
              type="password"
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isLoading}
            >
              Update Password
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

