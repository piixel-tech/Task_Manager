import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldQuestion } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { Card, CardContent } from '../../../components/ui/Card';
import { socket } from '../../../services/socket';
import { chatApi, type ApprovalItem } from '../../../services/http/chatApi';
import { ApprovalCard } from '../../chat/components/ApprovalCard';

/** Everything the team has asked this client to approve: what is waiting, and what has been answered. */
export const ClientApprovalsPage: React.FC = () => {
  const [tab, setTab] = useState<'pending' | 'history'>('pending');
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
  const shown = tab === 'pending' ? pending : history;

  return (
    <>
      <PageHeader title="Approvals" description="Questions from the team that need your yes or no." />
      <PillTabs
        activeTab={tab}
        onChange={(t) => setTab(t as typeof tab)}
        tabs={[
          { id: 'pending', label: 'Waiting for you', count: pending.length },
          { id: 'history', label: 'History', count: history.length }
        ]}
      />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      {!items ? (
        error ? null : <SkeletonGrid count={2} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<ShieldQuestion className="h-6 w-6 text-[var(--tm-primary)]" />}
          title={tab === 'pending' ? 'Nothing is waiting for you' : 'No answered approvals yet'}
          description={tab === 'pending' ? 'When the team needs a decision from you it will show up here.' : 'Approvals you have answered are kept here.'}
        />
      ) : (
        <ul className="grid gap-5 md:grid-cols-2">
          {shown.map((i) => (
            <li key={i.approval.id}>
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <Link
                    to={`/client/chats?group=${i.group_id}`}
                    className="block text-[11.5px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)] hover:text-[var(--tm-primary-dark)] hover:underline"
                  >
                    {i.group_name} · {new Date(i.approval.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Link>
                  <ApprovalCard approval={i.approval} canAnswer={i.approval.status === 'pending'} onAnswered={load} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
