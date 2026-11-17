import React, { useState } from 'react';
import { Lock, KeyRound, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/useAppStore';
import { accountApi } from '../../services/http/accountApi';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { goToField } from '../../utils/formValidation';

export const ChangePasswordCard: React.FC = () => {
  const { user } = useAuthStore();
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
      setError('Sign in again to change your password.');
      return;
    }

    const problems: { current?: string; new?: string; confirm?: string } = {};
    if (!currentPassword) problems.current = 'Enter your current password';
    if (!newPassword) problems.new = 'Enter a new password';
    else if (newPassword.length < 8) problems.new = 'Use at least 8 characters';
    if (!confirmPassword) problems.confirm = 'Type the new password again';
    else if (newPassword && newPassword !== confirmPassword) problems.confirm = 'The two passwords don’t match';
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems);
      const first = problems.current ? 'current-password' : problems.new ? 'new-password' : 'confirm-new-password';
      requestAnimationFrame(() => {
        const el = document.getElementById(first);
        if (el) goToField(el);
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Save it: every other device is signed out, this one stays
      await accountApi.changePassword(currentPassword, newPassword);

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
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
            <KeyRound className="h-5 w-5" />
          </span>
          <div>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Use 8 or more characters. Other devices are signed out.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-6">
        <form noValidate onSubmit={handleSubmit} className="space-y-4 max-w-md">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-[var(--tm-radius-sm)] bg-[var(--tm-danger-bg)] border border-[var(--tm-danger-ring)] text-[var(--tm-danger)] text-xs font-medium">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-[var(--tm-radius-sm)] bg-[var(--tm-success-bg)] border border-[var(--tm-success-ring)] text-[var(--tm-success)] text-xs font-medium">
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
