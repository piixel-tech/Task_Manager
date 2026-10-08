import React, { useState } from 'react';
import { Copy, Send, CheckCircle2 } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { gamificationService, chatService } from '../../../services';
import type { WeeklyReport, ChatRoom } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { getTodayDateString } from '../../../utils/time';

interface WeeklyReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  clientRoom?: ChatRoom | null;
}

export const WeeklyReportModal: React.FC<WeeklyReportModalProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  clientRoom
}) => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [startDate, setStartDate] = useState(getTodayDateString());
  const [endDate, setEndDate] = useState(getTodayDateString());
  const [report, setReport] = useState<WeeklyReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    try {
      const rep = await gamificationService.generateWeeklyReport(projectId, startDate, endDate);
      setReport(rep);
    } catch {
      showToast('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(report.summaryMarkdown);
    setCopied(true);
    showToast('Report copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePostToClientRoom = async () => {
    if (!report || !clientRoom || !user) return;
    setPosting(true);
    try {
      await chatService.sendMessage(clientRoom.id, user.id, report.summaryMarkdown);
      showToast('Report posted to Client Room chat!');
      onClose();
    } catch {
      showToast('Failed to post report to Client Room');
    } finally {
      setPosting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Generate Client Weekly Report - ${projectName}`}>
      <div className="space-y-4 text-xs">
        {/* Date Selection */}
        <div className="grid grid-cols-2 gap-3 bg-[var(--tm-card-muted)] p-3.5 rounded-xl border border-[var(--tm-border)]">
          <div>
            <label className="block text-[var(--tm-ink-soft)] font-semibold mb-1">Week Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[var(--tm-border-strong)] rounded-lg text-xs"
            />
          </div>
          <div>
            <label className="block text-[var(--tm-ink-soft)] font-semibold mb-1">Week End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 border border-[var(--tm-border-strong)] rounded-lg text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={handleGenerate} isLoading={loading}>
            Build Report Preview
          </Button>
        </div>

        {/* Report Preview */}
        {report && (
          <div className="space-y-3 pt-2 border-t border-[var(--tm-border)]">
            <div className="bg-[var(--tm-ink)] text-[var(--tm-ink-muted)] p-4 rounded-2xl font-mono text-[11px] whitespace-pre-wrap leading-relaxed shadow-inner border border-[var(--tm-border-strong)]">
              {report.summaryMarkdown}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                leftIcon={copied ? <CheckCircle2 className="w-4 h-4 text-[var(--tm-success)]" /> : <Copy className="w-4 h-4" />}
              >
                {copied ? 'Copied!' : 'Copy Report Text'}
              </Button>

              {clientRoom ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handlePostToClientRoom}
                  isLoading={posting}
                  leftIcon={<Send className="w-4 h-4" />}
                >
                  Post to Client Room Chat
                </Button>
              ) : (
                <span className="text-[11px] text-[var(--tm-ink-muted)] italic">
                  No Client Room setup yet for this project.
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};
