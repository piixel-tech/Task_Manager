import React, { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Avatar } from '../../../components/ui/Avatar';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { useDailyStatusStore } from '../../../store/useDailyStatusStore';
import { DAY_STATUSES, statusMeta } from '../statusMeta';

/** Everyone's status for today. Click a person to open their calendar. */
export const TodayOverview: React.FC = () => {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const companyFilter = useAppStore((s) => s.companyFilter);
  const { overview, overviewLoaded, companyNames, loadOverview } = useDailyStatusStore();
  const prefix = me?.role === 'admin' ? '/admin' : '/app';

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const rows = useMemo(
    () =>
      overview.filter(
        (r) =>
          companyFilter === 'all' ||
          me?.role !== 'admin' ||
          (r.company_id && companyNames[r.company_id] === companyFilter)
      ),
    [overview, companyFilter, companyNames, me?.role]
  );

  const counts = DAY_STATUSES.map((s) => ({ ...s, count: rows.filter((r) => r.status === s.value).length }));
  const notSet = rows.filter((r) => r.status === null).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-extrabold">
          <CalendarDays className="h-4 w-4 text-[var(--tm-primary)]" />
          Today overview
        </CardTitle>
        <div className="mt-2 flex flex-wrap gap-2">
          {counts.map((c) => (
            <StatusChip key={c.value} tone={c.tone} size="sm" dot>
              {c.count} {c.label.toLowerCase()}
            </StatusChip>
          ))}
          <StatusChip tone="neutral" size="sm" dot>
            {notSet} not set
          </StatusChip>
        </div>
      </CardHeader>

      <CardContent className="px-3">
        {!overviewLoaded ? (
          <SkeletonRows count={4} />
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--tm-ink-muted)]">No team members yet.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => {
              const meta = statusMeta(r.status);
              const company = r.company_id ? companyNames[r.company_id] : undefined;
              return (
                <li key={r.user_id}>
                  <button
                    type="button"
                    onClick={() => navigate(`${prefix}/calendar/${r.user_id}`)}
                    className="flex w-full items-center justify-between gap-3 rounded-[var(--tm-radius-md)]
                      bg-[var(--tm-card-muted)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Avatar name={r.name} src={r.avatar_url ?? undefined} size="md" />
                      <span className="min-w-0 leading-tight">
                        <span className="block truncate text-[13px] font-bold text-[var(--tm-ink)]">
                          {r.name}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5">
                          {company && (
                            <Badge variant={company === 'unwork' ? 'unwork' : 'piixel'} size="sm" className="capitalize">
                              {company}
                            </Badge>
                          )}
                          {r.is_head && <HeadBadge />}
                        </span>
                      </span>
                    </span>
                    <StatusChip tone={meta?.tone ?? 'neutral'} size="sm">
                      {meta?.label ?? 'Not set'}
                    </StatusChip>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
