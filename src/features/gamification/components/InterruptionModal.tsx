import React, { useState } from 'react';
import { PauseCircle } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';

interface InterruptionModalProps {
  isOpen: boolean;
  taskTitle: string;
  onConfirm: (reason: string, note?: string) => void;
  onSkip: () => void;
}

const COMMON_REASONS = [
  'Pulled into urgent work',
  'Client call / meeting',
  'Code blocker / bug investigation',
  'Lunch / Tea break',
  'Reviewing teammate submission',
  'Other'
];

export const InterruptionModal: React.FC<InterruptionModalProps> = ({
  isOpen,
  taskTitle,
  onConfirm,
  onSkip
}) => {
  const [selectedReason, setSelectedReason] = useState(COMMON_REASONS[0]);
  const [customNote, setCustomNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirm(selectedReason, customNote.trim() || undefined);
    setCustomNote('');
  };

  return (
    <Modal isOpen={isOpen} onClose={onSkip} title="Pause Task - Add Interruption Log">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="bg-[var(--tm-card-muted)] p-3.5 rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
          <div className="text-[var(--tm-ink-muted)] font-semibold text-[10px] uppercase">Pausing Task</div>
          <div className="text-sm font-bold text-[var(--tm-ink)]">{taskTitle}</div>
        </div>

        <div>
          <label className="block text-[var(--tm-ink-soft)] font-medium mb-1.5">Quick Pause Reason (Optional)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {COMMON_REASONS.map((reason) => (
              <button
                type="button"
                key={reason}
                onClick={() => setSelectedReason(reason)}
                className={`p-2.5 rounded-[var(--tm-radius-sm)] border text-left font-medium transition-all ${
                  selectedReason === reason
                    ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-softer)] text-[var(--tm-primary-dark)] shadow-soft-sm'
                    : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-card-muted)]'
                }`}
              >
                {reason}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[var(--tm-ink-soft)] font-medium mb-1">Additional Note (Optional)</label>
          <input
            type="text"
            value={customNote}
            onChange={(e) => setCustomNote(e.target.value)}
            placeholder="e.g., Fixing critical production issue on Client portal"
            className="w-full px-3 py-2 border border-[var(--tm-border-strong)] rounded-[var(--tm-radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary)] focus:border-[var(--tm-primary)]"
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
          <Button type="button" variant="outline" size="sm" onClick={onSkip}>
            Skip & Just Pause
          </Button>
          <Button type="submit" variant="primary" size="sm" leftIcon={<PauseCircle className="w-4 h-4" />}>
            Log & Pause Task
          </Button>
        </div>
      </form>
    </Modal>
  );
};
