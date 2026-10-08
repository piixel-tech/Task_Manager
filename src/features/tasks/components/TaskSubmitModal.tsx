import React, { useState } from 'react';
import { Upload, X, Link as LinkIcon, Paperclip } from 'lucide-react';
import { taskService } from '../../../services';
import type { Task, AttachedFile } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { formatHours } from '../../../utils/format';

interface TaskSubmitModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSubmitSuccess: () => void;
}

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

  if (!task) return null;

  const handleFiles = (selectedFiles: File[]) => {
    selectedFiles.forEach((file) => {
      const isImage = file.type.startsWith('image/');
      if (isImage) {
        const reader = new FileReader();
        reader.onload = (event) => {
          setFiles((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substring(7),
              name: file.name,
              size: file.size,
              type: file.type || 'image',
              dataUrl: event.target?.result as string
            }
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        setFiles((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substring(7),
            name: file.name,
            size: file.size,
            type: file.type || 'file'
          }
        ]);
      }
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    handleFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
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
      await taskService.stopTaskSession(task.id, user.id).catch(() => {});
      // Submit work
      await taskService.submitTaskWork(task.id, user.id, notes, files, urls);
      // Update task status directly to completed (Done)
      await taskService.updateTask(task.id, { status: 'completed' });

      showToast('Task completed and deliverable submitted!');
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
      title="End Task & Submit Deliverable"
      description={`Task: ${task.title}`}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
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
            What I Did <span className="text-[var(--tm-danger)]">*</span>
          </label>
          <textarea
            className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
            rows={3}
            placeholder="Summarize the work done, achievements, or deliverables..."
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
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="flex flex-col items-center justify-center p-5 rounded-xl border-2 border-dashed border-[var(--tm-border-strong)] bg-[var(--tm-card-muted)] hover:bg-[var(--tm-bg-sunken)] transition-colors text-center cursor-pointer"
          >
            <Upload className="w-6 h-6 text-[var(--tm-primary)] mb-1.5" />
            <p className="text-xs font-bold text-[var(--tm-ink)]">
              Drag &amp; drop files here, or{' '}
              <label className="text-[var(--tm-primary)] hover:underline cursor-pointer">
                browse
                <input
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </p>
            <p className="text-[11px] text-[var(--tm-ink-muted)] mt-1">
              Supports documents, spreadsheets, PDFs, images, archives &amp; more.
            </p>
          </div>

          {files.length > 0 && (
            <div className="grid grid-cols-2 gap-2 pt-2">
              {files.map((f, i) => (
                <div key={f.id || i} className="flex items-center justify-between gap-2 p-2 bg-[var(--tm-card-muted)] border border-[var(--tm-border)] rounded-lg text-xs">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {f.dataUrl ? (
                      <img src={f.dataUrl} alt={f.name} className="w-8 h-8 object-cover rounded border border-[var(--tm-border)] shrink-0" />
                    ) : (
                      <Paperclip className="w-4 h-4 text-[var(--tm-ink-muted)] shrink-0" />
                    )}
                    <div className="truncate">
                      <div className="font-semibold text-[var(--tm-ink)] truncate">{f.name}</div>
                      <div className="text-[10px] text-[var(--tm-ink-muted)]">{(f.size / 1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeFile(f.id || '')} className="text-[var(--tm-ink-muted)] hover:text-[var(--tm-danger)] p-1">
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
            {isSubmitting ? 'Submitting...' : 'Submit & Complete Task'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
