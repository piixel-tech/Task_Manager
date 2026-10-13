import React, { useState } from 'react';
import { Lock, KeyRound, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { useUserStore } from '../../store/useUserStore';
import { userService, authService } from '../../services';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';

export const ChangePasswordCard: React.FC = () => {
  const { user, setUser } = useAuthStore();
  const { showToast } = useAppStore();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    current?: string;
    new?: string;
    confirm?: string;
  }>({});
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setFieldErrors({});
    setSuccess('');

    if (!user) {
      setError('You must be logged in to change your password.');
      return;
    }

    if (!currentPassword) {
      setFieldErrors((prev) => ({ ...prev, current: 'Current password is required.' }));
      setError('Please fill in all password fields.');
      return;
    }

    if (!newPassword) {
      setFieldErrors((prev) => ({ ...prev, new: 'New password is required.' }));
      setError('Please fill in all password fields.');
      return;
    }

    if (!confirmPassword) {
      setFieldErrors((prev) => ({ ...prev, confirm: 'Please confirm your new password.' }));
      setError('Please fill in all password fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Validate current password against stored user record
      const freshUser = await userService.getUserById(user.id);
      const actualPassword = freshUser?.password || user.password || 'password123';

      if (currentPassword !== actualPassword) {
        setFieldErrors({ current: 'Current password does not match.' });
        setError('Current password does not match.');
        setIsSubmitting(false);
        return;
      }

      // 2. Validate new password is at least 6 characters
      if (newPassword.length < 6) {
        setFieldErrors({ new: 'New password must be at least 6 characters.' });
        setError('New password must be at least 6 characters.');
        setIsSubmitting(false);
        return;
      }

      // 3. Validate new and confirm match
      if (newPassword !== confirmPassword) {
        setFieldErrors({ confirm: 'New password and confirm new password do not match.' });
        setError('New password and confirm new password do not match.');
        setIsSubmitting(false);
        return;
      }

      // 4. Update password
      const updated = await authService.changePassword(user.id, newPassword);
      setUser(updated);
      useUserStore.getState().setUser(updated);

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError('');
      setFieldErrors({});
      setSuccess('Password updated');
      showToast('Password updated');
    } catch (err: any) {
      setError(err.message || 'Failed to update password');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--tm-primary-soft)] text-[var(--tm-primary)]">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Update your account password. Must be at least 6 characters.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--tm-danger-bg)] border border-[var(--tm-danger-ring)] text-[var(--tm-danger)] text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-[var(--tm-success-bg)] border border-[var(--tm-success-ring)] text-[var(--tm-success)] text-xs font-medium">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <div>
            <Input
              label="Current Password"
              type={showCurrent ? 'text' : 'password'}
              placeholder="Enter current password"
              value={currentPassword}
              onChange={(e) => {
                setCurrentPassword(e.target.value);
                if (error || fieldErrors.current) {
                  setError('');
                  setFieldErrors((prev) => ({ ...prev, current: undefined }));
                }
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="hover:text-[var(--tm-ink)] focus:outline-none"
                  tabIndex={-1}
                  title={showCurrent ? 'Hide password' : 'Show password'}
                >
                  {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={fieldErrors.current}
              required
            />
          </div>

          <div>
            <Input
              label="New Password"
              type={showNew ? 'text' : 'password'}
              placeholder="At least 6 characters"
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                if (error || fieldErrors.new) {
                  setError('');
                  setFieldErrors((prev) => ({ ...prev, new: undefined }));
                }
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="hover:text-[var(--tm-ink)] focus:outline-none"
                  tabIndex={-1}
                  title={showNew ? 'Hide password' : 'Show password'}
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={fieldErrors.new}
              required
            />
          </div>

          <div>
            <Input
              label="Confirm New Password"
              type={showConfirm ? 'text' : 'password'}
              placeholder="Re-enter new password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                if (error || fieldErrors.confirm) {
                  setError('');
                  setFieldErrors((prev) => ({ ...prev, confirm: undefined }));
                }
              }}
              leftIcon={<Lock className="w-4 h-4" />}
              rightIcon={
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="hover:text-[var(--tm-ink)] focus:outline-none"
                  tabIndex={-1}
                  title={showConfirm ? 'Hide password' : 'Show password'}
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              }
              error={fieldErrors.confirm}
              required
            />
          </div>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              isLoading={isSubmitting}
            >
              Update Password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
