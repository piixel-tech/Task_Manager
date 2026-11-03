import React, { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronDown, FilePlus2, FileText, HardDrive, Paperclip, Plus, Sheet, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { popoverVariants } from '../../components/ui/motion';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/useToastStore';
import { isJobCancelled, runJob } from '../../services/jobs';
import { googleApi, type DriveFilter } from '../../services/http/googleApi';
import type { Asset } from '../../services/http/taskApi';
import { DriveBrowserModal } from './DriveBrowserModal';
import { reportGoogleError } from './googleUtils';

interface Props {
  /** Files chosen from the device. Leave out where uploads make no sense (Google files only). */
  onUpload?: (files: File[]) => void | Promise<void>;
  /** Drive files picked or created (already saved as links). */
  onAdded: (files: Asset[]) => void | Promise<void>;
  /** A round "+" button inside the chat box, or the labelled "Attach" button everywhere else. */
  variant?: 'button' | 'icon';
  /** Which way the menu opens (up in the chat box, which sits at the bottom of the screen). */
  direction?: 'down' | 'up';
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}

type NewKind = 'document' | 'spreadsheet';

/**
 * The one attach menu for the whole app (task assets, chat, checklist, mid-way changes, requirements, submissions):
 * Upload from device, Google Drive, Google Doc, Google Sheet, and Create new Doc / Sheet. Admins, employees and clients get
 * the same component; clients have no Google connection, so for them it is just the upload.
 */
export const AttachMenu: React.FC<Props> = ({ onUpload, onAdded, variant = 'button', direction = 'down', disabled, busy, label = 'Attach' }) => {
  const { reduced } = useMotionPrefs();
  const role = useAuthStore((s) => s.user?.role);
  const google = role !== 'client';
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState<DriveFilter | null>(null);
  const [creating, setCreating] = useState<NewKind | null>(null);
  const [title, setTitle] = useState('');
  const [working, setWorking] = useState(false);

  const close = () => setOpen(false);
  const choose = (fn: () => void) => () => {
    close();
    fn();
  };

  const create = async () => {
    if (!creating) return;
    setWorking(true);
    try {
      const file = await runJob({
        title: creating === 'document' ? 'Creating Google Doc' : 'Creating Google Sheet',
        run: () => googleApi.createFile(creating, title.trim())
      });
      await onAdded([file]);
      toast.success(
        creating === 'document' ? 'Google Doc created' : 'Google Sheet created',
        `${file.name} is in your Google Drive and linked here.`
      );
      setCreating(null);
      setTitle('');
    } catch (err) {
      if (!isJobCancelled(err)) reportGoogleError(err, 'Could not create the file');
    } finally {
      setWorking(false);
    }
  };

  const items: { icon: React.ReactNode; label: string; run: () => void }[] = [
    ...(onUpload ? [{ icon: <Upload className="h-4 w-4" />, label: 'Upload from device', run: () => input.current?.click() }] : []),
    ...(google
      ? [
          { icon: <HardDrive className="h-4 w-4" />, label: 'Google Drive', run: () => setBrowsing('any') },
          { icon: <FileText className="h-4 w-4" />, label: 'Google Doc', run: () => setBrowsing('document') },
          { icon: <Sheet className="h-4 w-4" />, label: 'Google Sheet', run: () => setBrowsing('spreadsheet') }
        ]
      : [])
  ];

  // Nothing but an upload to offer: skip the menu and open the file chooser directly.
  const uploadOnly = items.length === 1 && !!onUpload;

  const trigger =
    variant === 'icon' ? (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Attach files, Drive files or create a Google Doc or Sheet"
        title="Attach"
        aria-haspopup={uploadOnly ? undefined : 'menu'}
        aria-expanded={uploadOnly ? undefined : open}
        disabled={disabled || busy}
        onClick={() => (uploadOnly ? input.current?.click() : setOpen((o) => !o))}
      >
        <Plus className="h-5 w-5" />
      </Button>
    ) : (
      <Button
        type="button"
        variant="outline"
        size="sm"
        aria-haspopup={uploadOnly ? undefined : 'menu'}
        aria-expanded={uploadOnly ? undefined : open}
        disabled={disabled}
        isLoading={busy}
        onClick={() => (uploadOnly ? input.current?.click() : setOpen((o) => !o))}
        leftIcon={<Paperclip className="h-4 w-4" />}
        rightIcon={uploadOnly ? undefined : <ChevronDown className="h-4 w-4" />}
      >
        {label}
      </Button>
    );

  return (
    <div className="relative inline-block">
      {onUpload && (
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = '';
            if (files.length) void onUpload(files);
          }}
        />
      )}
      {trigger}

      <AnimatePresence>
        {open && !uploadOnly && (
          <>
            <div className="fixed inset-0 z-40" onClick={close} aria-hidden />
            <motion.div
              role="menu"
              aria-label="Attach"
              variants={reduced ? undefined : popoverVariants}
              initial={reduced ? false : 'hidden'}
              animate="show"
              exit={reduced ? undefined : 'exit'}
              onKeyDown={(e) => e.key === 'Escape' && close()}
              className={`glass-strong absolute left-0 z-50 w-64 rounded-[var(--tm-radius-lg)] p-2 ${direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'}`}
            >
              {items.map((it) => (
                <MenuRow key={it.label} icon={it.icon} label={it.label} onClick={choose(it.run)} />
              ))}
              {google && (
                <>
                  <div className="mx-2 my-1.5 border-t border-[var(--tm-border)]" />
                  <p className="px-3 pb-1 pt-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Create new</p>
                  <MenuRow icon={<FilePlus2 className="h-4 w-4" />} label="New Google Doc" onClick={choose(() => { setTitle(''); setCreating('document'); })} />
                  <MenuRow icon={<FilePlus2 className="h-4 w-4" />} label="New Google Sheet" onClick={choose(() => { setTitle(''); setCreating('spreadsheet'); })} />
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {google && (
        <DriveBrowserModal isOpen={browsing !== null} filter={browsing ?? 'any'} onClose={() => setBrowsing(null)} onAttached={onAdded} />
      )}

      <Modal
        isOpen={creating !== null}
        onClose={() => !working && setCreating(null)}
        title={creating === 'spreadsheet' ? 'New Google Sheet' : 'New Google Doc'}
        description="It is created in your own Google Drive and linked here. Share it in Google with the people who need to open it."
        maxWidth="md"
        footer={
          <>
            <Button type="button" variant="secondary" size="sm" disabled={working} onClick={() => setCreating(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" isLoading={working} onClick={create}>
              Create
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <Input
            label="Name"
            autoFocus
            maxLength={200}
            placeholder={creating === 'spreadsheet' ? 'Untitled spreadsheet' : 'Untitled document'}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </form>
      </Modal>
    </div>
  );
};

const MenuRow: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-full px-3 py-2.5 text-left text-[13.5px] font-semibold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-card-muted)]"
  >
    <span className="text-[var(--tm-primary-dark)]">{icon}</span>
    {label}
  </button>
);
