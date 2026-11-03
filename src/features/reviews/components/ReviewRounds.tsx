import React from 'react';
import { ExternalLink, FileText, Link2 } from 'lucide-react';
import { AssetDownloadButton } from '../../../components/ui/AssetDownloadButton';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { toast } from '../../../store/useToastStore';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import type { Review, ReviewDecision } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';

const DECISION: Record<ReviewDecision, { label: string; tone: string }> = {
  pending: { label: 'Waiting for review', tone: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]' },
  approved: { label: 'Approved', tone: 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' },
  changes_requested: { label: 'Changes requested', tone: 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]' }
};

export const DecisionPill: React.FC<{ decision: ReviewDecision }> = ({ decision }) => (
  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${DECISION[decision].tone}`}>
    {DECISION[decision].label}
  </span>
);

const when = (iso: string) => formatDate(iso, 'MMM d, h:mm a');

/** Files and links attached to a submission. */
export const SubmissionFiles: React.FC<{ files: Asset[] }> = ({ files }) => {
  if (files.length === 0) return null;
  const open = (a: Asset) => assetApi.open(a).catch((err) => toast.error('Could not open the file', err.message));
  return (
    <ul className="flex flex-wrap gap-2">
      {files.map((a) => (
        <li key={a.id}>
          {a.kind === 'link' ? (
            <button
              type="button"
              onClick={() => open(a)}
              className="flex items-center gap-2 rounded-full bg-[var(--tm-card-muted)] px-3 py-1.5 text-[12px] font-semibold text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
            >
              <Link2 className="h-3.5 w-3.5" />
              <span className="max-w-[200px] truncate">{a.name}</span>
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          ) : (
            <span className="flex items-center gap-2 rounded-full bg-[var(--tm-card-muted)] py-1 pl-3 pr-1 text-[12px] font-semibold text-[var(--tm-ink)]">
              <FileText className="h-3.5 w-3.5" />
              <span className="max-w-[200px] truncate">{a.name}</span>
              <AssetDownloadButton asset={a} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
};

const Person: React.FC<{ who: Review['submitted_by'] }> = ({ who }) =>
  who ? (
    <PersonLink userId={who.id} className="inline-flex items-center gap-1.5 font-semibold text-[var(--tm-ink)]">
      <Avatar name={who.name} src={who.avatar_url ?? undefined} size="xs" />
      {who.name}
    </PersonLink>
  ) : (
    <span className="font-semibold text-[var(--tm-ink-muted)]">Unknown</span>
  );

/** Every round of a task, newest first: what was submitted, then the decision with comments, who and when. */
export const ReviewRounds: React.FC<{ rounds: Review[] }> = ({ rounds }) => (
  <ol className="space-y-4">
    {[...rounds].reverse().map((r) => (
      <li key={r.id} className="space-y-3 rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] font-extrabold text-[var(--tm-ink)]">Round {r.round}</span>
          <DecisionPill decision={r.decision} />
        </div>

        <div className="space-y-2 text-[13px]">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[var(--tm-ink-muted)]">
            <Person who={r.submitted_by} /> submitted on {when(r.created_at)} to <Person who={r.approver} />
          </p>
          <p className="whitespace-pre-wrap leading-relaxed text-[var(--tm-ink-bg)]">{r.note}</p>
          <SubmissionFiles files={r.files} />
        </div>

        {r.decision !== 'pending' && (
          <div
            className={`space-y-1 rounded-[var(--tm-radius-md)] p-3 text-[13px] ${
              r.decision === 'changes_requested' ? 'bg-[var(--tm-danger-bg)]' : 'bg-[var(--tm-success-bg)]'
            }`}
          >
            <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-[var(--tm-ink-muted)]">
              <Person who={r.decided_by} />
              {r.decision === 'approved' ? 'approved' : 'requested changes'}
              {r.decided_at && ` · ${when(r.decided_at)}`}
            </p>
            {r.comments ? (
              <p className="whitespace-pre-wrap leading-relaxed text-[var(--tm-ink)]">{r.comments}</p>
            ) : (
              <p className="text-[var(--tm-ink-muted)]">No comments.</p>
            )}
          </div>
        )}
      </li>
    ))}
  </ol>
);
