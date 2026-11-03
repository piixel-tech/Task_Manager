import React, { useMemo, useState } from 'react';
import { Check, ChevronDown, Mail, Search, Users, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Avatar } from '../../../components/ui/Avatar';
import { popoverVariants } from '../../../components/ui/motion';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';

export interface GuestPerson {
  id: string;
  name: string;
  avatar_url: string | null;
  /** Job title; the account role is shown when there is none. */
  title?: string;
  role: string;
  /** Company name; people without one are listed under "Other". */
  company?: string;
}

const EMAIL = /^[^@\s<>,;"']+@[^@\s<>,;"']+\.[^@\s<>,;"']+$/;
export const isEmail = (text: string) => EMAIL.test(text.trim());

/** What the booking API expects: teammates by id, everyone else by email. */
export const guestPayload = (memberIds: string[], emails: string[]) => [
  ...memberIds.map((user_id) => ({ user_id })),
  ...emails.map((email) => ({ email: email.toLowerCase() }))
];

export const jobOf = (p: Pick<GuestPerson, 'title' | 'role'>) => p.title?.trim() || p.role.charAt(0).toUpperCase() + p.role.slice(1);

const labelCls = 'block text-[12px] font-semibold text-[var(--tm-ink-soft)]';
const chipCls =
  'inline-flex max-w-full items-center gap-1.5 rounded-full bg-[var(--tm-primary-soft)] py-1 pl-2 pr-1 text-[12px] font-semibold text-[var(--tm-primary-dark)]';

const RemoveChip: React.FC<{ label: string; onClick: () => void; disabled?: boolean }> = ({ label, onClick, disabled }) => (
  <button
    type="button"
    aria-label={`Remove ${label}`}
    onClick={onClick}
    disabled={disabled}
    className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-[var(--tm-card)]"
  >
    <X className="h-3 w-3" />
  </button>
);

interface MembersProps {
  /** Everyone on Task Manager who can be invited. */
  people: GuestPerson[];
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
}

