import React, { useEffect, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { taskService, gamificationService } from '../../../services';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';

interface DailyUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
}

export const DailyUpdateModal: React.FC<DailyUpdateModalProps> = ({
  isOpen,
  onClose,
  onSubmitted
}) => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [summaryText, setSummaryText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && user) {
      generateAutoSummary();
    }
  }, [isOpen, user]);

  const generateAutoSummary = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const userTasks = await taskService.getTasks(undefined, user.id);
      
      const finishedToday = userTasks.filter((t) => t.status === 'completed');
      const inProgressToday = userTasks.filter((t) => t.status === 'in_progress' || t.status === 'review');

      let summaryLines: string[] = [];

      if (finishedToday.length > 0) {
        const finishedStr = finishedToday
          .map((t) => `${t.title} (${formatDuration(t.loggedHours || 0)})`)
          .join(', ');
        summaryLines.push(`Finished: ${finishedStr}`);
      }

      if (inProgressToday.length > 0) {
        const inProgStr = inProgressToday
          .map((t) => `${t.title} (${formatDuration(t.loggedHours || 0)})`)
          .join(', ');
        summaryLines.push(`Worked on: ${inProgStr}`);
      }

      if (summaryLines.length === 0) {
        summaryLines.push('Managed daily workflow and team tasks.');
      }

      const generated = `Today: ${summaryLines.join('; ')}`;
      setSummaryText(generated);
    } catch {
      setSummaryText('Today: Worked on assigned tasks and project deliverables.');
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (hours: number): string => {
    const totalMin = Math.round(hours * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !summaryText.trim()) return;

    setSubmitting(true);
    try {
      await gamificationService.saveDailyUpdate(user.id, summaryText.trim());
      showToast('Daily update submitted to Admin feed!');
      if (onSubmitted) onSubmitted();
      onClose();
    } catch {
      showToast('Failed to save daily update');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Submit Daily Update Summary">
      <form onSubmit={handleSubmit} className="space-y-4 text-xs">
        <div className="bg-[var(--tm-primary-softer)] border border-[var(--tm-primary-soft)] p-3 rounded-[var(--tm-radius-sm)] flex items-start gap-2 text-[var(--tm-primary-dark)]">
          <Sparkles className="w-4 h-4 text-[var(--tm-primary-dark)] mt-0.5 shrink-0" />
          <p>
            Auto-generated summary based on your logged tasks today. You can edit this text before posting to the Admin's Daily Updates feed.
          </p>
        </div>

        <div>
          <label className="block text-[var(--tm-ink-soft)] font-semibold mb-1">Your Summary Digest</label>
          <textarea
            rows={4}
            value={summaryText}
            onChange={(e) => setSummaryText(e.target.value)}
            disabled={loading}
            className="w-full px-3 py-2 border border-[var(--tm-border-strong)] rounded-[var(--tm-radius-sm)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary)] focus:border-[var(--tm-primary)] text-[var(--tm-ink)]"
            placeholder="Write or edit your daily summary..."
          />
        </div>

        <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Skip
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={submitting}
            disabled={loading || !summaryText.trim()}
            leftIcon={<Send className="w-4 h-4" />}
          >
            Submit to Admin Feed
          </Button>
        </div>
      </form>
    </Modal>
  );
};
