import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CalendarOff } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FadeIn } from '../../../components/ui/FadeIn';
import { socket } from '../../../services/socket';
import { leaveApi, type LeaveRequest } from '../../../services/http/leaveApi';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { MyLeaveRequests } from '../components/MyLeaveRequests';
import { datesText, daysIn, effectiveEnd, isTaken, marksByDay, type Selection } from '../leaveUtils';

/** Employee: pick days on the calendar, continue to the form, and follow the requests below. */
export const LeaveRequestsPage: React.FC = () => {
  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>({ start: null, end: null });
  const [formOpen, setFormOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const calendar = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    leaveApi
      .mine()
      .then((list) => {
        setRequests(list);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your requests'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // An admin's decision shows up here without a refresh.
    return socket.on('notification', (n: { type?: string }) => n?.type === 'leave_decision' && load());
  }, [load]);

  const end = effectiveEnd(selection);
  const picked = !!selection.start && !!end;
  const marks = marksByDay(requests);
  const conflict = picked && daysIn(selection).some((d) => isTaken(marks.get(d)));

  const requestLeave = () => {
    if (picked && !conflict) return setFormOpen(true);
    setHint(true);
    calendar.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  };

  return (
    <FadeIn>
      <PageHeader
        title="Leave"
        description="Ask for leave or to work from home. The admin you choose approves it."
        actions={
          <Button onClick={requestLeave} leftIcon={<CalendarOff className="h-4 w-4" />}>
            Request leave
          </Button>
        }
      />

      <div className="mt-6 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Pick your dates</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={calendar}>
              <LeaveCalendar
                requests={requests}
                value={selection}
                onChange={(next) => {
                  setSelection(next);
                  setHint(false);
                }}
              />
            </div>

            {picked ? (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3">
                <div className="text-[13px]">
                  <span className="font-bold text-[var(--tm-ink)]">{datesText({ start_date: selection.start!, end_date: end!, duration: 'full' })}</span>
                  <span className="ml-2 text-[var(--tm-ink-muted)]">
                    {conflict ? 'Some of these days already have a request.' : selection.end ? 'Click another day to start again.' : 'Click a later day to make it a range.'}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelection({ start: null, end: null })}>
                    Clear
                  </Button>
                  <Button size="sm" disabled={conflict} onClick={() => setFormOpen(true)}>
                    Continue
                  </Button>
                </div>
              </div>
            ) : (
              <p className={`mt-5 text-[12.5px] ${hint ? 'font-semibold text-[var(--tm-warning)]' : 'text-[var(--tm-ink-muted)]'}`} role={hint ? 'alert' : undefined}>
                {hint ? 'Pick your dates on the calendar first.' : 'Click the first day, then the last day. For one day, click it once.'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>My requests</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <div className="tm-error mb-3 px-4 py-3 text-xs font-semibold">{error}</div>}
            <MyLeaveRequests requests={requests} loading={loading} onChanged={load} />
          </CardContent>
        </Card>
      </div>

      {picked && (
        <LeaveRequestModal
          isOpen={formOpen}
          onClose={() => setFormOpen(false)}
          start={selection.start!}
          end={end!}
          onSent={() => {
            setSelection({ start: null, end: null });
            load();
          }}
        />
      )}
    </FadeIn>
  );
};
