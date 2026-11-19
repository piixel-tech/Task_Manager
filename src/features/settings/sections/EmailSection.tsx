import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { Link2, Mail, Send } from 'lucide-react';
import { FadeIn } from '../../../components/ui/FadeIn';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { useConfirm } from '../../../hooks/useConfirm';
import { emailApi, type EmailLogRow, type EmailStatus } from '../../../services/http/emailApi';
import { toast } from '../../../store/useToastStore';

const RESULT_TOASTS: Record<string, { tone: 'success' | 'error'; title: string }> = {
  connected: { tone: 'success', title: 'Sender mailbox connected' },
  denied: { tone: 'error', title: 'Mailbox was not connected' },
  error: { tone: 'error', title: 'Could not connect the mailbox' }
};

const LOG_TONE = { sent: 'ok', failed: 'bad', queued: 'warn' } as const;

/** Settings > Email (admin only): the mailbox every email is sent from, a test button, and the log of what was sent. */
export const EmailSection: React.FC = () => {
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<EmailStatus | null>(null);
  const [rows, setRows] = useState<EmailLogRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const timers = useRef<number[]>([]);

  const load = useCallback(async () => {
    try {
      const [s, l] = await Promise.all([emailApi.status(), emailApi.log()]);
      setStatus(s);
      setRows(l.items);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the email settings');
    }
  }, []);

  useEffect(() => {
    void load();
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, [load]);

  // Google sends the browser back here with ?result=connected|denied|error.
  useEffect(() => {
    const result = params.get('result');
    if (!result) return;
    const t = RESULT_TOASTS[result] ?? RESULT_TOASTS.error;
    toast[t.tone](t.title, params.get('message') ?? undefined);
    setParams({}, { replace: true });
    void load();
  }, [params, setParams, load]);

  const connect = async () => {
    let url = '';
    const ok = await confirm({
      title: status?.sender ? 'Connect a different mailbox?' : 'Connect the sender mailbox?',
      message: 'You will go to Google to allow Task Manager to send email from the mailbox you pick, then come straight back here. It can only send, never read.',
      confirmLabel: 'Continue to Google',
      action: async () => {
        url = await emailApi.connect();
      }
    });
    if (ok && url) window.location.assign(url);
  };

  const disconnect = () =>
    confirm({
      title: 'Disconnect the sender mailbox?',
      message: 'Task Manager stops sending email until a mailbox is connected again. Everything else keeps working.',
      confirmLabel: 'Disconnect',
      danger: true,
      action: async () => {
        await emailApi.disconnect();
        await load();
      },
      successTitle: 'Mailbox disconnected'
    });

  const test = async () => {
    setSending(true);
    try {
      await emailApi.sendTest();
      toast.success('Test email on its way', 'It goes to your own address. The log below shows how it went.');
      await load();
      // It is sent in the background: look again shortly.
      timers.current.push(window.setTimeout(() => void load(), 3000), window.setTimeout(() => void load(), 10000));
    } catch (err) {
      toast.error('Could not send the test email', err instanceof Error ? err.message : undefined);
    } finally {
      setSending(false);
    }
  };

  if (error) return <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>;
  if (!status || !rows) return <SkeletonRows count={3} />;
  const sender = status.sender;

  return (
    <FadeIn className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[var(--tm-radius-sm)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
                <Mail className="h-5 w-5" />
              </span>
              <div>
                <CardTitle>Sender mailbox</CardTitle>
                <CardDescription>Emails are sent as "Task Manager" from one Google mailbox, through the Gmail API.</CardDescription>
              </div>
            </div>
            {sender && (
              <StatusChip tone={sender.status === 'connected' ? 'ok' : 'bad'} dot>
                {sender.status === 'connected' ? 'Connected' : 'Needs reconnecting'}
              </StatusChip>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {sender && (
            <dl className="text-[13px]">
              <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Sending from</dt>
              <dd className="mt-0.5 break-all font-semibold text-[var(--tm-ink)]">{sender.address}</dd>
            </dl>
          )}
          {!status.configured && (
            <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-[13px] text-[var(--tm-ink-muted)]">
              {status.setup_problem}. Add it to the backend's environment, then reload.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={connect} disabled={!status.configured} variant={sender ? 'outline' : 'primary'}>
              <Link2 className="mr-2 h-4 w-4" />
              {sender ? 'Reconnect mailbox' : 'Connect sender mailbox'}
            </Button>
            {sender && (
              <>
                <Button variant="outline" onClick={test} isLoading={sending} leftIcon={<Send className="h-4 w-4" />}>
                  Send test email
                </Button>
                <Button variant="outline" onClick={disconnect}>
                  Disconnect
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Email log</CardTitle>
          <CardDescription>The last 50 emails: who they went to, what for, and whether they were delivered.</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-[13px] text-[var(--tm-ink-muted)]">Nothing has been sent yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--tm-border)]">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3 text-[13px]">
                  <div className="min-w-0 flex-1">
                    <p className="break-all font-semibold text-[var(--tm-ink)]">{r.to}</p>
                    <p className="text-[12px] text-[var(--tm-ink-muted)]">
                      {r.type} · {r.subject} · {format(parseISO(r.created_at), 'd MMM, HH:mm')}
                    </p>
                    {r.error && <p className="mt-0.5 text-[12px] text-[var(--tm-danger,#b3261e)]">{r.error}</p>}
                  </div>
                  <StatusChip tone={LOG_TONE[r.status]} size="sm" dot>
                    {r.status === 'sent' ? 'Sent' : r.status === 'failed' ? 'Failed' : 'Sending'}
                    {r.attempts > 1 ? ` · ${r.attempts} tries` : ''}
                  </StatusChip>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </FadeIn>
  );
};
