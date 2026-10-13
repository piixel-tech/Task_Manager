import React from 'react';
import { motion } from 'motion/react';
import { Check, Palette } from 'lucide-react';
import { ACCENTS, useThemeStore } from '../../../store/useThemeStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { spring } from '../../../components/ui/motion';
import { ChangePasswordCard } from '../../../components/settings/ChangePasswordCard';
import { SoundSettingsCard } from '../../../components/settings/SoundSettingsCard';

export const EmployeeSettingsPage: React.FC = () => {
  const { accent, setAccent } = useThemeStore();
  const { reduced } = useMotionPrefs();

  return (
    <>
      <PageHeader
        title="Settings &amp; security"
        description="Appearance preferences and account password controls."
      />

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
    </>
  );
};
