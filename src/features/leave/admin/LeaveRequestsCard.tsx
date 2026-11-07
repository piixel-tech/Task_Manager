import React from 'react';
import { CalendarCheck } from 'lucide-react';
import { StaggerItem } from '../../../components/ui/Stagger';
import { useLeaveInbox } from '../../../store/useLeaveInboxStore';
import { DashboardCard, WidgetEmpty, WidgetSkeleton } from '../../dashboard/widgets/DashboardCard';
import { LeaveReviewList } from './LeaveReviewList';

/** "Leave requests" on the admin home: what is waiting for this admin, with Approve / Reject. It empties as requests are dealt with. */
export const LeaveRequestsCard: React.FC = () => {
  const { pending, loaded, error, load } = useLeaveInbox(true);
  return (
    <StaggerItem className="lg:col-span-12">
      <DashboardCard animate={false} icon={<CalendarCheck className="h-5 w-5" />} title="Leave requests" badge={pending.length} to="/admin/leave-requests" cta="Open leave requests" className="h-full">
        {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
        {!loaded ? (
          <WidgetSkeleton />
        ) : pending.length === 0 ? (
          <WidgetEmpty>No leave or work-from-home requests are waiting for you.</WidgetEmpty>
        ) : (
          <LeaveReviewList requests={pending} onChanged={() => void load()} />
        )}
      </DashboardCard>
    </StaggerItem>
  );
};
