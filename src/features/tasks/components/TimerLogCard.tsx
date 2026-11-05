import React, { useEffect, useMemo, useState } from 'react';
import { Timer } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { timerApi, type TimerLog, type TimerLogEntry } from '../../../services/http/timerApi';
import { useTimerStore } from '../../../store/useTimerStore';
import { formatDuration } from '../../../utils/format';

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const dayLabel = (day: number): string => {
  const diff = Math.round((startOfDay(new Date()) - day) / 86_400_000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = new Date(day);
  return d.toLocaleDateString('en-GB', d.getFullYear() === new Date().getFullYear() ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
};

const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dateTime = (iso: string) =>
  `${new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, ${time(iso)}`;

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-[var(--tm-radius-md)] bg-[var(--tm-bg-sunken)] px-4 py-3">
    <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">{label}</p>
    <p className="mt-0.5 text-[18px] font-extrabold tabular-nums text-[var(--tm-ink)]">{value}</p>
  </div>
);

/**
 * Every timer session on a task (play to pause), newest first, grouped by day, with the totals on top. Read-only. The server only
 * answers the assignee, the subfolder's heads and admins; for anyone else this renders nothing.
 */
export const TimerLogCard: React.FC<{ taskId: string }> = ({ taskId }) => {
  const rev = useTimerStore((s) => s.rev); // a play or pause anywhere: fetch the log again
  const [log, setLog] = useState<TimerLog | null>(null);
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let live = true;
    timerApi
      .log(taskId)
      .then((l) => {
        if (!live) return;
        setLog(l);
        setFetchedAt(Date.now());
        setHidden(false);
      })
      .catch(() => live && setHidden(true)); // not allowed to see it (or it failed): show nothing
    return () => {
      live = false;
    };
  }, [taskId, rev]);

  const running = !!log?.entries.some((e) => e.running);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);

  const view = useMemo(() => {
    if (!log) return null;
    const serverNow = new Date(log.server_now).getTime() + (now - fetchedAt);
    const secs = (e: TimerLogEntry) => (e.running ? Math.max(0, (serverNow - new Date(e.started_at).getTime()) / 1000) : e.seconds);
    const today = startOfDay(new Date());
    const days = new Map<number, { entries: TimerLogEntry[]; total: number }>();
    let total = 0;
    let todayTotal = 0;
    for (const e of log.entries) {
      const key = startOfDay(new Date(e.started_at)); // a session counts on the day it started
      const day = days.get(key) ?? { entries: [], total: 0 };
      day.entries.push(e);
      day.total += secs(e);
      days.set(key, day);
      total += secs(e);
      if (key === today) todayTotal += secs(e);
    }
    return { secs, total, todayTotal, days: [...days.entries()].sort((a, b) => b[0] - a[0]) };
  }, [log, now, fetchedAt]);

  if (hidden || !log || !view) return null;
  const people = new Set(log.entries.map((e) => e.user.id));
  const showWho = people.size > 1;

  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold">
          <Timer className="h-4 w-4 text-[var(--tm-primary-dark)]" /> Timer log
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Total time" value={formatDuration(view.total)} />
          <Stat label="Sessions" value={String(log.entries.length)} />
          <Stat label="Today" value={formatDuration(view.todayTotal)} />
        </div>

        {log.entries.length === 0 ? (
          <p className="text-[13px] text-[var(--tm-ink-muted)]">No time tracked yet. Sessions appear here when the timer is played.</p>
        ) : (
          view.days.map(([day, group]) => (
            <section key={day} aria-label={dayLabel(day)}>
              <div className="mb-1.5 flex items-center justify-between">
                <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">{dayLabel(day)}</h4>
                <span className="text-[12px] font-bold tabular-nums text-[var(--tm-ink-soft)]">{formatDuration(group.total)}</span>
              </div>
              <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-md)] border border-[var(--tm-border)]">
                {group.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-3.5 py-2.5 text-[13px]">
                    {showWho && (
                      <span className="flex min-w-0 shrink-0 items-center gap-2" title={e.user.name}>
                        <Avatar name={e.user.name} src={e.user.avatar_url ?? undefined} size="md" className="!h-6 !w-6 !text-[10px]" />
                        <span className="hidden max-w-[7rem] truncate font-semibold text-[var(--tm-ink)] sm:inline">{e.user.name}</span>
                      </span>
                    )}
                    <span className="min-w-0 flex-1 tabular-nums text-[var(--tm-ink-soft)]">
                      {dateTime(e.started_at)} <span className="text-[var(--tm-ink-muted)]">→</span>{' '}
                      {e.running ? (
                        <span className="font-bold text-[var(--tm-success)]">Running</span>
                      ) : (
                        e.ended_at && dateTime(e.ended_at)
                      )}
                    </span>
                    <span className={`shrink-0 font-extrabold tabular-nums ${e.running ? 'text-[var(--tm-success)]' : 'text-[var(--tm-ink)]'}`}>
                      {formatDuration(view.secs(e))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
};
