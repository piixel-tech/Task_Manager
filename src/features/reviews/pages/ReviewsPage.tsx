import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, ClipboardCheck, Inbox, RotateCcw } from 'lucide-react';
import { StatCard } from '../../../components/ui/StatCard';
import { FilterBar } from '../../../components/ui/FilterBar';
import { DetailCard, MasterDetail, MasterRow, SubCard, SubGrid, useMasterSelection } from '../../../components/ui/MasterDetail';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { reviewApi, type Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { dailyCounts, weekTrend } from '../../../utils/trend';
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
  const [quick, setQuick] = useState<'' | 'waiting' | 'resub'>('');
  const visible = useMemo(
    () => (quick === 'waiting' ? reviews.filter((r) => r.can_decide) : quick === 'resub' ? reviews.filter((r) => r.round > 1) : reviews),
    [reviews, quick]
  );
  const { selected, open, select, back } = useMasterSelection(visible);

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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="In this list"
          onClick={() => setQuick('')}
          value={reviews.length}
          icon={<Inbox className="h-5 w-5" />}
          tone="primary"
          hint={tab === 'pending' ? 'Submissions waiting' : 'Decisions made'}
          {...weekTrend(dailyCounts(reviews, (r) => r.created_at, 14))}
        />
        <StatCard onClick={() => { setTab('pending'); setQuick('waiting'); }} label="Waiting on you" value={reviews.filter((r) => r.can_decide).length} icon={<ClipboardCheck className="h-5 w-5" />} tone="warn" hint="You can decide these now" />
        <StatCard onClick={() => setQuick('resub')} label="Resubmissions" value={reviews.filter((r) => r.round > 1).length} icon={<RotateCcw className="h-5 w-5" />} tone="neutral" hint="Round 2 or later" />
        <StatCard
          label="Decided"
          onClick={() => {
            setQuick('');
            setTab('decided');
          }}
          value={reviews.filter((r) => r.decision !== 'pending').length}
          icon={<CheckCheck className="h-5 w-5" />}
          tone="ok"
          hint="Approved or sent back"
          trend={dailyCounts(reviews, (r) => r.decided_at, 7)}
          trendKind="line"
        />
      </div>

      {quick && (
        <FilterBar
          activeCount={1}
          onClear={() => setQuick('')}
          chips={[{ key: 'quick', label: quick === 'waiting' ? 'Waiting on you' : 'Resubmissions', onRemove: () => setQuick('') }]}
        >
          <span />
        </FilterBar>
      )}

      {error && (
        <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>
      )}

      <MasterDetail
        tabs={[
          { id: 'pending', label: 'Pending' },
          { id: 'decided', label: 'Decided' }
        ]}
        activeTab={tab}
        onTabChange={(t) => setTab(t as Tab)}
        detailOpen={open}
        onBack={back}
        list={
          loading ? (
            <SkeletonGrid count={3} />
          ) : visible.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">
              {tab === 'pending' ? 'Nothing to review' : 'No decisions yet'}
            </p>
          ) : (
            visible.map((r) => (
              <MasterRow
                key={r.id}
                selected={r.id === selected?.id}
                onSelect={() => select(r.id)}
                avatar={r.submitted_by && <Avatar name={r.submitted_by.name} src={r.submitted_by.avatar_url ?? undefined} size="md" />}
                title={r.task_title}
                subtitle={`${r.project_name} › ${r.subfolder_name} · Round ${r.round}`}
                chip={<DecisionPill decision={r.decision} />}
              />
            ))
          )
        }
        detail={
          loading ? null : !selected ? (
            <EmptyState
              icon={<ClipboardCheck className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
              title={tab === 'pending' ? 'Nothing to review' : 'No decisions yet'}
              description={
                tab === 'pending' ? 'When someone submits work to you, it shows up here.' : 'Approved and sent-back reviews appear here.'
              }
            />
          ) : (
            <DetailCard
              title={
                <button
                  type="button"
                  onClick={() => navigate(`${prefix}/tasks/${selected.task_id}`)}
                  className="text-left hover:underline"
                >
                  {selected.task_title}
                </button>
              }
              subtitle={`${selected.project_name} › ${selected.subfolder_name} · Round ${selected.round}`}
              badges={<DecisionPill decision={selected.decision} />}
            >
              <SubGrid>
                <SubCard title="Submitted by">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--tm-ink-muted)]">
                    {selected.submitted_by && (
                      <PersonLink userId={selected.submitted_by.id} className="inline-flex items-center gap-1.5 font-semibold text-[var(--tm-ink)]">
                        <Avatar name={selected.submitted_by.name} src={selected.submitted_by.avatar_url ?? undefined} size="xs" />
                        {selected.submitted_by.name}
                      </PersonLink>
                    )}
                    {formatDate(selected.created_at, 'MMM d, h:mm a')}
                  </p>
                  {isAdmin && selected.approver && (
                    <p className="mt-2 text-[12.5px] text-[var(--tm-ink-muted)]">For {selected.approver.name}</p>
                  )}
                </SubCard>
                {selected.decision !== 'pending' && (
                  <SubCard title="Decision">
                    <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
                      <strong className="text-[var(--tm-ink)]">{selected.decided_by?.name ?? 'Someone'}</strong>{' '}
                      {selected.decision === 'approved' ? 'approved' : 'requested changes'}
                      {selected.decided_at && ` · ${formatDate(selected.decided_at, 'MMM d, h:mm a')}`}
                      {selected.comments && (
                        <span className="mt-1 block whitespace-pre-wrap text-[var(--tm-ink-soft)]">{selected.comments}</span>
                      )}
                    </p>
                  </SubCard>
                )}
                <SubCard title="Note" span>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[var(--tm-ink-soft)]">{selected.note}</p>
                  <SubmissionFiles files={selected.files} />
                </SubCard>
                {selected.can_decide && (
                  <SubCard title="Your decision" span>
                    <ReviewActions review={selected} onDone={load} />
                  </SubCard>
                )}
              </SubGrid>
            </DetailCard>
          )
        }
      />
    </>
  );
};
