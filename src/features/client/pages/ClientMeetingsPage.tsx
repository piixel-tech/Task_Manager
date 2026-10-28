import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Select } from '../../../components/ui/Select';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { bookingApi } from '../../../services/http/calendarApi';
import type { UserBrief } from '../../../services/http/projectApi';
import { portalApi, type Availability, type PortalProject, type Slot } from '../../../services/http/portalApi';

const DURATIONS = [30, 60, 90];
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const todayStr = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the browser's local time

/** Pick someone from the project team, a day and a length, then tap a free slot to book it. */
export const ClientMeetingsPage: React.FC = () => {
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<PortalProject[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [host, setHost] = useState<UserBrief | null>(null);
  const [date, setDate] = useState(todayStr());
  const [minutes, setMinutes] = useState(30);
  const [avail, setAvail] = useState<Availability | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    portalApi
      .projects()
      .then((p) => {
        setProjects(p);
        setProjectId(p[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your projects'));
  }, []);

  const project = projects?.find((p) => p.id === projectId) ?? null;

  useEffect(() => {
    setHost(null);
    setAvail(null);
  }, [projectId]);

  const loadSlots = useCallback(() => {
    if (!host) return;
    setLoadingSlots(true);
    portalApi
      .availability(host.id, date, minutes)
      .then((a) => {
        setAvail(a);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load free times'))
      .finally(() => setLoadingSlots(false));
  }, [host, date, minutes]);

  useEffect(() => {
    setAvail(null);
    loadSlots();
  }, [loadSlots]);

  const open = (s: Slot) => {
    setSlot(s);
    setTitle(`Meeting with ${me?.name ?? 'client'}`);
    setNote('');
  };

  const book = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!host || !slot || !title.trim()) return;
    const ok = await confirm({
      title: `Book ${host.name}?`,
      message: `${new Date(slot.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${time(slot.start)} to ${time(slot.end)}. ${host.name} is notified.`,
      confirmLabel: 'Book meeting',
      action: async () => {
        await bookingApi.create({ host_user_id: host.id, start: slot.start, end: slot.end, title: title.trim(), note: note.trim() });
      },
      successTitle: 'Meeting booked'
    });
    if (ok) {
      setSlot(null);
      loadSlots(); // the slot is taken now
    }
  };

  return (
    <>
      <PageHeader title="Book a meeting" description="Choose someone from your project team and a time that suits you." />
      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

      {!projects ? (
        error ? null : <SkeletonGrid count={2} />
      ) : projects.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6 text-[var(--tm-primary)]" />} title="No project yet" description="Once you are added to a project you can book time with its team here." />
      ) : (
        <div className="space-y-6">
          {projects.length > 1 && (
            <div className="sm:w-72">
              <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            </div>
          )}

          <section aria-label="Team">
            <h2 className="mb-3 text-[13px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">1 · Who</h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {project?.team.map(({ user, is_head }) => (
                <li key={user.id}>
                  <button
                    type="button"
                    aria-pressed={host?.id === user.id}
                    onClick={() => setHost(user)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                      host?.id === user.id ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)]' : 'border-[var(--tm-border)] bg-[var(--tm-card)] hover:bg-[var(--tm-card-muted)]'
                    }`}
                  >
                    <Avatar name={user.name} src={user.avatar_url ?? undefined} size="md" />
                    <span className="min-w-0">
                      <span className="block truncate text-[14px] font-bold text-[var(--tm-ink)]">{user.name}</span>
                      {is_head && <HeadBadge />}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {project && project.team.length === 0 && <p className="text-[13px] text-[var(--tm-ink-muted)]">No one has been assigned to this project yet.</p>}
          </section>

          {host && (
            <Card>
              <CardContent className="space-y-5 pt-6">
                <h2 className="text-[13px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">2 · When · {host.name}</h2>
                <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
                  <Input label="Day" type="date" min={todayStr()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
                  <Select label="Length" value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))} options={DURATIONS.map((d) => ({ value: String(d), label: `${d} minutes` }))} />
                </div>

                {loadingSlots && !avail ? (
                  <p className="text-[13px] text-[var(--tm-ink-muted)]">Looking for free times…</p>
                ) : avail && avail.slots.length === 0 ? (
                  <p className="rounded-xl bg-[var(--tm-card-muted)] p-4 text-[13.5px] text-[var(--tm-ink-soft)]">{avail.note ?? 'No free times that day.'} Try another day.</p>
                ) : (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Free times">
                    {avail?.slots.map((s) => (
                      <Button key={s.start} variant="outline" size="sm" onClick={() => open(s)}>
                        {time(s.start)}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <Modal isOpen={!!slot} onClose={() => setSlot(null)} title="Book this time" description={slot && host ? `${host.name} · ${time(slot.start)} to ${time(slot.end)}` : undefined} maxWidth="md">
        <form onSubmit={book} className="space-y-4">
          <Input label="Title" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} autoFocus />
          <div>
            <label htmlFor="meeting-note" className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">
              What would you like to talk about? (optional)
            </label>
            <textarea
              id="meeting-note"
              value={note}
              rows={3}
              maxLength={2000}
              onChange={(e) => setNote(e.target.value)}
              className="w-full resize-y rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 text-[14px] text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={() => setSlot(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!title.trim()}>
              Book meeting
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
