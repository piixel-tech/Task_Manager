import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../store/authStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { socket } from '../../../services/socket';
import { DAY_STATUSES, type DayStatus } from '../statusMeta';

/**
 * Mount once in the app layouts. Loads today's status, asks for it with a popup
 * on the first login of the day (and whenever the user chooses to change it),
 * and keeps the team overview live over the WebSocket.
 */
export const DailyStatusGate: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const { today, mineLoaded, editing, loadMine, loadOverview, setMine, closeEditor, reset } =
    useDailyStatusStore();
  const isStaff = user?.role === 'admin' || user?.role === 'employee';

  const [choice, setChoice] = useState<DayStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // "Skip for now" hides the first-login popup until the next page load.
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (!isStaff) return;
    loadMine();
    const off = socket.on('daily_status', () => loadOverview());
    return () => {
      off();
      reset();
    };
  }, [isStaff, loadMine, loadOverview, reset]);

  const needsAnswer = isStaff && mineLoaded && today?.status === null && !skipped;
  const open = needsAnswer || editing;

  // Start from the current answer each time the popup opens.
  useEffect(() => {
    if (open) {
      setChoice(today?.status ?? null);
      setError(null);
    }
  }, [open, today?.status]);

  if (!isStaff) return null;

  const save = async () => {
    if (!choice) return;
    setSaving(true);
    setError(null);
    try {
      await setMine(choice);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your status');
    } finally {
      setSaving(false);
    }
  };

  const close = () => {
    if (editing) closeEditor();
    else setSkipped(true);
  };

  return (
    <Modal
      isOpen={open}
      onClose={close}
      title={editing ? 'Change today’s status' : 'How are you working today?'}
      description="Everyone on the team can see this on the dashboard and your calendar."
      maxWidth="md"
    >
      <div className="space-y-2.5">
        {DAY_STATUSES.map((s) => {
          const selected = choice === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setChoice(s.value)}
              className={`flex w-full items-center justify-between gap-3 rounded-[var(--tm-radius-md)] border px-4 py-3
                text-left transition-colors ${
                  selected
                    ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-softer)]'
                    : 'border-[var(--tm-border)] bg-[var(--tm-card)] hover:border-[var(--tm-border-strong)]'
                }`}
            >
              <span className="flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                <span className="leading-tight">
                  <span className="block text-[14px] font-bold text-[var(--tm-ink)]">{s.label}</span>
                  <span className="block text-[12px] text-[var(--tm-ink-muted)]">{s.hint}</span>
                </span>
              </span>
              {selected && <Check className="h-4 w-4 text-[var(--tm-primary)]" />}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={close}
          className="text-[12.5px] font-semibold text-[var(--tm-ink-muted)] hover:underline"
        >
          {editing ? 'Cancel' : 'Skip for now'}
        </button>
        <Button onClick={save} isLoading={saving} disabled={!choice || choice === today?.status}>
          {editing ? 'Update status' : 'Confirm status'}
        </Button>
      </div>
    </Modal>
  );
};