/** "Add members": a searchable list of Task Manager users (avatar, name, job role), multi-select, chosen ones shown as chips. */
export const MemberSelect: React.FC<MembersProps> = ({ people, value, onChange, disabled, loading, error }) => {
  const { reduced } = useMotionPrefs();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const picked = useMemo(() => new Set(value), [value]);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return people.filter((p) => !needle || p.name.toLowerCase().includes(needle) || jobOf(p).toLowerCase().includes(needle));
  }, [people, q]);

  /** The matches grouped by company, keeping the order they came in. */
  const groups = useMemo(() => {
    const map = new Map<string, GuestPerson[]>();
    for (const p of shown) {
      const key = p.company?.trim() || 'Other';
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return [...map.entries()];
  }, [shown]);

  const toggle = (id: string) => onChange(picked.has(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <div className="space-y-2">
      <span id="guest-members-label" className={labelCls}>
        Add members
      </span>
      <button
        type="button"
        role="combobox"
        aria-labelledby="guest-members-label"
        aria-expanded={open}
        aria-controls="guest-members-list"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 py-2.5 text-left text-[13px] text-[var(--tm-ink-muted)] transition-shadow hover:border-[var(--tm-solid)] focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--tm-primary-light)_35%,transparent)] focus-visible:outline-none"
      >
        <Users className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate">{value.length ? `${value.length} selected` : 'Search and pick teammates'}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            variants={reduced ? undefined : popoverVariants}
            initial={reduced ? false : 'hidden'}
            animate="show"
            exit={reduced ? undefined : 'exit'}
            onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))}
            className="overflow-hidden rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)]"
          >
            <div className="flex items-center gap-2 border-b border-[var(--tm-border)] px-3 py-2">
              <Search className="h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
              <input
                autoFocus
                type="text"
                aria-label="Search members"
                placeholder="Search by name or role"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
              />
            </div>
            <ul id="guest-members-list" role="listbox" aria-multiselectable aria-label="Members" className="max-h-64 overflow-y-auto pb-1">
              {loading && <li className="px-4 py-3 text-[13px] text-[var(--tm-ink-muted)]">Loading the team…</li>}
              {error && <li className="px-4 py-3 text-[13px] font-medium text-[var(--tm-danger)]">{error}</li>}
              {!loading && !error && shown.length === 0 && <li className="px-4 py-3 text-[13px] text-[var(--tm-ink-muted)]">No one matches.</li>}
              {groups.map(([company, list]) => (
                <React.Fragment key={company}>
                  <li
                    role="presentation"
                    className="sticky top-0 z-10 flex items-center justify-between bg-[var(--tm-card-muted)] px-4 py-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]"
                  >
                    <span>{company}</span>
                    <span>{list.length}</span>
                  </li>
                  {list.map((p) => {
                const on = picked.has(p.id);
                return (
                  <li key={p.id} role="option" aria-selected={on}>
                    <button
                      type="button"
                      onClick={() => toggle(p.id)}
                      className={`flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--tm-card-muted)] ${on ? 'bg-[var(--tm-primary-soft)]' : ''}`}
                    >
                      <Avatar name={p.name} src={p.avatar_url ?? undefined} size="sm" />
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block truncate text-[13px] font-semibold text-[var(--tm-ink)]">{p.name}</span>
                        <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">{jobOf(p)}</span>
                      </span>
                      <span
                        aria-hidden
                        className={`grid h-5 w-5 shrink-0 place-items-center rounded-full border ${
                          on ? 'border-[var(--tm-solid)] bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'border-[var(--tm-border)]'
                        }`}
                      >
                        {on && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  </li>
                );
              })}
                </React.Fragment>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>

      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected members">
          {value.map((id) => {
            const p = byId.get(id);
            if (!p) return null;
            return (
              <li key={id} className={chipCls}>
                <Avatar name={p.name} src={p.avatar_url ?? undefined} size="xs" />
                <span className="truncate">{p.name}</span>
                <RemoveChip label={p.name} onClick={() => toggle(id)} disabled={disabled} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

interface EmailProps {
  value: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}

/** "Invite by email": type any address and press Enter to add it as a chip. The format is checked before it is added. */
export const EmailInvite: React.FC<EmailProps> = ({ value, onChange, disabled }) => {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const add = (): boolean => {
    const t = text.trim().replace(/,$/, '').trim();
    if (!t) return false;
    if (!isEmail(t)) {
      setError('That doesn’t look like an email address. Use name@company.com.');
      return false;
    }
    if (value.some((v) => v.toLowerCase() === t.toLowerCase())) {
      setError('That address is already added.');
      return false;
    }
    onChange([...value, t]);
    setText('');
    setError(null);
    return true;
  };

  return (
    <div className="space-y-2">
      <label htmlFor="guest-email" className={labelCls}>
        Invite by email
      </label>
      <div className="flex items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 py-2.5 transition-shadow focus-within:border-[var(--tm-primary-light)] focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--tm-primary-light)_35%,transparent)]">
        <Mail className="h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
        <input
          id="guest-email"
          type="email"
          inputMode="email"
          autoComplete="off"
          disabled={disabled}
          value={text}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'guest-email-error' : undefined}
          placeholder="name@company.com, then press Enter"
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault(); // Enter must not submit the booking form
              add();
            } else if (e.key === 'Backspace' && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
        />
      </div>
      {error && (
        <p id="guest-email-error" role="alert" className="text-[12px] font-medium text-[var(--tm-danger)]">
          {error}
        </p>
      )}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Invited by email">
          {value.map((email) => (
            <li key={email.toLowerCase()} className={chipCls}>
              <Mail className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{email}</span>
              <RemoveChip label={email} onClick={() => onChange(value.filter((v) => v !== email))} disabled={disabled} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
