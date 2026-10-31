import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Pencil } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Stagger } from '../../../components/ui/Stagger';
import { useAuthStore } from '../../../store/authStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { OfficeBoardCard } from '../../office/components/OfficeBoardCard';
import { UpcomingHolidays } from '../../workspace/UpcomingHolidays';
import { TodayOverview } from '../../status/components/TodayOverview';
import { statusMeta } from '../../status/statusMeta';
import { EmployeeWidgets } from '../widgets/EmployeeWidgets';

/** Employee home: my day at a glance (tasks, reviews, schedule), then today's team overview. */
export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { today, openEditor } = useDailyStatusStore();
  const meta = statusMeta(today?.status);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user?.nickname || user?.name || ''}`}
        description="Your day at a glance, and who is in today."
        actions={
          <>
            <StatusChip tone={meta?.tone ?? 'neutral'}>{meta ? `You: ${meta.label}` : 'Status not set'}</StatusChip>
            <Button variant="outline" size="sm" onClick={openEditor} leftIcon={<Pencil className="h-4 w-4" />}>
              Change status
            </Button>
            <Button
              size="sm"
              onClick={() => navigate('/app/calendar')}
              leftIcon={<CalendarDays className="h-4 w-4" />}
            >
              My calendar
            </Button>
          </>
        }
      />
      <Stagger className="grid gap-6 lg:grid-cols-12">
        <EmployeeWidgets />
        <div className="lg:col-span-12">
          <OfficeBoardCard />
        </div>
        <div className="lg:col-span-4">
          <UpcomingHolidays />
        </div>
        <div className="lg:col-span-12">
          <TodayOverview />
        </div>
      </Stagger>
    </>
  );
};
