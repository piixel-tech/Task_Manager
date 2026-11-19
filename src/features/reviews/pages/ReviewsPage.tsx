import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCheck, ChevronDown, ClipboardCheck, Clock, Hourglass, RotateCcw, Send, ThumbsUp, Timer } from 'lucide-react';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { FilterPill } from '../../../components/ui/FilterBar';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { reviewApi, type Review } from '../../../services/http/reviewApi';
import { taskApi, type ApiTask } from '../../../services/http/taskApi';
import { FilterChips } from '../../tasks/components/TaskFilters';
import { SubmitReviewModal } from '../components/SubmitReviewModal';
import { ReviewCard } from '../components/ReviewCard';
import { SubmissionCard } from '../components/SubmissionCard';
import { groupPending, latestRounds, submissionStats, toReviewStats } from '../reviewData';

type Mode = 'review' | 'mine';
type Quick = '' | 'waiting' | 'late' | 'resub';

const QUICK_LABEL: Record<Exclude<Quick, ''>, string> = { waiting: 'Waiting on you', late: 'Waiting 2+ days', resub: 'Resubmissions' };

/** "Waiting 2+ days · 3": a dot, the name, a thin line and a chevron that folds the group. */
const GroupHeader: React.FC<{ label: string; count: number; dot: string; folded: boolean; onToggle: () => void }> = ({ label, count, dot, folded, onToggle }) => (
  <button type="button" aria-expanded={!folded} onClick={onToggle} className="flex w-full items-center gap-2 px-1 py-1 text-left">
    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} />
    <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--tm-ink-muted)]">
      {label} <span className="tabular-nums">· {count}</span>
    </span>
    <span className="h-px flex-1 bg-[var(--tm-border)]" />
    <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--tm-ink-muted)] transition-transform ${folded ? '-rotate-90' : ''}`} />
  </button>
);

const Switch: React.FC<{ mode: Mode; onChange: (m: Mode) => void; showReview: boolean; count: number }> = ({ mode, onChange, showReview, count }) => (
  <div role="tablist" aria-label="Reviews" className="inline-flex gap-1 rounded-full bg-[var(--tm-card-muted)] p-1">
    {showReview && (
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'review'}
        onClick={() => onChange('review')}
        className={`inline-flex h-10 items-center gap-2 rounded-full px-5 text-[13.5px] font-semibold transition-colors ${mode === 'review' ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'}`}
      >
        To review
        <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${count > 0 ? 'bg-[var(--tp-red)] text-white' : 'bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-muted)]'}`}>{count}</span>
      </button>
    )}
    <button
      type="button"
      role="tab"
      aria-selected={mode === 'mine'}
      onClick={() => onChange('mine')}
      className={`inline-flex h-10 items-center rounded-full px-5 text-[13.5px] font-semibold transition-colors ${mode === 'mine' ? 'bg-[var(--tm-solid)] text-[var(--tm-solid-ink)]' : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'}`}
    >
      My submissions
    </button>
  </div>
);

/** Reviews: "To review" for heads and admins (what was handed to them), "My submissions" for everyone (what they handed in). */
export const ReviewsPage: React.FC = () => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [mode, setMode] = useState<Mode>(isAdmin ? 'review' : 'mine');
  const [reviews, setReviews] = useState<Review[]>([]);
  const [rounds, setRounds] = useState<Review[]>([]); // every round I submitted
  const [latest, setLatest] = useState<Review[]>([]); // the newest round of each of my tasks
  const [myTasks, setMyTasks] = useState<Map<string, ApiTask>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [tab, setTab] = useState<'pending' | 'decided'>('pending');
  const [mineTab, setMineTab] = useState<'open' | 'approved'>('open');
  const [quick, setQuick] = useState<Quick>('');
  const [person, setPerson] = useState('');
  const [project, setProject] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const [resubmitting, setResubmitting] = useState<ApiTask | null>(null);

  const load = useCallback(async () => {
    try {
      const [inbox, tasks] = await Promise.all([me?.role === 'client' ? Promise.resolve([]) : reviewApi.list(), taskApi.list({})]);
      setReviews(inbox);
      const mine = tasks.filter((t) => t.assignee?.id === me?.id && t.review_rounds > 0);
      const perTask = await Promise.all(mine.map((t) => reviewApi.rounds(t.id)));
      setMyTasks(new Map(mine.map((t) => [t.id, t])));
      setRounds(perTask.flat());
      setLatest(latestRounds(perTask).sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setPicked(new Set());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load reviews');
    } finally {
      setLoading(false);
    }
  }, [me?.id, me?.role]);

  useEffect(() => {
    load();
  }, [load]);

  // A new submission, a decision or a send-back arrives live.
  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('review_') && load()), [load]);

  const pendingAll = useMemo(() => reviews.filter((r) => r.decision === 'pending'), [reviews]);
  const showReview = isAdmin || reviews.length > 0;
  const activeMode: Mode = showReview ? mode : 'mine';
  const stats = useMemo(() => toReviewStats(reviews), [reviews]);
  const mineStats = useMemo(() => submissionStats(latest, rounds), [latest, rounds]);

  const persons = useMemo(() => [...new Map(reviews.filter((r) => r.submitted_by).map((r) => [r.submitted_by!.id, r.submitted_by!.name])).entries()].map(([value, label]) => ({ value, label })), [reviews]);
  const projects = useMemo(() => [...new Map(reviews.map((r) => [r.project_id ?? r.project_name, r.project_name])).entries()].map(([value, label]) => ({ value, label })), [reviews]);

  const shown = useMemo(() => {
    const base = tab === 'pending' ? pendingAll : reviews.filter((r) => r.decision !== 'pending').sort((a, b) => (b.decided_at ?? '').localeCompare(a.decided_at ?? ''));
    return base.filter((r) => {
      if (quick === 'waiting' && !r.can_decide) return false;
      if (quick === 'late' && !groupPending([r]).late.length) return false;
      if (quick === 'resub' && r.round <= 1) return false;
      if (person && r.submitted_by?.id !== person) return false;
      if (project && (r.project_id ?? r.project_name) !== project) return false;
      return true;
    });
  }, [tab, pendingAll, reviews, quick, person, project]);

  const toggle = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (!next.delete(id)) next.add(id);
    return next;
  };
  const open = (taskId: string) => navigate(`${prefix}/tasks/${taskId}`);

  const decidable = shown.filter((r) => r.can_decide && r.decision === 'pending');
  const approveSelected = async () => {
    const ids = [...picked];
    const ok = await confirm({
      title: `Approve ${ids.length} ${ids.length === 1 ? 'submission' : 'submissions'}?`,
      message: 'Each task is marked complete at 100% and its assignee is notified.',
      confirmLabel: 'Approve selected',
      action: async () => {
        for (const id of ids) await reviewApi.approve(id);
      },
      successTitle: 'Tasks approved'
    });
    if (ok) load();
  };

  const chips = [
    quick && { key: 'quick', label: QUICK_LABEL[quick], onRemove: () => setQuick('') },
    person && { key: 'person', label: persons.find((p) => p.value === person)?.label ?? person, onRemove: () => setPerson('') },
    project && { key: 'project', label: projects.find((p) => p.value === project)?.label ?? project, onRemove: () => setProject('') }
  ].filter(Boolean) as { key: string; label: string; onRemove: () => void }[];

  const renderToReview = () => {
    const groups = tab === 'pending' ? groupPending(shown) : null;
    const section = (id: string, label: string, dot: string, list: Review[]) =>
      list.length === 0 ? null : (
        <div key={id} className="space-y-2.5">
          <GroupHeader label={label} count={list.length} dot={dot} folded={folded.has(id)} onToggle={() => setFolded((f) => toggle(f, id))} />
          {!folded.has(id) &&
            list.map((r) => (
              <ReviewCard
                key={r.id}
                review={r}
                selectable={r.can_decide && r.decision === 'pending'}
                checked={picked.has(r.id)}
                onCheck={() => setPicked((p) => toggle(p, r.id))}
                onOpen={() => open(r.task_id)}
                onDone={load}
              />
            ))}
        </div>
      );
    return (
      <>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 xl:grid-cols-4 max-sm:gap-2.5">
          <StatCard label="Waiting on you" value={stats.waiting} icon={<ClipboardCheck className="h-5 w-5" />} tone="warn" hint="You can decide these now" onClick={() => { setTab('pending'); setQuick('waiting'); }} />
          <StatCard
            label="Waiting 2+ days"
            value={stats.late}
            icon={<Hourglass className="h-5 w-5" />}
            tone="bad"
            hint="Submitted two or more days ago"
            className={stats.late > 0 ? 'bg-[var(--tm-danger-bg)]!' : ''}
            valueClassName={stats.late > 0 ? 'text-[var(--tm-danger)]' : undefined}
            onClick={() => { setTab('pending'); setQuick('late'); }}
          />
          <StatCard label="Resubmissions" value={stats.resubmissions} icon={<RotateCcw className="h-5 w-5" />} tone="neutral" hint="Round 2 or later" onClick={() => { setTab('pending'); setQuick('resub'); }} />
          <StatCard label="Decided this week" value={stats.decidedWeek} icon={<CheckCheck className="h-5 w-5" />} tone="ok" hint="Approved or sent back" onClick={() => { setQuick(''); setTab('decided'); }} />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <PillTabs
            activeTab={tab}
            onChange={(t) => setTab(t as 'pending' | 'decided')}
            tabs={[
              { id: 'pending', label: 'Pending', count: pendingAll.length },
              { id: 'decided', label: 'Decided' }
            ]}
            showZero
          />
          <FilterPill label="Person" value={person} onChange={setPerson} options={[{ value: '', label: 'Everyone' }, ...persons]} />
          <FilterPill label="Project" value={project} onChange={setProject} options={[{ value: '', label: 'All projects' }, ...projects]} />
        </div>
        <FilterChips chips={chips} />

        {tab === 'pending' && decidable.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--tm-card-muted)] px-4 py-2.5">
            <label className="inline-flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-[var(--tm-ink)]">
              <input
                type="checkbox"
                checked={picked.size > 0 && picked.size === decidable.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(decidable.map((r) => r.id)) : new Set())}
                className="h-4 w-4"
              />
              Select all
            </label>
            <span className="text-[12.5px] text-[var(--tm-ink-muted)]">{picked.size} selected</span>
            <Button size="sm" className="ml-auto" disabled={picked.size === 0} onClick={() => void approveSelected()} leftIcon={<ThumbsUp className="h-4 w-4" />}>
              Approve selected
            </Button>
          </div>
        )}

        {shown.length === 0 ? (
          <Card className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
              <ClipboardCheck className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p className="mt-4 text-[16px] font-bold text-[var(--tm-ink)]">{tab === 'pending' ? "You're all caught up" : 'No decisions yet'}</p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--tm-ink-muted)]">
              {tab === 'pending' ? 'When someone submits work to you, it shows up here.' : 'Approved and sent-back reviews appear here.'}
            </p>
          </Card>
        ) : groups ? (
          <div className="space-y-5">
            {section('late', 'Waiting 2+ days', 'var(--tp-red)', groups.late)}
            {section('new', 'New', 'var(--tm-accent)', groups.fresh)}
          </div>
        ) : (
          <div className="space-y-2.5">
            {shown.map((r) => (
              <ReviewCard key={r.id} review={r} selectable={false} checked={false} onCheck={() => undefined} onOpen={() => open(r.task_id)} onDone={load} />
            ))}
          </div>
        )}
      </>
    );
  };

  const renderMine = () => {
    const changes = latest.filter((r) => r.decision === 'changes_requested');
    const waiting = latest.filter((r) => r.decision === 'pending');
    const approved = latest.filter((r) => r.decision === 'approved');
    const card = (r: Review) => (
      <SubmissionCard
        key={r.id}
        review={r}
        onOpen={() => open(r.task_id)}
        onResubmit={myTasks.get(r.task_id) ? () => setResubmitting(myTasks.get(r.task_id)!) : undefined}
      />
    );
    const group = (id: string, label: string, dot: string, list: Review[]) =>
      list.length === 0 ? null : (
        <div key={id} className="space-y-2.5">
          <GroupHeader label={label} count={list.length} dot={dot} folded={folded.has(id)} onToggle={() => setFolded((f) => toggle(f, id))} />
          {!folded.has(id) && list.map(card)}
        </div>
      );
    const none = mineTab === 'open' ? changes.length + waiting.length === 0 : approved.length === 0;
    return (
      <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Changes requested"
            value={mineStats.changes}
            icon={<RotateCcw className="h-5 w-5" />}
            tone="bad"
            hint="Sent back to you"
            className={mineStats.changes > 0 ? 'bg-[var(--tm-danger-bg)]!' : ''}
            valueClassName={mineStats.changes > 0 ? 'text-[var(--tm-danger)]' : undefined}
            onClick={() => setMineTab('open')}
          />
          <StatCard label="Waiting for review" value={mineStats.waiting} icon={<Timer className="h-5 w-5" />} tone="warn" hint="With a head right now" onClick={() => setMineTab('open')} />
          <StatCard label="Submitted" value={mineStats.submitted} icon={<Send className="h-5 w-5" />} tone="neutral" hint="Handed in this month" onClick={() => setMineTab('open')} />
          <StatCard label="Approved this month" value={mineStats.approvedMonth} icon={<CheckCheck className="h-5 w-5" />} tone="ok" hint="Signed off" onClick={() => setMineTab('approved')} />
        </div>

        <div className="flex">
          <PillTabs
            activeTab={mineTab}
            onChange={(t) => setMineTab(t as 'open' | 'approved')}
            tabs={[
              { id: 'open', label: 'Open', count: changes.length + waiting.length },
              { id: 'approved', label: 'Approved', count: approved.length }
            ]}
            showZero
          />
        </div>

        {none ? (
          <Card className="flex flex-col items-center px-6 py-14 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
              <Clock className="h-6 w-6" strokeWidth={1.75} />
            </span>
            <p className="mt-4 text-[16px] font-bold text-[var(--tm-ink)]">{mineTab === 'open' ? 'Nothing waiting on anyone' : 'Nothing approved yet'}</p>
            <p className="mt-1 max-w-sm text-[13px] text-[var(--tm-ink-muted)]">
              {mineTab === 'open' ? 'Work you hand in for review shows up here, with where it stands.' : 'Approved submissions appear here.'}
            </p>
            <Button className="mt-5" onClick={() => navigate(`${prefix}/tasks`)}>
              Go to My tasks
            </Button>
          </Card>
        ) : mineTab === 'open' ? (
          <div className="space-y-5">
            {group('changes', 'Changes requested', 'var(--tp-red)', changes)}
            {group('waiting', 'Waiting for review', 'var(--tm-warning)', waiting)}
          </div>
        ) : (
          <div className="space-y-5">{group('approved', 'Approved', 'var(--tm-success)', approved)}</div>
        )}
      </>
    );
  };

  return (
    <div className="grid gap-4">
      <PageHeader
        className="pb-1"
        title="Reviews"
        description={isAdmin ? 'Every submission across all projects, and the work you handed in yourself.' : 'Work people submitted to you, and the work you handed in.'}
      />

      <div>
        <Switch mode={activeMode} onChange={setMode} showReview={showReview} count={stats.waiting} />
      </div>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {loading ? <SkeletonGrid count={3} /> : activeMode === 'review' ? renderToReview() : renderMine()}

      {resubmitting && <SubmitReviewModal isOpen onClose={() => setResubmitting(null)} task={resubmitting} onSubmitted={load} />}
    </div>
  );
};
