import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarClock, ClipboardList, Layers, MessageSquare, PartyPopper, ShieldQuestion } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/useChatStore';
import { socket } from '../../../services/socket';
import { portalApi, type PortalSummary } from '../../../services/http/portalApi';

const monthName = (ym: string) => new Date(`${ym}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

const Section: React.FC<{ icon: React.ReactNode; title: string; badge?: number; to: string; cta: string; children: React.ReactNode }> = ({
  icon,
  title,
  badge,
  to,
  cta,
  children
}) => (
  <Card>
    <CardContent className="flex h-full flex-col gap-4 pt-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-[15px] font-extrabold text-[var(--tm-ink)]">
          <span className="text-[var(--tm-primary)]">{icon}</span>
          {title}
          {!!badge && <span className="rounded-full bg-[var(--tm-danger)] px-2.5 py-0.5 text-[11px] font-extrabold text-white">{badge}</span>}
        </h2>
        <Link to={to} className="inline-flex items-center gap-1 text-[12.5px] font-bold text-[var(--tm-primary-dark)] hover:underline">
          {cta} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {children}
    </CardContent>
  </Card>
);

/** The portal home: what needs the client's answer, how this month's work is going, and what they asked for lately. */
export const ClientHomePage: React.FC = () => {
  const name = useAuthStore((s) => s.user?.name.split(' ')[0]);
  const unread = useChatStore((s) => s.groups.reduce((n, g) => n + g.unread_count, 0));
  const [data, setData] = useState<PortalSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    portalApi
      .summary()
      .then((s) => {
        setData(s);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your summary'));
  }, []);

  useEffect(() => {
    load();
    const offs = ['chat:message_update', 'chat:group'].map((e) => socket.on(e, load));
    const offNote = socket.on('notification', (n: { type?: string }) => {
      if (n?.type?.startsWith('requirement_') || n?.type?.startsWith('approval_') || n?.type === 'client_approval') load();
    });
    return () => {
      offs.forEach((off) => off());
      offNote();
    };
  }, [load]);

  const donePct = data && data.deliverables.total ? Math.round((100 * data.deliverables.done) / data.deliverables.total) : 0;

  return (
    <>
      <PageHeader title={`Welcome${name ? `, ${name}` : ''}`} description="Here is where your projects stand." />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}
      {!data ? (
        error ? null : <SkeletonGrid count={3} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <Section icon={<ShieldQuestion className="h-5 w-5" />} title="Waiting for your answer" badge={data.pending_approvals} to="/client/approvals" cta="Respond">
            {data.approvals.length === 0 ? (
              <p className="flex items-center gap-2 rounded-xl bg-[var(--tm-card-muted)] p-4 text-[13.5px] font-semibold text-[var(--tm-ink-soft)]">
                <PartyPopper className="h-4 w-4 text-[var(--tm-primary)]" />
                Nothing is waiting for you.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--tm-border)]">
                {data.approvals.map((i) => (
                  <li key={i.approval.id} className="py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">{i.group_name}</p>
                    <p className="line-clamp-2 text-[14px] font-semibold text-[var(--tm-ink)]">{i.approval.question}</p>
                  </li>
                ))}
                {data.pending_approvals > data.approvals.length && (
                  <li className="pt-2.5 text-[12.5px] text-[var(--tm-ink-muted)]">and {data.pending_approvals - data.approvals.length} more</li>
                )}
              </ul>
            )}
          </Section>

          <Section icon={<Layers className="h-5 w-5" />} title={`Deliverables · ${monthName(data.month)}`} to="/client/deliverables" cta="Open tracker">
            {data.deliverables.total === 0 ? (
              <p className="rounded-xl bg-[var(--tm-card-muted)] p-4 text-[13.5px] text-[var(--tm-ink-muted)]">Nothing is planned for this month yet.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <p className="text-[14px] font-bold text-[var(--tm-ink)]">
                    {data.deliverables.done} done / {data.deliverables.remaining} remaining
                  </p>
                  <span className="text-2xl font-black tabular-nums text-[var(--tm-ink)]">{donePct}%</span>
                </div>
                <ProgressBar value={donePct} tone={data.deliverables.remaining === 0 ? 'ok' : 'primary'} height={12} />
                <p className="text-[12px] text-[var(--tm-ink-muted)]">An item is done once it is posted. Work in progress moves the overall bar to {data.deliverables.progress}%.</p>
              </div>
            )}
          </Section>

          <Section icon={<ClipboardList className="h-5 w-5" />} title="Latest requirements" to="/client/requirements" cta="See all">
            {data.latest_requirements.length === 0 ? (
              <p className="rounded-xl bg-[var(--tm-card-muted)] p-4 text-[13.5px] text-[var(--tm-ink-muted)]">Nothing recorded yet. Tell the team what you need.</p>
            ) : (
              <ul className="divide-y divide-[var(--tm-border)]">
                {data.latest_requirements.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <p className="line-clamp-1 text-[14px] font-semibold text-[var(--tm-ink)]">{r.title}</p>
                    <p className="text-[12px] text-[var(--tm-ink-muted)]">
                      {r.author?.name ?? 'Someone'} · {day(r.created_at)}
                      {r.subfolder ? ` · ${r.subfolder.name}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Card>
            <CardContent className="flex h-full flex-col justify-center gap-3 pt-6">
              <Link to="/client/chats">
                <Button variant="secondary" className="w-full justify-between" rightIcon={<ArrowRight className="h-4 w-4" />} leftIcon={<MessageSquare className="h-4 w-4" />}>
                  Chats{unread > 0 ? ` · ${unread} unread` : ''}
                </Button>
              </Link>
              <Link to="/client/meetings">
                <Button variant="secondary" className="w-full justify-between" rightIcon={<ArrowRight className="h-4 w-4" />} leftIcon={<CalendarClock className="h-4 w-4" />}>
                  Book a meeting with the team
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
};
