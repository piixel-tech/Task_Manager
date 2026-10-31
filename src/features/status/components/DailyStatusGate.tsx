import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useAuthStore } from '../../../store/authStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { socket } from '../../../services/socket';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { dayOffOn, ymdOf } from '../../workspace/dayOff';
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

  // Holidays and weekly offs are not working days: nobody is asked how they are working.
  const workspace = useWorkspaceStore((s) => s.workspace);
  const offToday = !!dayOffOn(workspace, ymdOf(new Date()), user?.companyId);
  const needsAnswer = isStaff && mineLoaded && today?.status === null && !skipped && !offToday;
  const open = needsAnswer || editing;

  // Start from the current answer each time the popup opens.
  useEffect(() => {
    if (open) {
      setChoice(today?.status ?? null);
      setError(null);
    }
  }, [open, today?.status]);

  if (!isStaff) return null;

  const choiceIndex = DAY_STATUSES.findIndex((s) => s.value === choice);
  const choiceMeta = choiceIndex >= 0 ? DAY_STATUSES[choiceIndex] : null;

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
      {/* Radial dial: one quarter of the ticked ring lights up in the chosen status colour. */}
      <div className="relative mx-auto mb-5 h-44 w-44" aria-hidden="true">
        <svg viewBox="0 0 200 200" className="h-full w-full">
          {Array.from({ length: 60 }, (_, i) => {
            const quarter = Math.floor(i / 15);
            const lit = choiceIndex === quarter;
            const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
            const r1 = lit ? 78 : 84;
            return (
              <line
                key={i}
                x1={100 + Math.cos(a) * r1}
                y1={100 + Math.sin(a) * r1}
                x2={100 + Math.cos(a) * 96}
                y2={100 + Math.sin(a) * 96}
                strokeWidth={lit ? 3 : 2}
                strokeLinecap="round"
                style={{
                  stroke: lit ? DAY_STATUSES[quarter].color : 'var(--tm-border-strong)',
                  transition: 'stroke 200ms ease-out'
                }}
              />
            );
          })}
        </svg>
        <div className="absolute inset-[22%] flex flex-col items-center justify-center rounded-full bg-[var(--tm-card)] text-center shadow-soft-sm">
          <span className="text-[15px] font-extrabold leading-tight text-[var(--tm-ink)]">
            {choiceMeta ? choiceMeta.label : 'Pick one'}
          </span>
          {choiceMeta && <span className="mt-0.5 px-2 text-[10.5px] leading-tight text-[var(--tm-ink-muted)]">{choiceMeta.hint}</span>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {DAY_STATUSES.map((s) => {
          const selected = choice === s.value;
          return (
            <button
              key={s.value}
              type="button"
              onClick={() => setChoice(s.value)}
              aria-pressed={selected}
              className={`flex items-center justify-between gap-2 rounded-full px-4 py-3 text-left transition-all duration-200
                hover:-translate-y-px focus-visible:outline-none focus-visible:shadow-glow ${
                  selected
                    ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)] shadow-soft-sm'
                    : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]'
                }`}
            >
              <span className="flex items-center gap-2.5">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="text-[13.5px] font-bold">{s.label}</span>
              </span>
              {selected && <Check className="h-4 w-4 text-[var(--tm-accent)]" />}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="mt-4 tm-error px-4 py-3 text-xs font-semibold">
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
