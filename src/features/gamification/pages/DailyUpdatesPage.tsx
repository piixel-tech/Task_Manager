import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FilterBar, FilterDate } from '../../../components/ui/FilterBar';
import { MessageSquare, Clock } from 'lucide-react';
import { gamificationService, userService } from '../../../services';
import type { DailyUpdate, User } from '../../../types';
import { getTodayDateString, formatDate } from '../../../utils/time';
import { Card, CardContent, CardHeader } from '../../../components/ui/Card';
import { UserName } from '../../../components/ui/UserName';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Badge } from '../../../components/ui/Badge';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { FadeIn } from '../../../components/ui/FadeIn';

export const DailyUpdatesPage: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());
  const [updates, setUpdates] = useState<DailyUpdate[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [selectedDate]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [allUpdates, allUsers] = await Promise.all([
        gamificationService.getDailyUpdates(selectedDate),
        userService.getUsers()
      ]);
      setUpdates(allUpdates);
      setUsers(allUsers);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const employees = users.filter((u) => u.role === 'employee');
  const updateByUserId = new Map(updates.map((u) => [u.userId, u]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daily Updates Feed"
        description="End-of-day task summaries submitted by employees for key deliverables & time logged."
      />

      <FilterBar activeCount={selectedDate !== getTodayDateString() ? 1 : 0} onClear={() => setSelectedDate(getTodayDateString())}>
        <FilterDate label="Date" value={selectedDate} active={selectedDate !== getTodayDateString()} onChange={(v) => v && setSelectedDate(v)} />
      </FilterBar>

      {loading ? (
        <SkeletonGrid count={4} className="grid grid-cols-1 md:grid-cols-2 gap-4" />
      ) : updates.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              icon={<MessageSquare className="w-8 h-8 text-[var(--tm-ink-muted)]" />}
              title="No Daily Updates Submitted Yet"
              description={`No employee updates recorded for ${formatDate(selectedDate)}. Updates appear here when employees complete End My Day.`}
            />
          </CardContent>
        </Card>
      ) : (
        <FadeIn className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {employees.map((emp) => {
            const update = updateByUserId.get(emp.id);

            return (
              <Card key={emp.id} className={update ? 'border-[var(--tm-primary-soft)] shadow-soft-sm' : 'border-[var(--tm-border)] opacity-60'}>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <div className="flex items-center gap-3">
                    <UserName userId={emp.id} size="md" />
                  </div>
                  {update ? (
                    <Badge variant="success" size="sm">Submitted</Badge>
                  ) : (
                    <Badge variant="default" size="sm">Pending</Badge>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  {update ? (
                    <div className="bg-[var(--tm-card-muted)] p-3.5 rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)] space-y-2">
                      <p className="text-xs text-[var(--tm-ink)] font-medium whitespace-pre-wrap leading-relaxed">
                        {update.summary}
                      </p>
                      <div className="flex items-center justify-between text-[10px] text-[var(--tm-ink-muted)] pt-1 border-t border-[var(--tm-border)]">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[var(--tm-ink-muted)]" />
                          Submitted at {new Date(update.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--tm-ink-muted)] italic p-3 text-center bg-[var(--tm-card-muted)] rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
                      Has not submitted daily update for this date.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </FadeIn>
      )}
    </div>
  );
};
