import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MessageSquare, ShieldQuestion, XCircle } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { FilterBar } from '../../../components/ui/FilterBar';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Button } from '../../../components/ui/Button';
import { DetailCard, MasterDetail, MasterRow, SubCard, SubGrid, useMasterSelection } from '../../../components/ui/MasterDetail';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { socket } from '../../../services/socket';
import { chatApi, type ApprovalItem } from '../../../services/http/chatApi';
import { ApprovalCard } from '../../chat/components/ApprovalCard';
import { dailyCounts, weekTrend } from '../../../utils/trend';

/** Everything the team has asked this client to approve: what is waiting, and what has been answered. */
export const ClientApprovalsPage: React.FC = () => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
  const [answer, setAnswer] = useState<'' | 'approved' | 'rejected'>('');
  const [items, setItems] = useState<ApprovalItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    chatApi
      .approvals('all')
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load approvals'));
  }, []);

  useEffect(() => {
    load();
    const offs = ['chat:message', 'chat:message_update', 'chat:group'].map((e) => socket.on(e, load));
    return () => offs.forEach((off) => off());
  }, [load]);

  const pending = (items ?? []).filter((i) => i.approval.status === 'pending');
  const history = (items ?? []).filter((i) => i.approval.status !== 'pending');
  const shown = (tab === 'pending' ? pending : answer ? history.filter((i) => i.approval.status === answer) : history).map((i) => ({ ...i, id: i.approval.id }));
  const { selected, open, select, back } = useMasterSelection(shown);
  const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const chip = (status: string) =>
    status === 'cancelled' ? (
      <span className="rounded-full bg-[var(--tm-neutral-bg)] px-2.5 py-1 text-[11px] font-bold text-[var(--tm-neutral)]">Withdrawn</span>
    ) : (
      <StatusChip status={status} size="sm" />
    );

  return (
    <>
      <PageHeader title="Approvals" description="Questions from the team that need your yes or no." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Waiting for you"
          onClick={() => {
            setTab('pending');
            setAnswer('');
          }}
          value={pending.length}
          icon={<ShieldQuestion className="h-5 w-5" />}
          tone="warn"
          hint="Need your yes or no"
          {...weekTrend(dailyCounts(pending, (i) => i.approval.created_at, 14))}
        />
        <StatCard onClick={() => { setTab('history'); setAnswer(''); }} label="Answered" value={history.length} icon={<MessageSquare className="h-5 w-5" />} tone="primary" hint="Kept in your history" trend={dailyCounts(history, (i) => i.approval.answered_at, 7)} trendKind="line" />
        <StatCard onClick={() => { setTab('history'); setAnswer('approved'); }} label="Approved" value={history.filter((i) => i.approval.status === 'approved').length} icon={<CheckCircle2 className="h-5 w-5" />} tone="ok" hint="Answered yes" />
        <StatCard onClick={() => { setTab('history'); setAnswer('rejected'); }} label="Rejected" value={history.filter((i) => i.approval.status === 'rejected').length} icon={<XCircle className="h-5 w-5" />} tone="bad" hint="Answered no" />
      </div>

      {tab === 'history' && answer && (
        <FilterBar
          activeCount={1}
          onClear={() => setAnswer('')}
          chips={[{ key: 'answer', label: answer === 'approved' ? 'Approved' : 'Rejected', onRemove: () => setAnswer('') }]}
        >
          <span />
        </FilterBar>
      )}

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
      {!items ? (
        error ? null : <SkeletonGrid count={2} />
      ) : (
        <MasterDetail
          tabs={[
            { id: 'pending', label: 'Waiting for you', count: pending.length },
            { id: 'history', label: 'History', count: history.length }
          ]}
          activeTab={tab}
          onTabChange={(t) => {
            setTab(t as typeof tab);
            if (t === 'pending') setAnswer('');
          }}
          detailOpen={open}
          onBack={back}
          list={
            shown.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">
                {tab === 'pending' ? 'Nothing is waiting for you' : 'No answered approvals yet'}
              </p>
            ) : (
              shown.map((i) => (
                <MasterRow
                  key={i.id}
                  selected={i.id === selected?.id}
                  onSelect={() => select(i.id)}
                  avatar={
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tm-bg-sunken)] text-[var(--tm-primary-light)]">
                      <ShieldQuestion className="h-5 w-5" />
                    </span>
                  }
                  title={i.approval.question}
                  subtitle={`${i.group_name} · ${when(i.approval.created_at)}`}
                  chip={chip(i.approval.status)}
                />
              ))
            )
          }
          detail={
            !selected ? (
              <EmptyState
                icon={<ShieldQuestion className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
                title={tab === 'pending' ? 'Nothing is waiting for you' : 'No answered approvals yet'}
                description={tab === 'pending' ? 'When the team needs a decision from you it will show up here.' : 'Approvals you have answered are kept here.'}
              />
            ) : (
              <DetailCard
                title={selected.group_name}
                subtitle={`Asked ${when(selected.approval.created_at)}`}
                badges={chip(selected.approval.status)}
                actions={
                  <Link to={`/client/chats?group=${selected.group_id}`}>
                    <Button size="sm" variant="secondary" leftIcon={<MessageSquare className="h-4 w-4" />}>
                      Open chat
                    </Button>
                  </Link>
                }
              >
                <SubGrid cols={1}>
                  <SubCard>
                    <ApprovalCard approval={selected.approval} canAnswer={selected.approval.status === 'pending'} onAnswered={load} />
                  </SubCard>
                </SubGrid>
              </DetailCard>
            )
          }
        />
      )}
    </>
  );
};
