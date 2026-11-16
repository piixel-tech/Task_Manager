import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import type { Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { ago, FileTiles, RoundBadge } from './ReviewCard';

const STEPS = ['Submitted', 'In review', 'Approved'];

/** Submitted → In review → Approved. The current step is charcoal; finished ones are ticked. */
export const SubmissionTracker: React.FC<{ decision: Review['decision'] }> = ({ decision }) => {
  const current = decision === 'approved' ? 3 : 2;
  return (
    <ol aria-label="Review progress" className="grid grid-cols-3 gap-2">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = n < current || (decision === 'approved' && n === 3);
        const now = n === current && !done;
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            className={`flex min-w-0 items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              now ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : done ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-muted)]'
            }`}
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center text-[11px]">{done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : n}</span>
            <span className="truncate">{label}</span>
          </li>
        );
      })}
    </ol>
  );
};

/** One of my submissions (the newest round of a task): sent back with feedback, waiting, or approved. */
export const SubmissionCard: React.FC<{
  review: Review;
  onOpen: () => void;
  /** "Fix & resubmit": opens the submit form for this task. */
  onResubmit?: () => void;
}> = ({ review: r, onOpen, onResubmit }) => {
  const sentBack = r.decision === 'changes_requested';
  return (
    <article className={`rounded-2xl bg-[var(--tm-card)] p-4 shadow-soft-xs ${sentBack ? 'border-2 border-[var(--tm-danger)]' : 'border border-[var(--tm-border)]/60'}`}>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 flex-1 text-[16px] font-semibold leading-snug text-[var(--tm-ink)]">
          <button type="button" onClick={onOpen} className="text-left hover:underline">
            {r.task_title}
          </button>
        </h3>
        <RoundBadge round={r.round} />
      </header>
      <p className="mt-0.5 text-[12.5px] font-medium text-[var(--tm-ink-muted)]">
        {r.project_name} › {r.subfolder_name}
      </p>

      {sentBack ? (
        <div className="mt-3 rounded-xl bg-[var(--tm-danger-bg)] px-3.5 py-3">
          <p className="text-[12px] font-semibold text-[var(--tm-danger)]">
            {r.decided_by?.name ?? 'The reviewer'} sent it back{r.decided_at ? ` · ${ago(r.decided_at)}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--tm-ink)]">{r.comments || 'No comments were left.'}</p>
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <SubmissionTracker decision={r.decision} />
          <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
            {r.decision === 'approved' ? (
              <>
                Approved by <strong className="text-[var(--tm-ink)]">{r.decided_by?.name ?? 'someone'}</strong>
                {r.decided_at && ` · ${formatDate(r.decided_at, 'MMM d, h:mm a')}`}
              </>
            ) : (
              <>
                With <strong className="text-[var(--tm-ink)]">{r.approver?.name ?? 'a head'}</strong> · submitted {ago(r.created_at)}
              </>
            )}
          </p>
        </div>
      )}

      {r.files.length > 0 && (
        <div className="mt-3">
          <FileTiles files={r.files} />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onOpen}>
          Open
        </Button>
        {sentBack && onResubmit && (
          <Button size="sm" onClick={onResubmit}>
            Fix &amp; resubmit
          </Button>
        )}
      </div>
    </article>
  );
};
