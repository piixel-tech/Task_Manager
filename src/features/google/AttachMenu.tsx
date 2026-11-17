import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowLeft, ChevronDown, Link2, Paperclip, Plus, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { popoverVariants } from '../../components/ui/motion';
import { useMotionPrefs } from '../../components/ui/useMotionPrefs';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/useToastStore';
import { isJobCancelled, runJob } from '../../services/jobs';
import { googleApi, type DriveFilter } from '../../services/http/googleApi';
import { assetApi, type Asset } from '../../services/http/taskApi';
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
  /** Offer "Paste link" (a plain web link saved as an attachment). Defaults to on wherever uploads are offered. */
  links?: boolean;
}

type NewKind = 'document' | 'spreadsheet';

/**
 * The one attach menu for the whole app (task assets, chat, checklist, mid-way changes, requirements, submissions):
 * Upload from device, Google Drive, Google Doc, Google Sheet, and Create new Doc / Sheet. Admins, employees and clients get
 * the same component; clients have no Google connection, so for them it is just the upload.
 */
export const AttachMenu: React.FC<Props> = ({ onUpload, onAdded, variant = 'button', direction = 'down', disabled, busy, label = 'Attach', links }) => {
  const { reduced } = useMotionPrefs();
  const role = useAuthStore((s) => s.user?.role);
  const google = role !== 'client';
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState<DriveFilter | null>(null);
  const [creating, setCreating] = useState<NewKind | null>(null);
  const [title, setTitle] = useState('');
  const [working, setWorking] = useState(false);
  const [view, setView] = useState<'menu' | 'link'>('menu');
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linking, setLinking] = useState(false);
  const showLinks = links ?? !!onUpload;

  const close = () => {
    setOpen(false);
    setView('menu');
  };

  // The menu floats over the page (in a portal, so no card or scroll area can clip it). It opens on the side with room,
  // never taller than 60% of the screen, and scrolls inside itself. The page behind keeps scrolling.
  const wrap = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; width: number; top?: number; bottom?: number; maxHeight: number } | null>(null);
  const reposition = useCallback(() => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const edge = 8; // breathing room from the screen edge
    const gap = 6; // between the button and the menu
    const width = Math.min(320, vw - edge * 2);
    const cap = vh * 0.6;
    const below = vh - r.bottom - gap - edge;
    const above = r.top - gap - edge;
    const need = Math.min(panel.current?.scrollHeight ?? cap, cap);
    const preferUp = direction === 'up';
    const fits = (space: number) => space >= need;
    const up = fits(preferUp ? above : below) ? preferUp : fits(preferUp ? below : above) ? !preferUp : above > below;
    setPlace({
      left: Math.max(edge, Math.min(r.left, vw - width - edge)),
      width,
      ...(up ? { bottom: vh - r.top + gap } : { top: r.bottom + gap }),
      maxHeight: Math.max(120, Math.min(cap, up ? above : below))
    });
  }, [direction]);

  /** Placed before it opens, so it never flashes in the wrong spot (or stays hidden). */
  const toggle = () => {
    if (!open) reposition();
    setOpen((o) => !o);
  };

  useLayoutEffect(() => {
    if (open) reposition();
    else setPlace(null);
  }, [open, view, reposition]);

  useEffect(() => {
    if (!open) return;
    // Esc closes just this menu, even inside a dialog (which would otherwise close too).
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true); // any scrolling ancestor moves the button
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [open, reposition]);
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

  // Nothing but an upload to offer: skip the menu and open the file chooser directly.
  const uploadOnly = !!onUpload && !showLinks && !google;

  const addLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const raw = linkUrl.trim();
    if (!raw) return;
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    setLinking(true);
    try {
      const asset = await assetApi.addLink(linkTitle.trim() || url, url);
      await onAdded([asset]);
      setLinkTitle('');
      setLinkUrl('');
      close();
    } catch (err) {
      toast.error('Could not add the link', err instanceof Error ? err.message : undefined);
    } finally {
      setLinking(false);
    }
  };

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
        onClick={() => (uploadOnly ? input.current?.click() : toggle())}
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
        onClick={() => (uploadOnly ? input.current?.click() : toggle())}
        leftIcon={<Paperclip className="h-4 w-4" />}
        rightIcon={uploadOnly ? undefined : <ChevronDown className="h-4 w-4" />}
      >
        {label}
      </Button>
    );

  return (
    <div ref={wrap} className="relative inline-block">
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

      {createPortal(
      <AnimatePresence>
        {open && !uploadOnly && (
          <>
            <div className="fixed inset-0 z-[80]" onClick={close} aria-hidden />
            <motion.div
              role="menu"
              aria-label="Attach"
              variants={reduced ? undefined : popoverVariants}
              initial={reduced ? false : 'hidden'}
              animate="show"
              exit={reduced ? undefined : 'exit'}
              ref={panel}
              style={place ?? { left: 8, top: 8, width: 320 }}
              className="fixed z-[90] overflow-y-auto overscroll-contain rounded-[22px] border border-[var(--tm-border)] bg-[var(--tm-card)] p-2.5 shadow-soft"
            >
              {view === 'link' ? (
                <form noValidate onSubmit={addLink} className="space-y-3 p-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Back"
                      onClick={() => setView('menu')}
                      className="grid h-8 w-8 place-items-center rounded-full text-[var(--tm-ink-soft)] hover:bg-[var(--tm-card-muted)] hover:text-[var(--tm-ink)]"
                    >
                      <ArrowLeft className="h-4 w-4" />
                    </button>
                    <span className="text-[14px] font-semibold text-[var(--tm-ink)]">Paste link</span>
                  </div>
                  <Input label="URL" autoFocus placeholder="https://…" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                  <Input label="Title (optional)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
                  <Button type="submit" size="sm" className="w-full" isLoading={linking} disabled={!linkUrl.trim()}>
                    Add link
                  </Button>
                </form>
              ) : (
                <>
                  {(onUpload || showLinks) && (
                    <div className="flex gap-2">
                      {onUpload && <TopTile icon={<Upload className="h-5 w-5" />} label="Upload" onClick={choose(() => input.current?.click())} />}
                      {showLinks && <TopTile icon={<Link2 className="h-5 w-5" />} label="Paste link" onClick={() => setView('link')} />}
                    </div>
                  )}
                  {google && (
                    <>
                      <SectionLabel>From Google</SectionLabel>
                      <MenuRow label="Google Drive file" onClick={choose(() => setBrowsing('any'))} />
                      <MenuRow label="Google Doc" onClick={choose(() => setBrowsing('document'))} />
                      <MenuRow label="Google Sheet" onClick={choose(() => setBrowsing('spreadsheet'))} />
                      <SectionLabel>Create new</SectionLabel>
                      <MenuRow plus label="New Google Doc" onClick={choose(() => { setTitle(''); setCreating('document'); })} />
                      <MenuRow plus label="New Google Sheet" onClick={choose(() => { setTitle(''); setCreating('spreadsheet'); })} />
                    </>
                  )}
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>,
      document.body
      )}

      {google && (
        <DriveBrowserModal isOpen={browsing !== null} filter={browsing ?? 'any'} onClose={() => setBrowsing(null)} onAttached={onAdded} />
      )}

      <Modal
        isOpen={creating !== null}
        onClose={() => !working && setCreating(null)}
        title={creating === 'spreadsheet' ? 'New Google Sheet' : 'New Google Doc'}
        description="Created in your Google Drive and linked here."
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
        <form noValidate
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

const TopTile: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ icon, label, onClick }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="flex flex-1 flex-col items-center gap-1.5 rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] px-3 py-3.5 text-[13px] font-semibold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-card-muted)]"
  >
    <span className="text-[var(--tm-ink-soft)]">{icon}</span>
    {label}
  </button>
);

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="px-3 pb-1 pt-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">{children}</p>
);

const MenuRow: React.FC<{ label: string; onClick: () => void; plus?: boolean }> = ({ label, onClick, plus }) => (
  <button
    type="button"
    role="menuitem"
    onClick={onClick}
    className="flex h-10 w-full items-center gap-2 rounded-[var(--tm-radius-md)] px-3 text-left text-[14px] text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-card-muted)]"
  >
    {plus && <Plus className="h-3.5 w-3.5 text-[var(--tm-ink-soft)]" />}
    {label}
  </button>
);
