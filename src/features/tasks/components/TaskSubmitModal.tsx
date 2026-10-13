import React, { useState, useRef } from 'react';
import { Upload, X, Link as LinkIcon, Paperclip } from 'lucide-react';
import type { Task, AttachedFile } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { useTaskStore } from '../../../store/useTaskStore';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { ChangeRequestBox } from './TaskReview';

interface TaskSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSubmitSuccess: () => void;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const TaskSubmitModal: React.FC<TaskSubmitModalProps> = ({
  isOpen,
  onClose,
  task,
  onSubmitSuccess
}) => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();

  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<AttachedFile[]>([]);
  const [urlInput, setUrlInput] = useState('');
  const [urls, setUrls] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!task) return null;

  const handleFiles = (selectedFiles: File[]) => {
    const newFiles: AttachedFile[] = selectedFiles.map((file) => {
      const objUrl = URL.createObjectURL(file);
      return {
        id: Math.random().toString(36).substring(7),
        name: file.name,
        size: file.size,
        type: file.type || 'application/octet-stream',
        url: objUrl,
        dataUrl: file.type.startsWith('image/') ? objUrl : undefined
      };
    });
    setFiles((prev) => [...prev, ...newFiles]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleAddUrl = () => {
    if (!urlInput.trim()) return;
    let formatted = urlInput.trim();
    if (!formatted.startsWith('http://') && !formatted.startsWith('https://')) {
      formatted = 'https://' + formatted;
    }
    setUrls((prev) => [...prev, formatted]);
    setUrlInput('');
  };

  const removeUrl = (index: number) => {
    setUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const isResubmission = task.reviewStatus === 'changes_requested';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !task) return;
    if (!notes.trim()) {
      showToast('Please enter a note describing your work.');
      return;
    }

    try {
      setIsSubmitting(true);
      // Stop timer if running
      await useTaskStore.getState().stopTaskSession(task.id, user.id).catch(() => {});
      // Submit work: this sets the task to Submitted and waits for admin review.
      await useTaskStore.getState().submitTaskWork(task.id, user.id, notes, files, urls);

      showToast('Task submitted successfully');
      setNotes('');
      setFiles([]);
      setUrls([]);
      onClose();
      onSubmitSuccess();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit task');
    } finally {
      setIsSubmitting(false);
    }
  };

  const todayStr = getTodayDateString();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isResubmission ? 'Resubmit Task' : 'End Task & Submit Deliverable'}
      description={`Task: ${task.title}`}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* The change request being addressed, so it can be re-read while writing the note */}
        <ChangeRequestBox task={task} compact />

        {/* Time and Date Overview */}
        <div className="grid grid-cols-3 gap-3 bg-[var(--tm-card-muted)] p-4 rounded-xl border border-[var(--tm-border)] text-center">
          <div>
            <div className="text-[10px] font-bold text-[var(--tm-ink-muted)] uppercase">Total Time</div>
            <div className="text-base font-bold text-[var(--tm-primary)] mt-0.5">
              {formatHours(task.loggedHours || 0)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[var(--tm-ink-muted)] uppercase">Start Date</div>
            <div className="text-xs font-semibold text-[var(--tm-ink-soft)] mt-1">
              {formatDate(task.startDate || todayStr)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-[var(--tm-ink-muted)] uppercase">End Date</div>
            <div className="text-xs font-semibold text-[var(--tm-ink-soft)] mt-1">
              {formatDate(todayStr)}
            </div>
          </div>
        </div>

        {/* Note: What I Did */}
        <div className="space-y-1">
          <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
            {isResubmission ? 'What I Changed' : 'What I Did'}{' '}
            <span className="text-[var(--tm-danger)]">*</span>
          </label>
          <textarea
            className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
            rows={3}
            placeholder={
              isResubmission
                ? 'Explain how you addressed the requested changes...'
                : 'Summarize the work done, achievements, or deliverables...'
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            required
          />
        </div>

        {/* Attach Files with Drag & Drop */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
            Attach Files (Any type: doc, xls, pdf, images, zip, etc.)
          </label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed border-[var(--tm-border-strong)] bg-[var(--tm-card-muted)] hover:bg-[var(--tm-bg-sunken)] transition-colors text-center cursor-pointer select-none"
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
            <Upload className="w-6 h-6 text-[var(--tm-primary)] mb-1.5" />
            <p className="text-xs font-bold text-[var(--tm-ink)]">
              Drag &amp; drop files here, or{' '}
              <span className="text-[var(--tm-primary)] hover:underline">
                browse
              </span>
            </p>
            <p className="text-[11px] text-[var(--tm-ink-muted)] mt-1">
              Supports documents, spreadsheets, PDFs, images, archives &amp; more.
            </p>
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
              {files.map((f, i) => (
                <div
                  key={f.id || i}
                  className="flex items-center justify-between gap-2 p-2 bg-[var(--tm-card-muted)] border border-[var(--tm-border)] rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2 overflow-hidden min-w-0">
                    {f.dataUrl || (f.url && f.type?.startsWith('image/')) ? (
                      <img
                        src={f.dataUrl || f.url}
                        alt={f.name}
                        className="w-8 h-8 object-cover rounded border border-[var(--tm-border)] shrink-0"
                      />
                    ) : (
                      <Paperclip className="w-4 h-4 text-[var(--tm-ink-muted)] shrink-0" />
                    )}
                    <div className="truncate">
                      <div className="font-semibold text-[var(--tm-ink)] truncate">{f.name}</div>
                      <div className="text-[10px] text-[var(--tm-ink-muted)]">{formatFileSize(f.size)}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeFile(f.id || '');
                    }}
                    className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-danger)] p-1 shrink-0 rounded transition-colors"
                    title="Remove file"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Attach URLs */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
            Attach URLs / Links
          </label>
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. github.com/pull/12 or figma.com/file/xyz"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              className="flex-1"
            />
            <Button type="button" variant="secondary" size="sm" onClick={handleAddUrl} leftIcon={<LinkIcon className="w-3.5 h-3.5" />}>
              Add
            </Button>
          </div>

          {urls.length > 0 && (
            <div className="space-y-1.5 pt-1">
              {urls.map((u, i) => (
                <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[var(--tm-card-muted)] border border-[var(--tm-border)] rounded-lg text-xs">
                  <a href={u} target="_blank" rel="noreferrer" className="text-[var(--tm-primary)] hover:underline truncate">
                    {u}
                  </a>
                  <button type="button" onClick={() => removeUrl(i)} className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-danger)] p-1">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-[var(--tm-border)]">
          <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? 'Submitting...'
              : isResubmission
              ? 'Resubmit for Review'
              : 'Submit for Review'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
