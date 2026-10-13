import React, { useEffect, useState } from 'react';
import { Lock, Copy, Edit2, User as UserIcon, Check, X, Camera } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { attendanceService, userService } from '../../../services';
import type { AttendanceDay } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { AvatarPickerModal } from '../../../components/ui/AvatarPickerModal';
import { getTodayDateString, getMonthInfo, formatDate } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { EmployeeTaskTabs } from '../../tasks/components/EmployeeTaskTabs';
import { useUserStore } from '../../../store/useUserStore';

export const ProfilePage: React.FC = () => {
  const { user, changePassword, setUser } = useAuthStore();
  const { showToast } = useAppStore();

  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isEditingCard, setIsEditingCard] = useState(false);

  // Form states
  const [birthdateInput, setBirthdateInput] = useState(user?.birthday || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [savingInfo, setSavingInfo] = useState(false);

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

  const handleAvatarSave = async (newAvatarUrl: string) => {
    if (!user) return;
    try {
      const updated = await userService.updateUser(user.id, { avatarUrl: newAvatarUrl });
      setUser(updated);
      useUserStore.getState().setUser(updated);
      showToast('Avatar updated successfully!');
    } catch (err: any) {
      showToast(err.message || 'Failed to update avatar');
    }
  };

  const handleSavePersonalInfoCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setPasswordError('');

    if (newPassword || confirmPassword || currentPassword) {
      if (!currentPassword) {
        setPasswordError('Please enter your current password.');
        return;
      }
      const freshUser = await userService.getUserById(user.id);
      const actualPassword = freshUser?.password || user.password || 'password123';
      if (currentPassword !== actualPassword) {
        setPasswordError('Current password does not match.');
        return;
      }
      if (newPassword.length < 6) {
        setPasswordError('New password must be at least 6 characters long.');
        return;
      }
      if (newPassword !== confirmPassword) {
        setPasswordError('New password and confirm new password do not match.');
        return;
      }
    }

    setSavingInfo(true);
    try {
      // 1. Update personal info (birthday)
      const updatedUser = await userService.updateUser(user.id, {
        birthday: birthdateInput
      });

      // 2. If password supplied, update password
      if (newPassword) {
        await changePassword(newPassword);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }

      setUser(updatedUser);
      useUserStore.getState().setUser(updatedUser);
      setIsEditingCard(false);
      showToast('Profile information updated successfully!');
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to update profile info');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleCancelEdit = () => {
    setBirthdateInput(user?.birthday || '');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setIsEditingCard(false);
  };

  const copyLoginId = () => {
    if (user?.loginId) {
      navigator.clipboard.writeText(user.loginId);
      showToast('Login ID copied to clipboard!');
    }
  };

  // Build daily hours array for current month
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
        <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">
          My Profile
        </h1>
        <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
          Personal details, avatar customization, and monthly hours summary.
        </p>
      </div>

      {/* User Header Card with Tap-to-Change Avatar */}
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4">
              {/* Tappable Avatar with camera edit overlay */}
              <button
                type="button"
                onClick={() => setIsAvatarModalOpen(true)}
                className="group relative rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary)]"
                title="Tap to change avatar"
              >
                <UserAvatar userId={user?.id} name={user?.name || ''} src={user?.avatarUrl} size="2xl" ring />
                <div className="absolute inset-0 rounded-full bg-black/40 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="w-5 h-5" />
                  <span className="text-[9.5px] font-extrabold uppercase mt-0.5">Edit</span>
                </div>
              </button>

              <div>
                <h2 className="text-xl font-extrabold text-[var(--tm-ink)]">
                  {user?.name}
                </h2>
                <p className="text-xs font-semibold text-[var(--tm-ink-muted)]">{user?.jobTitle}</p>
                <button
                  type="button"
                  onClick={() => setIsAvatarModalOpen(true)}
                  className="mt-2 text-xs font-bold text-[var(--tm-primary)] hover:underline inline-flex items-center gap-1"
                >
                  <Edit2 className="w-3 h-3" /> Tap avatar to change style
                </button>
              </div>
            </div>

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

      {/* Merged Personal Info & Change Password Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div>
            <CardTitle className="text-base font-extrabold flex items-center gap-2">
              <UserIcon className="w-4 h-4 text-[var(--tm-primary)]" />
              Personal Info &amp; Security
            </CardTitle>
            <CardDescription>
              Manage your birthdate and password in one place.
            </CardDescription>
          </div>

          {!isEditingCard && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsEditingCard(true)}
              leftIcon={<Edit2 className="w-3.5 h-3.5" />}
            >
              Edit
            </Button>
          )}
        </CardHeader>

        <CardContent className="p-6">
          {!isEditingCard ? (
            /* READ-ONLY VIEW */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="bg-[var(--tm-card-muted)] p-4 rounded-xl border border-[var(--tm-border)]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)]">
                  Birthdate 🎂
                </div>
                <div className="mt-1 text-sm font-bold text-[var(--tm-ink)]">
                  {user?.birthday ? formatDate(user.birthday) : 'Not set'}
                </div>
              </div>

              <div className="bg-[var(--tm-card-muted)] p-4 rounded-xl border border-[var(--tm-border)]">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)]">
                  Password
                </div>
                <div className="mt-1 text-sm font-bold text-[var(--tm-ink)] font-mono">
                  ••••••••
                </div>
              </div>
            </div>
          ) : (
            /* EDITABLE FORM */
            <form onSubmit={handleSavePersonalInfoCard} className="space-y-5 max-w-2xl">
              {passwordError && (
                <div className="p-3 rounded-lg bg-[var(--tm-danger-bg)] border border-[var(--tm-danger-ring)] text-[var(--tm-danger)] text-xs font-medium">
                  {passwordError}
                </div>
              )}

              <div>
                <Input
                  label="Birthdate"
                  type="date"
                  value={birthdateInput}
                  onChange={(e) => setBirthdateInput(e.target.value)}
                />
              </div>

              <div className="pt-2 border-t border-[var(--tm-border)] space-y-4">
                <p className="text-xs font-bold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                  Update Password (Leave blank to keep current password)
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Input
                    label="Current Password"
                    type="password"
                    placeholder="Current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    leftIcon={<Lock className="w-4 h-4" />}
                  />

                  <Input
                    label="New Password"
                    type="password"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    leftIcon={<Lock className="w-4 h-4" />}
                  />

                  <Input
                    label="Confirm New Password"
                    type="password"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    leftIcon={<Lock className="w-4 h-4" />}
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <Button
                  variant="outline"
                  type="button"
                  onClick={handleCancelEdit}
                  leftIcon={<X className="w-4 h-4" />}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  isLoading={savingInfo}
                  leftIcon={<Check className="w-4 h-4" />}
                >
                  Save Changes
                </Button>
              </div>
            </form>
          )}
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

      {/* Avatar Picker Modal */}
      {user && (
        <AvatarPickerModal
          isOpen={isAvatarModalOpen}
          onClose={() => setIsAvatarModalOpen(false)}
          userName={user.name}
          currentAvatarUrl={user.avatarUrl}
          onSave={handleAvatarSave}
        />
      )}
    </div>
  );
};
