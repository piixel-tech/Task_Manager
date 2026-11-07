import { FadeIn } from '../../../components/ui/FadeIn';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { CalendarDays, Link2, RefreshCw, Unplug } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Select } from '../../../components/ui/Select';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useConfirm } from '../../../hooks/useConfirm';
import { integrationApi, type ConnectedApp } from '../../../services/http/integrationApi';
import { toast } from '../../../store/useToastStore';

const RESULT_TOASTS: Record<string, { tone: 'success' | 'error' | 'info'; title: string }> = {
  connected: { tone: 'success', title: 'Google connected' },
  // Connected, but part of what we asked for was left unticked on Google's screen.
  partial: { tone: 'info', title: 'Google connected, with limits' },
  denied: { tone: 'error', title: 'Google was not connected' },
  error: { tone: 'error', title: 'Could not connect Google' }
};

/** Settings > Connected apps. Each app in the backend's registry gets a card; today that is Google (Calendar, Meet, Drive, Docs & Sheets). */
export const ConnectedAppsSection: React.FC = () => {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [apps, setApps] = useState<ConnectedApp[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setApps(await integrationApi.list());
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load your connected apps');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Google sends the browser back here with ?app=google&result=connected|denied|error.
  useEffect(() => {
    const result = params.get('result');
    if (!result) return;
    const t = RESULT_TOASTS[result] ?? RESULT_TOASTS.error;
    toast[t.tone](t.title, params.get('message') ?? undefined);
    setParams({}, { replace: true });
    void load();
  }, [params, setParams, load]);

  if (loadError) {
    return <div className="tm-error px-4 py-3 text-xs font-semibold">{loadError}</div>;
  }
  if (!apps) return <SkeletonRows count={3} />;

  return (
    <FadeIn>
      {apps.map((app) => (
        <AppCard key={app.key} app={app} confirm={confirm} onChange={load} />
      ))}
    </FadeIn>
  );
};

const AppCard: React.FC<{ app: ConnectedApp; confirm: ReturnType<typeof useConfirm>; onChange: () => Promise<void> }> = ({
  app,
  confirm,
  onChange
}) => {
  const conn = app.connection;
  const [selected, setSelected] = useState<string[]>([]);
  const [writeTo, setWriteTo] = useState('');
  const [syncing, setSyncing] = useState(false);

  // Follow the saved choices whenever they are (re)loaded.
  useEffect(() => {
    setSelected(conn?.config.calendars.filter((c) => c.selected).map((c) => c.id) ?? []);
    setWriteTo(conn?.config.write_calendar ?? '');
  }, [conn]);

  const saved = useMemo(() => conn?.config.calendars.filter((c) => c.selected).map((c) => c.id).sort().join('|') ?? '', [conn]);
  const dirty = selected.slice().sort().join('|') !== saved || writeTo !== (conn?.config.write_calendar ?? '');

  /** One consent screen for everything: Calendar, Meet, Drive, Docs and Sheets. */
  const startConnect = async () => {
    let url = '';
    const ok = await confirm({
      title: `${conn ? 'Reconnect' : 'Connect'} to ${app.name}?`,
      message:
        'You will go to Google to approve access to Calendar, Meet, Drive, Docs and Sheets in one step, then come straight back here. Please tick every box so everything works.',
      confirmLabel: 'Continue to Google',
      action: async () => {
        url = await integrationApi.connect(app.key);
      }
    });
    if (ok && url) window.location.assign(url);
  };

  const syncNow = async () => {
    setSyncing(true);
    try {
      const after = await integrationApi.syncNow(app.key);
      await onChange();
      if (after.last_error) toast.error('Sync had a problem', after.last_error);
      else toast.success('Synced', 'Your calendar is up to date.');
    } catch (err) {
      toast.error('Sync failed', err instanceof Error ? err.message : undefined);
    } finally {
      setSyncing(false);
    }
  };

  const save = () =>
    confirm({
      title: 'Save calendar choices?',
      message: 'Events from the ticked calendars will show on your Task Manager calendar. Unticked ones are removed from it.',
      confirmLabel: 'Save',
      action: async () => {
        await integrationApi.saveConfig(app.key, { selected, write_calendar: writeTo || undefined });
        await onChange();
      },
      successTitle: 'Calendar choices saved'
    });

  const disconnect = () =>
    confirm({
      title: `Disconnect ${app.name}?`,
      message:
        'Task Manager stops syncing and Google access is revoked. Google events disappear from your Task Manager calendar. Events Task Manager already added to Google stay there.',
      confirmLabel: 'Disconnect',
      danger: true,
      action: async () => {
        const { revoked } = await integrationApi.disconnect(app.key);
        if (!revoked) toast.info('Almost done', 'Also remove Task Manager at myaccount.google.com/permissions.');
        await onChange();
      },
      successTitle: `${app.name} disconnected`
    });

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const writable = conn?.config.calendars.filter((c) => c.writable) ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-[var(--tm-radius-sm)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>{app.name}</CardTitle>
              <CardDescription>{app.description}</CardDescription>
            </div>
          </div>
          {conn && (
            <StatusChip tone={conn.status === 'connected' ? 'ok' : 'bad'} dot>
              {conn.status === 'connected' ? 'Connected' : 'Needs reconnecting'}
            </StatusChip>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {!conn && (
          <div className="space-y-3">
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-[var(--tm-ink-soft)]">
              <li>Your Google events show on your Task Manager calendar. Teammates only see “Busy”.</li>
              <li>Your bookings and task due dates are added to your Google Calendar, each booking with a Google Meet link and invites for guests.</li>
              <li>Attach files from your Drive, and create Google Docs and Sheets from tasks and subfolders.</li>
              <li>Disconnect any time. Only you can see your Google data.</li>
            </ul>
            {!app.configured && (
              <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-[13px] text-[var(--tm-ink-muted)]">
                {app.setup_problem ?? `${app.name} isn’t set up on this server yet.`} Ask an admin to add the keys to the backend’s .env.
              </p>
            )}
            <Button onClick={startConnect} disabled={!app.configured}>
              <Link2 className="mr-2 h-4 w-4" />
              Connect to {app.name}
            </Button>
          </div>
        )}

        {conn && (
          <>
            <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Account</dt>
                <dd className="mt-0.5 font-semibold text-[var(--tm-ink)]">{conn.account || 'Google account'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Last sync</dt>
                <dd className="mt-0.5 font-semibold text-[var(--tm-ink)]">
                  {conn.last_sync_at ? `${formatDistanceToNow(parseISO(conn.last_sync_at))} ago` : 'Not yet'}
                </dd>
              </div>
            </dl>

            {conn.last_error && (
              <div className="tm-error px-4 py-3 text-xs font-semibold" role="alert">
                {conn.last_error}
                {conn.last_error_at && <span className="ml-1 font-normal">({formatDistanceToNow(parseISO(conn.last_error_at))} ago)</span>}
              </div>
            )}
            {conn.config.push_error && (
              <div className="tm-warn px-4 py-3 text-xs font-semibold">
                {conn.config.push_error} Syncing still runs every few minutes.
              </div>
            )}

            {conn.status === 'connected' && (conn.config.missing?.length ?? 0) > 0 && (
              <div className="tm-warn flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs font-semibold">
                <span>
                  Reconnect to Google once to turn on {conn.config.missing.join(', ')}. Everything else keeps working until then.
                </span>
                <Button size="sm" onClick={startConnect}>
                  Reconnect to Google
                </Button>
              </div>
            )}

            {conn.status === 'connected' && (
              <section className="space-y-3">
                <h4 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Calendars to sync</h4>
                <ul className="space-y-1.5">
                  {conn.config.calendars.map((c) => (
                    <li key={c.id}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-[var(--tm-radius-md)] px-2 py-2 hover:bg-[var(--tm-bg-sunken)]">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-[var(--tm-primary)]"
                          checked={selected.includes(c.id)}
                          onChange={() => toggle(c.id)}
                        />
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.color ?? 'var(--tm-ink-muted)' }} />
                        <span className="min-w-0 truncate text-[13.5px] font-semibold text-[var(--tm-ink)]">{c.name}</span>
                        {c.primary && <span className="text-[11px] text-[var(--tm-ink-muted)]">Primary</span>}
                      </label>
                    </li>
                  ))}
                </ul>
                {writable.length > 1 && (
                  <Select
                    label="Add my bookings and task due dates to"
                    value={writeTo}
                    onChange={(e) => setWriteTo(e.target.value)}
                    options={writable.map((c) => ({ value: c.id, label: c.name }))}
                  />
                )}
                {app.extras.push_available && (
                  <p className="text-[12px] text-[var(--tm-ink-muted)]">
                    {conn.config.push_active ? 'Changes in Google arrive instantly.' : 'Instant updates will switch on at the next sync.'}
                  </p>
                )}
                <Button onClick={save} disabled={!dirty}>
                  Save choices
                </Button>
              </section>
            )}

            <div className="flex flex-wrap gap-2 border-t border-[var(--tm-border)] pt-4">
              {conn.status === 'connected' ? (
                <Button variant="outline" onClick={syncNow} disabled={syncing}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
                  {syncing ? 'Syncing…' : 'Sync now'}
                </Button>
              ) : (
                <Button onClick={startConnect}>
                  <Link2 className="mr-2 h-4 w-4" />
                  Reconnect {app.name}
                </Button>
              )}
              <Button variant="ghost" className="text-[var(--tm-danger)]" onClick={disconnect}>
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
