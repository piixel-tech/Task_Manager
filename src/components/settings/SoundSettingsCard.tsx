import React from 'react';
import { Volume2, VolumeX, Sparkles } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../ui/Card';
import { Button } from '../ui/Button';
import { Switch } from '../ui/Switch';
import {
  useSoundPreference,
  playDingSound
} from '../../features/tasks/components/TaskCompletionCelebration';

export const SoundSettingsCard: React.FC = () => {
  const { soundEnabled, setSoundEnabled } = useSoundPreference();

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
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-[var(--tm-radius-sm)] transition-colors ${
                soundEnabled
                  ? 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
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

          <Switch checked={soundEnabled} onChange={handleToggle} label="Toggle sound effects" />
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
