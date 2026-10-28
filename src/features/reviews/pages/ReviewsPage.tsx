import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { reviewApi, type Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { DecisionPill, SubmissionFiles } from '../components/ReviewRounds';
import { ReviewActions } from '../components/ReviewActions';

type Tab = 'pending' | 'decided';

/** Review inbox. Heads see submissions picked for them; admins see every review. */
export const ReviewsPage: React.FC = () => {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [tab, setTab] = useState<Tab>('pending');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      if (tab === 'pending') {
        setReviews(await reviewApi.list('pending'));
      } else {
        const [approved, changes] = await Promise.all([reviewApi.list('approved'), reviewApi.list('changes_requested')]);
        setReviews([...approved, ...changes].sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? '')));
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reviews');
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // A new submission (or another head's decision) arrives live.
  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('review_') && load()), [load]);

  return (
    <>
      <PageHeader
        title="Reviews"
        description={
          isAdmin
            ? 'Every submission across all projects. You can step in on any pending review.'
            : 'Work people submitted to you for approval.'
        }
      />

      <PillTabs
        activeTab={tab}
        onChange={(t) => setTab(t as Tab)}
        tabs={[
          { id: 'pending', label: 'Pending' },
          { id: 'decided', label: 'Decided' }
        ]}
      />

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
      )}

      {loading ? (
        <SkeletonGrid count={3} />
      ) : reviews.length === 0 ? (
        <EmptyState
          icon={<ClipboardCheck className="h-6 w-6 text-[var(--tm-primary)]" />}
          title={tab === 'pending' ? 'Nothing to review' : 'No decisions yet'}
          description={
            tab === 'pending' ? 'When someone submits work to you, it shows up here.' : 'Approved and sent-back reviews appear here.'
          }
        />
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <Card key={r.id} animate={false}>
              <CardContent className="space-y-4 pt-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => navigate(`${prefix}/tasks/${r.task_id}`)}
                      className="truncate text-left text-[15.5px] font-bold text-[var(--tm-ink)] hover:text-[var(--tm-primary)] hover:underline"
                    >
                      {r.task_title}
                    </button>
                    <p className="mt-0.5 text-[12px] text-[var(--tm-ink-muted)]">
                      {r.project_name} › {r.subfolder_name} · Round {r.round}
                    </p>
                  </div>
                  <DecisionPill decision={r.decision} />
                </div>

                <div className="space-y-2 text-[13px]">
                  <p className="flex flex-wrap items-center gap-2 text-[var(--tm-ink-muted)]">
                    {r.submitted_by && (
                      <PersonLink userId={r.submitted_by.id} className="inline-flex items-center gap-1.5 font-semibold text-[var(--tm-ink)]">
                        <Avatar name={r.submitted_by.name} src={r.submitted_by.avatar_url ?? undefined} size="xs" />
                        {r.submitted_by.name}
                      </PersonLink>
                    )}
                    submitted {formatDate(r.created_at, 'MMM d, h:mm a')}
                    {isAdmin && r.approver && <span>· for {r.approver.name}</span>}
                  </p>
                  <p className="whitespace-pre-wrap leading-relaxed text-[var(--tm-ink-soft)]">{r.note}</p>
                  <SubmissionFiles files={r.files} />
                </div>

                {r.decision !== 'pending' && (
                  <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
                    <strong className="text-[var(--tm-ink)]">{r.decided_by?.name ?? 'Someone'}</strong>{' '}
                    {r.decision === 'approved' ? 'approved' : 'requested changes'}
                    {r.decided_at && ` · ${formatDate(r.decided_at, 'MMM d, h:mm a')}`}
                    {r.comments && <span className="mt-1 block whitespace-pre-wrap text-[var(--tm-ink-soft)]">{r.comments}</span>}
                  </p>
                )}

                {r.can_decide && <ReviewActions review={r} onDone={load} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
};
