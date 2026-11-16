import React from 'react';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { ExternalLink, FileText, Image as ImageIcon, Link2 } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { toast } from '../../../store/useToastStore';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import type { Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { ReviewActions } from './ReviewActions';
import { DecisionPill } from './ReviewRounds';

export const ago = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true });

export const RoundBadge: React.FC<{ round: number }> = ({ round }) => (
  <span className="rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--tm-ink)]">Round {round}</span>
);

/** Small tiles for the files of a submission (icon by kind; clicking opens it). */
export const FileTiles: React.FC<{ files: Asset[] }> = ({ files }) => {
  if (files.length === 0) return null;
  const open = (a: Asset) => assetApi.open(a).catch((err) => toast.error('Could not open the file', err.message));
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Files">
      {files.map((a) => {
        const Icon = a.kind === 'link' ? Link2 : a.mime.startsWith('image/') ? ImageIcon : FileText;
        return (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => open(a)}
              title={a.name}
              className="flex w-[132px] items-center gap-2 rounded-xl border border-[var(--tm-border)] bg-[var(--tm-card)] px-2.5 py-2 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[var(--tm-primary-soft)] text-[var(--tm-ink)]">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-semibold text-[var(--tm-ink)]">{a.name}</span>
              {a.kind === 'link' && <ExternalLink className="h-3 w-3 shrink-0 text-[var(--tm-ink-muted)]" />}
            </button>
          </li>
        );
      })}
    </ul>
  );
};

/** One submission waiting on a head (or already decided): who, which round, what, the note, the files, and the actions. */
export const ReviewCard: React.FC<{
  review: Review;
  selectable: boolean;
  checked: boolean;
  onCheck: (checked: boolean) => void;
  onOpen: () => void;
  onDone: () => void;
}> = ({ review: r, selectable, checked, onCheck, onOpen, onDone }) => (
  <article className={`rounded-2xl border bg-[var(--tm-card)] p-4 shadow-soft-xs ${checked ? 'border-[var(--tm-ink)]' : 'border-[var(--tm-border)]/60'}`}>
    <header className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      {selectable && (
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onCheck(e.target.checked)}
          aria-label={`Select ${r.task_title}`}
          className="h-4 w-4 shrink-0 cursor-pointer"
        />
      )}
      {r.submitted_by && <Avatar name={r.submitted_by.name} src={r.submitted_by.avatar_url ?? undefined} size="sm" />}
      <span className="text-[13.5px] font-semibold text-[var(--tm-ink)]">
        {r.submitted_by ? (
          <PersonLink userId={r.submitted_by.id} className="hover:underline">
            {r.submitted_by.name}
          </PersonLink>
        ) : (
          'Unknown'
        )}
      </span>
      <span className="text-[12px] text-[var(--tm-ink-muted)]">{ago(r.created_at)}</span>
      <RoundBadge round={r.round} />
      {r.decision !== 'pending' && <span className="ml-auto"><DecisionPill decision={r.decision} /></span>}
    </header>

    <h3 className="mt-3 text-[16px] font-semibold leading-snug text-[var(--tm-ink)]">
      <button type="button" onClick={onOpen} className="text-left hover:underline">
        {r.task_title}
      </button>
    </h3>
    <p className="mt-0.5 text-[12.5px] font-medium text-[var(--tm-ink-muted)]">
      {r.project_name} › {r.subfolder_name}
    </p>

    {r.note && <p className="mt-3 line-clamp-3 whitespace-pre-wrap rounded-xl bg-[var(--tm-card-muted)] px-3.5 py-2.5 text-[13px] leading-relaxed text-[var(--tm-ink-soft)]">{r.note}</p>}
    {r.files.length > 0 && (
      <div className="mt-3">
        <FileTiles files={r.files} />
      </div>
    )}

    {r.decision !== 'pending' && (
      <p className="mt-3 text-[12.5px] text-[var(--tm-ink-muted)]">
        <strong className="text-[var(--tm-ink)]">{r.decided_by?.name ?? 'Someone'}</strong> {r.decision === 'approved' ? 'approved' : 'sent it back'}
        {r.decided_at && ` · ${formatDate(r.decided_at, 'MMM d, h:mm a')}`}
        {r.comments && <span className="mt-1 block whitespace-pre-wrap text-[var(--tm-ink-soft)]">{r.comments}</span>}
      </p>
    )}

    <div className="mt-4 flex justify-end">
      {r.can_decide ? (
        <ReviewActions review={r} onDone={onDone} size="sm" variant="card" onOpen={onOpen} />
      ) : (
        <button type="button" onClick={onOpen} className="h-9 rounded-full px-4 text-[13px] font-semibold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)]">
          Open
        </button>
      )}
    </div>
  </article>
);
