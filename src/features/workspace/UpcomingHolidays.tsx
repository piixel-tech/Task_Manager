import React, { useEffect } from 'react';
import { PartyPopper } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { useAuthStore } from '../../store/authStore';
import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { holidayDates, upcomingHolidays, ymdOf } from './dayOff';

/** The next named holidays for my company (weekly offs are not listed): on the Calendar page and on every Home dashboard. */
export const UpcomingHolidays: React.FC<{ className?: string; limit?: number }> = ({ className = '', limit = 5 }) => {
  const me = useAuthStore((s) => s.user);
  const workspace = useWorkspaceStore((s) => s.workspace);
  useEffect(() => {
    if (!workspace) void useWorkspaceStore.getState().load();
  }, [workspace]);

  const rows = upcomingHolidays(workspace, me?.companyId, ymdOf(new Date()), limit);

  return (
    <Card className={className}>
      <CardContent className="space-y-3 pt-5">
        <h2 className="flex items-center gap-3 text-[15px] font-semibold text-[var(--tm-ink)]">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
            <PartyPopper className="h-4 w-4" />
          </span>
          Upcoming holidays
        </h2>
        {rows.length === 0 ? (
          <p className="py-2 text-[13px] text-[var(--tm-ink-muted)]">No holidays coming up.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map(({ holiday: h, daysLeft, ongoing }) => (
              <li key={h.id} className="flex items-center gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{h.name}</p>
                  <p className="text-[12px] tabular-nums text-[var(--tm-ink-muted)]">{holidayDates(h)}</p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--tm-primary-soft)] px-2.5 py-1 text-[11px] font-bold text-[var(--tm-primary-dark)]">
                  {ongoing ? 'On now' : daysLeft === 1 ? 'Tomorrow' : `In ${daysLeft} days`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
