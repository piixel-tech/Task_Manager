import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Card, CardContent } from '../../../components/ui/Card';

export const ChangePasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, changePassword, isLoading, error } = useAuthStore();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError('');

    if (newPassword.length < 6) {
      setValidationError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('Passwords do not match.');
      return;
    }

    try {
      const updatedUser = await changePassword(newPassword);
      if (updatedUser.role === 'admin') {
        navigate('/admin/dashboard');
      } else {
        navigate('/app/tasks');
      }
    } catch (err) {
      // Handled in authStore
    }
  };

  return (
    <div className="min-h-screen bg-[var(--tm-bg)] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="w-12 h-12 rounded-2xl bg-[var(--tm-warning-bg)] text-[var(--tm-warning)] flex items-center justify-center mx-auto mb-3 shadow-xs">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold tracking-tight text-[var(--tm-ink)]">
          Security Action Required
        </h2>
        <p className="mt-1 text-xs text-[var(--tm-ink-muted)] max-w-xs mx-auto">
          Welcome <span className="font-semibold text-[var(--tm-ink)]">{user?.name}</span>! Since this is your first login, please update your temporary password to continue.
        </p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md px-4">
        <Card className="shadow-lg border-[var(--tm-border)]">
          <CardContent className="p-8">
            <form onSubmit={handleSubmit} className="space-y-4">
              {(validationError || error) && (
                <div className="p-3 rounded-lg bg-[var(--tm-danger-bg)] border border-[var(--tm-danger-ring)] text-[var(--tm-danger)] text-xs font-medium">
                  {validationError || error}
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

              <div className="text-xs text-[var(--tm-ink-muted)] space-y-1 bg-[var(--tm-card-muted)] p-3 rounded-lg border border-[var(--tm-border)]">
                <div className="flex items-center gap-1.5 text-[var(--tm-ink-soft)] font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[var(--tm-success)]" /> Password requirements:
                </div>
                <ul className="list-disc list-inside pl-2 space-y-0.5 text-[11px] text-[var(--tm-ink-muted)]">
                  <li>At least 6 characters long</li>
                  <li>Mix of letters and numbers recommended</li>
                </ul>
              </div>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                className="w-full font-semibold"
              >
                Update Password & Proceed
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
