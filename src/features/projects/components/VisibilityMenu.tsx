import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { useConfirm } from '../../../hooks/useConfirm';
import { projectApi, type Subfolder, type UserBrief, type Visibility } from '../../../services/http/projectApi';
import { PeoplePicker } from './PeoplePicker';
import { VISIBILITIES, VISIBILITY, VisibilityIcon } from './VisibilityIcon';

const MAX_AVATARS = 6;

/** Searchable list of company employees (members are left out by the server) with checkboxes. */
const ViewerPickerModal: React.FC<{ subfolder: Subfolder; onClose: () => void; onSave: (ids: string[]) => void }> = ({ subfolder, onClose, onSave }) => {
  const [people, setPeople] = useState<UserBrief[] | null>(null);
  const [picked, setPicked] = useState<string[]>(subfolder.viewers.map((v) => v.id));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    projectApi
      .viewerCandidates(subfolder.id)
      .then(setPeople)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the team'));
  }, [subfolder.id]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Who can view ${subfolder.name}?`}
      description="They can read it but not make changes. Members already have access."
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!people} onClick={() => onSave(picked)}>
            Save
          </Button>
        </div>
      }
    >
      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
      {!people && !error && <p className="text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>}
      {people && people.length === 0 && (
        <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-4 text-[13px] font-semibold text-[var(--tm-ink-muted)]">
          Everyone in the company is already a member of this subfolder.
        </p>
      )}
      {people && people.length > 0 && (
        <PeoplePicker
          label="Company employees"
          people={people}
          value={picked}
          onChange={setPicked}
          searchText={(p) => `${p.name} ${p.email ?? ''}`}
          emptyText={(q) => `No employees match "${q}".`}
        />
      )}
    </Modal>
  );
};

/**
 * The icon next to a subfolder's title. Heads and admins (`can_set_visibility`) get a dropdown to change who can see it;
 * everyone else just sees the icon with its tooltip. The server enforces the same rule.
 */
export const VisibilityMenu: React.FC<{ subfolder: Subfolder; onChanged: (s: Subfolder) => void; className?: string }> = ({
  subfolder,
  onChanged,
  className = 'h-4 w-4 text-[var(--tm-ink-soft)]'
}) => {
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  // The menu is drawn on <body>, so nothing on the page (tabs, headings, their stacking or letter-spacing) can show through or squeeze it.
  useLayoutEffect(() => {
    if (!open || !button.current) return;
    const r = button.current.getBoundingClientRect();
    setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 296)) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  if (!subfolder.can_set_visibility) return <VisibilityIcon visibility={subfolder.visibility} className={className} />;

  const save = async (v: Visibility, viewerIds: string[] = []) => {
    let saved: Subfolder | undefined;
    const ok = await confirm({
      title: v === 'selected' ? `Share ${subfolder.name} with ${viewerIds.length} ${viewerIds.length === 1 ? 'person' : 'people'}?` : `Make ${subfolder.name} ${VISIBILITY[v].label.toLowerCase()}?`,
      message: `${VISIBILITY[v].hint} Everyone in the subfolder will be notified.`,
      confirmLabel: 'Change',
      action: async () => {
        saved = await projectApi.setVisibility(subfolder.id, v, viewerIds);
      },
      successTitle: v === 'selected' ? 'People updated' : `Now ${VISIBILITY[v].label.toLowerCase()}`
    });
    if (ok && saved) onChanged(saved);
    return ok;
  };

  const choose = (v: Visibility) => {
    setOpen(false);
    if (v === 'selected') return setPicking(true); // who exactly is asked for first
    if (v !== subfolder.visibility) void save(v);
  };

  const current = VISIBILITY[subfolder.visibility];
  const viewers = subfolder.visibility === 'selected' ? subfolder.viewers : [];
  return (
    <>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${current.label}: change who can see this subfolder`}
        title={`${current.label}: ${current.hint} Click to change.`}
        className="inline-flex items-center rounded-full p-1 transition-colors hover:bg-[var(--tm-bg-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--tm-primary)]"
      >
        <current.Icon className={className} strokeWidth={2.1} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label="Who can see this subfolder"
            style={{ top: pos.top, left: pos.left }}
            className="fixed z-[1000] w-72 rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-1.5 text-left text-[var(--tm-ink)] shadow-soft-lg [letter-spacing:normal] [word-spacing:normal] [text-transform:none] whitespace-normal"
          >
            {VISIBILITIES.map((v) => {
              const { label, hint, Icon } = VISIBILITY[v];
              const on = v === subfolder.visibility;
              return (
                <div key={v}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => choose(v)}
                    className="flex w-full items-start gap-3 rounded-[var(--tm-radius-md)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tm-ink)]" strokeWidth={2.1} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold">{label}</span>
                      <span className="block text-[12px] font-normal leading-snug text-[var(--tm-ink-soft)]">{hint}</span>
                    </span>
                    {on && <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" aria-hidden />}
                  </button>
                  {v === 'selected' && on && (
                    <div className="flex items-center gap-2 px-3 pb-2 pl-10">
                      <span className="flex -space-x-1.5" aria-label={`${viewers.length} people can view`}>
                        {viewers.slice(0, MAX_AVATARS).map((p) => (
                          <Avatar key={p.id} name={p.name} src={p.avatar_url ?? undefined} size="xs" ring />
                        ))}
                      </span>
                      {viewers.length > MAX_AVATARS && <span className="text-[11px] font-semibold text-[var(--tm-ink-muted)]">+{viewers.length - MAX_AVATARS}</span>}
                      {viewers.length === 0 && <span className="text-[11.5px] text-[var(--tm-ink-muted)]">No one picked yet</span>}
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          setPicking(true);
                        }}
                        className="ml-auto text-[12px] font-semibold text-[var(--tm-primary-dark)] hover:underline"
                      >
                        Edit people
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>,
          document.body
        )}

      {picking && (
        <ViewerPickerModal
          subfolder={subfolder}
          onClose={() => setPicking(false)}
          onSave={(ids) => {
            setPicking(false);
            void save('selected', ids);
          }}
        />
      )}
    </>
  );
};
