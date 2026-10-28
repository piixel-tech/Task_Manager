import React from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Pencil } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Button } from '../../../components/ui/Button';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useAuthStore } from '../../../store/authStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { OfficeBoardCard } from '../../office/components/OfficeBoardCard';
import { TodayOverview } from '../../status/components/TodayOverview';
import { statusMeta } from '../../status/statusMeta';

/** Employee home: today's team overview plus my own status. */
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
        description="See who is in today and open anyone's calendar to book a slot."
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
      <OfficeBoardCard />
      <TodayOverview />
    </>
  );
};
