import React from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../ui/Card';
import { Button } from '../ui/Button';
import { useMotionPrefs } from '../ui/useMotionPrefs';
import { spring } from '../ui/motion';
import {
  useSoundPreference,
  playDingSound
} from '../../features/tasks/components/TaskCompletionCelebration';

export const SoundSettingsCard: React.FC = () => {
  const { soundEnabled, setSoundEnabled } = useSoundPreference();
  const { reduced } = useMotionPrefs();

  const handleToggle = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    if (next) {
      // Play brief test sound when toggled on
      setTimeout(() => playDingSound(), 50);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-[14px] transition-colors ${
                soundEnabled
                  ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary)]'
                  : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-muted)]'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="h-5 w-5" />
              ) : (
                <VolumeX className="h-5 w-5" />
              )}
            </span>
            <div>
              <CardTitle>Audio &amp; sound effects</CardTitle>
              <CardDescription>
                Play a soft chime when tasks or projects are marked complete. Your preference is
                saved on this device.
              </CardDescription>
            </div>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={soundEnabled}
            onClick={handleToggle}
            className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
              soundEnabled ? 'bg-[var(--tm-primary)]' : 'bg-[var(--tm-border-strong)]'
            }`}
          >
            <span className="sr-only">Toggle sound effects</span>
            <motion.span
              layout
              transition={reduced ? { duration: 0 } : spring}
              className={`pointer-events-none inline-block h-6 w-6 rounded-full bg-white shadow-md transform transition-transform ${
                soundEnabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-[var(--tm-ink-soft)]">
            <span
              className={`h-2 w-2 rounded-full ${
                soundEnabled ? 'bg-[var(--tm-success)]' : 'bg-[var(--tm-ink-muted)]'
              }`}
            />
            <span>Status: {soundEnabled ? 'Sound is enabled (default)' : 'Muted'}</span>
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={playDingSound}
            disabled={!soundEnabled}
            leftIcon={<Sparkles className="h-3.5 w-3.5" />}
          >
            Test soft ding
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
