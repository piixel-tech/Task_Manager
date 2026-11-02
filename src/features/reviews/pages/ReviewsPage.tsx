import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, ChevronLeft, ClipboardCheck, Inbox, RotateCcw } from 'lucide-react';
import { StatCard } from '../../../components/ui/StatCard';
import { FilterBar } from '../../../components/ui/FilterBar';
import { MasterRow, useMasterSelection } from '../../../components/ui/MasterDetail';
import { Avatar } from '../../../components/ui/Avatar';
import { Card } from '../../../components/ui/Card';
import { InfoTile } from '../../../components/ui/InfoTile';
import { PersonLink } from '../../../components/ui/PersonLink';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { reviewApi, type Review } from '../../../services/http/reviewApi';
import { formatDate } from '../../../utils/time';
import { DecisionPill, SubmissionFiles } from '../components/ReviewRounds';
import { ReviewActions } from '../components/ReviewActions';

type Tab = 'pending' | 'decided';

/** Reviews to look at. Heads see submissions picked for them; admins see every review. */
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

  const empty = !loading && visible.length === 0;

  return (
    // One grid, one 16px gap between every block, like the task detail page.
    <div className="grid gap-4">
      <PageHeader
        className="pb-1"
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
        />
        <StatCard
          onClick={() => {
            setTab('pending');
            setQuick('waiting');
          }}
          label="Waiting on you"
          value={reviews.filter((r) => r.can_decide).length}
          icon={<ClipboardCheck className="h-5 w-5" />}
          tone="warn"
          hint="You can decide these now"
        />
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

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      <div className="flex">
        <PillTabs
          activeTab={tab}
          onChange={(t) => setTab(t as Tab)}
          tabs={[
            { id: 'pending', label: 'Pending' },
            { id: 'decided', label: 'Decided' }
          ]}
        />
      </div>

      {loading ? (
        <SkeletonGrid count={3} />
      ) : empty ? (
        <Card className="flex flex-col items-center px-6 py-14 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
            <ClipboardCheck className="h-6 w-6" strokeWidth={1.75} />
          </span>
          <p className="mt-4 text-[16px] font-extrabold text-[var(--tm-ink)]">{tab === 'pending' ? 'Nothing to review' : 'No decisions yet'}</p>
          <p className="mt-1 max-w-sm text-[13px] text-[var(--tm-ink-muted)]">
            {tab === 'pending' ? 'When someone submits work to you, it shows up here.' : 'Approved and sent-back reviews appear here.'}
          </p>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
          <Card className={`min-w-0 p-3 ${open ? 'hidden lg:block' : ''}`}>
            <div className="max-h-[calc(100dvh-22rem)] min-h-[200px] space-y-1.5 overflow-y-auto pr-1">
              {visible.map((r) => (
                <MasterRow
                  variant="dark"
                  key={r.id}
                  selected={r.id === selected?.id}
                  onSelect={() => select(r.id)}
                  avatar={r.submitted_by && <Avatar name={r.submitted_by.name} src={r.submitted_by.avatar_url ?? undefined} size="md" className="!h-9 !w-9" />}
                  title={r.task_title}
                  subtitle={`${r.project_name} › ${r.subfolder_name} · Round ${r.round}`}
                  chip={<DecisionPill decision={r.decision} />}
                />
              ))}
            </div>
          </Card>

          {selected && (
            <div className={`grid min-w-0 content-start gap-4 ${open ? '' : 'hidden lg:grid'}`}>
              <button
                type="button"
                onClick={back}
                className="inline-flex w-fit items-center gap-1 rounded-full px-3 py-2 text-[13px] font-bold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] lg:hidden"
              >
                <ChevronLeft className="h-4 w-4" /> All
              </button>

              <Card className="p-5" data-focus-keep>
                <h2 className="text-[24px] font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--tm-ink)] sm:text-[28px]">
                  <button type="button" onClick={() => navigate(`${prefix}/tasks/${selected.task_id}`)} className="text-left hover:underline">
                    {selected.task_title}
                  </button>
                </h2>
                <p className="mt-1.5 text-[13.5px] font-medium text-[var(--tm-ink-muted)]">
                  {selected.project_name} › {selected.subfolder_name} · Round {selected.round}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <DecisionPill decision={selected.decision} />
                </div>
              </Card>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <InfoTile label="Submitted by">
                  <p className="flex flex-wrap items-center gap-2 text-[13px] font-normal text-[var(--tm-ink-muted)]">
                    {selected.submitted_by && (
                      <PersonLink userId={selected.submitted_by.id} className="inline-flex items-center gap-1.5 font-semibold text-[var(--tm-ink)]">
                        <Avatar name={selected.submitted_by.name} src={selected.submitted_by.avatar_url ?? undefined} size="xs" />
                        {selected.submitted_by.name}
                      </PersonLink>
                    )}
                    {formatDate(selected.created_at, 'MMM d, h:mm a')}
                  </p>
                  {isAdmin && selected.approver && <p className="mt-2 text-[12.5px] font-normal text-[var(--tm-ink-muted)]">For {selected.approver.name}</p>}
                </InfoTile>
                {selected.decision !== 'pending' && (
                  <InfoTile label="Decision">
                    <p className="text-[12.5px] font-normal text-[var(--tm-ink-muted)]">
                      <strong className="text-[var(--tm-ink)]">{selected.decided_by?.name ?? 'Someone'}</strong> {selected.decision === 'approved' ? 'approved' : 'requested changes'}
                      {selected.decided_at && ` · ${formatDate(selected.decided_at, 'MMM d, h:mm a')}`}
                      {selected.comments && <span className="mt-1 block whitespace-pre-wrap text-[var(--tm-ink-soft)]">{selected.comments}</span>}
                    </p>
                  </InfoTile>
                )}
                <InfoTile label="Note" span>
                  <p className="whitespace-pre-wrap text-[13px] font-normal leading-relaxed text-[var(--tm-ink-soft)]">{selected.note}</p>
                  <SubmissionFiles files={selected.files} />
                </InfoTile>
                {selected.can_decide && (
                  <InfoTile label="Your decision" span>
                    <ReviewActions review={selected} onDone={load} />
                  </InfoTile>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
