import React from 'react';
import { format, parseISO } from 'date-fns';
import { ArrowRight } from 'lucide-react';
import { Select } from '../../../components/ui/Select';
import { Textarea } from '../../../components/ui/Input';
import type { LeaveDuration, LeaveType } from '../../../services/http/leaveApi';
import { DURATION_LABEL, TYPE_LABEL, workingDays, type Selection } from '../leaveUtils';
import { useLeaveForm } from './useLeaveForm';

const day = (d: string | null) => (d ? format(parseISO(d), 'EEE d') : '—');

/** A row of exclusive choices. */
function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="mb-1.5 block pl-1 text-[12px] font-semibold text-[var(--tm-ink-soft)]">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex gap-1 rounded-full bg-[var(--tm-card-muted)] p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={`h-9 flex-1 rounded-full px-3 text-[13px] font-semibold transition-colors ${
              o.value === value ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Your request": the live summary of the picked days plus the form (same fields and submit as the Request leave form). */
export const LeaveSummary: React.FC<{
  selection: Selection;
  end: string | null;
  picked: boolean;
  conflict: boolean;
  hint: boolean;
  onClear: () => void;
  onSent: () => void;
}> = ({ selection, end, picked, conflict, hint, onClear, onSent }) => {
  const f = useLeaveForm({ active: true, start: selection.start, end, onSent });
  const { admins } = f;
  const duration: LeaveDuration = f.oneDay ? f.duration : 'full';
  const days = picked ? workingDays(selection.start!, end!, duration) : 0;

  return (
    <aside aria-label="Your request" className="h-fit rounded-[var(--tm-radius-card)] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-5 shadow-soft-xs ">
      <h3 className="text-[16px] font-bold text-[var(--tm-ink)]">Your request</h3>
      <p data-hint className="mt-0.5 text-[13px] text-[var(--tm-ink-muted)]">Check your dates, then send it.</p>

      <div className="mt-3 rounded-2xl bg-[var(--tm-solid)] p-4 text-[var(--tm-solid-ink)]">
        <div className="flex items-center justify-between text-[10.5px] font-semibold uppercase tracking-[0.1em] opacity-70">
          <span>From</span>
          <span>To</span>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 text-[20px] font-bold leading-tight">
          <span>{day(selection.start)}</span>
          <ArrowRight className="h-4 w-4 shrink-0 opacity-70" />
          <span>{day(end)}</span>
        </div>
        <p className="mt-2 text-[12.5px] font-medium opacity-80">
          {picked ? `${days} working ${days === 1 ? 'day' : 'days'}` : 'Pick your dates on the calendar'}
        </p>
      </div>

      {conflict && <p className="mt-3 text-[12.5px] font-semibold text-[var(--tm-warning)]">Some of these days already have a request.</p>}
      {hint && !picked && (
        <p className="mt-3 text-[12.5px] font-semibold text-[var(--tm-warning)]" role="alert">
          Pick your dates on the calendar first.
        </p>
      )}

      <form noValidate onSubmit={f.submit} className="mt-4 space-y-4">
        <Segmented
          label="Type"
          value={f.type}
          onChange={(v: LeaveType) => f.setType(v)}
          options={(Object.keys(TYPE_LABEL) as LeaveType[]).map((v) => ({ value: v, label: TYPE_LABEL[v] }))}
        />
        {f.oneDay && (
          <Segmented
            label="Length"
            value={f.duration}
            onChange={(v: LeaveDuration) => f.setDuration(v)}
            options={(Object.keys(DURATION_LABEL) as LeaveDuration[]).map((v) => ({ value: v, label: DURATION_LABEL[v] }))}
          />
        )}
        <Select
          id="leave-approver"
          label="Approver"
          value={f.adminId}
          onChange={(e) => f.setAdminId(e.target.value)}
          disabled={!admins || admins.length === 0}
          options={[
            { value: '', label: !admins ? 'Loading…' : admins.length === 0 ? 'No admin in your company' : 'Choose an admin' },
            ...(admins ?? []).map((a) => ({ value: a.id, label: a.name }))
          ]}
        />
        {admins?.length === 0 && <p className="text-[12px] text-[var(--tm-ink-muted)]">Ask an admin to add an admin to your company, then try again.</p>}
        <Textarea id="leave-reason" label="Reason" rows={3} value={f.reason} onChange={(e) => f.setReason(e.target.value)} maxLength={500} placeholder="Why do you need it?" required />
        {f.error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold" role="alert">
            {f.error}
          </div>
        )}
        <button
          type="submit"
          disabled={!picked || conflict || !f.adminId}
          className="h-11 w-full rounded-full bg-[var(--tm-accent)] text-[14px] font-semibold text-[var(--tm-accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Send request
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={!selection.start}
          className="mx-auto block text-[13px] font-semibold text-[var(--tm-ink-soft)] underline-offset-2 hover:text-[var(--tm-ink)] hover:underline disabled:opacity-40 disabled:hover:no-underline"
        >
          Clear dates
        </button>
      </form>
    </aside>
  );
};
