import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { Check, Palette, RotateCcw } from 'lucide-react';
import { resetDemoData, userService } from '../../../services';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { ACCENTS, useThemeStore } from '../../../store/useThemeStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/ui/PageHeader';
import { SlideToConfirm } from '../../../components/ui/SlideToConfirm';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { spring } from '../../../components/ui/motion';
import { ChangePasswordCard } from '../../../components/settings/ChangePasswordCard';
import { SoundSettingsCard } from '../../../components/settings/SoundSettingsCard';

export const AdminSettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, setUser } = useAuthStore();
  const { showToast } = useAppStore();
  const { accent, setAccent } = useThemeStore();
  const { reduced } = useMotionPrefs();

  const [birthdateInput, setBirthdateInput] = useState(user?.birthday || '');
  const [resetOpen, setResetOpen] = useState(false);

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

  const handleResetData = async () => {
    resetDemoData();
    showToast('Demo data successfully reset to initial seed state.');
    setResetOpen(false);
    await logout();
    navigate('/login');
  };

  return (
    <>
      <PageHeader
        title="Settings &amp; data"
        description="Appearance, workspace date simulation and demo data controls."
      />

      {/* Birthdate Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-extrabold flex items-center gap-2">
            🎂 My Birthdate &amp; Profile
          </CardTitle>
          <CardDescription>Set your birthdate for team birthday notifications and badges.</CardDescription>
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

      {/* Change Password */}
      <ChangePasswordCard />

      {/* Sound Settings */}
      <SoundSettingsCard />

      {/* Accent theme */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--tm-primary-soft)] text-[var(--tm-primary)]">
              <Palette className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>Accent theme</CardTitle>
              <CardDescription>
                Changes the accent colour across the whole app. Your choice is remembered on this
                device.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
            {ACCENTS.map((option) => {
              const isActive = option.id === accent;
              return (
                <motion.button
                  key={option.id}
                  onClick={() => setAccent(option.id)}
                  whileTap={reduced ? undefined : { scale: 0.97 }}
                  whileHover={reduced ? undefined : { y: -3 }}
                  transition={reduced ? { duration: 0 } : spring}
                  aria-pressed={isActive}
                  className={`relative overflow-hidden rounded-[var(--tm-radius-lg)] border p-4 text-left
                    transition-colors
                    ${isActive
                      ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-softer)]'
                      : 'border-[var(--tm-border)] bg-[var(--tm-card)] hover:border-[var(--tm-border-strong)]'
                    }`}
                >
                  <span className="flex items-center justify-between">
                    <span
                      className="h-9 w-9 rounded-full shadow-soft-sm"
                      style={{ background: option.swatch }}
                    />
                    {isActive && (
                      <motion.span
                        initial={reduced ? false : { scale: 0.6, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={spring}
                        className="grid h-6 w-6 place-items-center rounded-full bg-[var(--tm-primary)] text-white"
                      >
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </motion.span>
                    )}
                  </span>

                  <span className="mt-3 block text-[14px] font-bold text-[var(--tm-ink)]">
                    {option.label}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--tm-ink-muted)]">
                    {option.note}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="max-w-2xl">
        {/* Reset */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3.5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]">
                <RotateCcw className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Reset demo data</CardTitle>
                <CardDescription>Restore the initial workspace seed state.</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5">
            <p className="text-[13px] leading-relaxed text-[var(--tm-ink-soft)]">
              This erases all current local changes and re-populates storage with the original
              admin (CEO), six employees across Piixel and Unwork, three projects and six tasks.
              You will be signed out.
            </p>

            <Button
              variant="danger"
              size="sm"
              onClick={() => setResetOpen(true)}
              leftIcon={<RotateCcw className="h-4 w-4" />}
            >
              Reset demo data
            </Button>
          </CardContent>
        </Card>
      </div>

      <Modal
        isOpen={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset all demo data?"
        description="Every local change is erased and the workspace returns to its seed state. This cannot be undone."
        maxWidth="md"
      >
        <div className="space-y-5">
          <div className="rounded-[var(--tm-radius-md)] bg-[var(--tm-danger-bg)] px-4 py-3.5 text-[13px] leading-relaxed text-[var(--tm-danger)]">
            You will be signed out and returned to the login screen.
          </div>

          <SlideToConfirm
            label="Slide to reset"
            confirmedLabel="Resetting…"
            tone="danger"
            onConfirm={handleResetData}
          />
        </div>
      </Modal>
    </>
  );
};
