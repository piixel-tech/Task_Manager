import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent } from '../../../components/ui/Card';
import { FadeIn } from '../../../components/ui/FadeIn';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Select } from '../../../components/ui/Select';
import { companyApi, type CompanyRow } from '../../../services/http/adminApi';
import { leaveApi, type LeaveRequest, type LeaveStatus } from '../../../services/http/leaveApi';
import { socket } from '../../../services/socket';
import { useLeaveInbox } from '../../../store/useLeaveInboxStore';
import { LeaveReviewList } from './LeaveReviewList';

const EMPTY: Record<LeaveStatus, string> = {
  pending: 'No requests are waiting for you.',
  approved: 'You have not approved any requests yet.',
  rejected: 'You have not rejected any requests.'
};

/** Admin: the requests sent to me, in tabs (Pending / Approved / Rejected), filterable by company. */
export const AdminLeaveRequestsPage: React.FC = () => {
  const [tab, setTab] = useState<LeaveStatus>('pending');
  const [companyId, setCompanyId] = useState('');
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [requests, setRequests] = useState<LeaveRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inbox = useLeaveInbox(true); // the sidebar badge and the dashboard card follow what is done here

  useEffect(() => {
    companyApi.list().then(setCompanies).catch(() => undefined); // the filter just stays on "All companies"
  }, []);

  const load = useCallback(() => {
    leaveApi
      .inbox({ status: tab, companyId: companyId || undefined })
      .then((list) => {
        setRequests(list);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the requests'));
  }, [tab, companyId]);

  useEffect(() => {
    setRequests(null);
    load();
  }, [load]);

  // Made, cancelled or decided (maybe in another tab): the list follows.
  useEffect(() => socket.on('leave_requests', load), [load]);

  const changed = () => {
    load();
    void inbox.load();
  };

  return (
    <FadeIn>
      <PageHeader
        title="Leave requests"
        description="Leave and work-from-home requests sent to you."
        actions={
          <div className="w-56">
            <Select
              aria-label="Company"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              options={[{ value: '', label: 'All companies' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
            />
          </div>
        }
      />

      <div className="mt-6 space-y-4">
        <PillTabs
          activeTab={tab}
          onChange={(t) => setTab(t as LeaveStatus)}
          tabs={[
            { id: 'pending', label: 'Pending', count: inbox.pending.length },
            { id: 'approved', label: 'Approved' },
            { id: 'rejected', label: 'Rejected' }
          ]}
        />
        <Card>
          <CardContent className="pt-2">
            {error && <div className="tm-error my-3 px-4 py-3 text-xs font-semibold">{error}</div>}
            {requests === null ? (
              !error && <p className="py-6 text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>
            ) : requests.length === 0 ? (
              <p className="my-4 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-4 text-[13px] font-semibold text-[var(--tm-ink-muted)]">{EMPTY[tab]}</p>
            ) : (
              <LeaveReviewList requests={requests} onChanged={changed} />
            )}
          </CardContent>
        </Card>
      </div>
    </FadeIn>
  );
};
