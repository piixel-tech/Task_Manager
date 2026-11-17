import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TreePalm } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FadeIn } from '../../../components/ui/FadeIn';
import { socket } from '../../../services/socket';
import { leaveApi, type LeaveRequest } from '../../../services/http/leaveApi';
import { LeaveCalendar } from '../components/LeaveCalendar';
import { LeaveRequestModal } from '../components/LeaveRequestModal';
import { LeaveSummary } from '../components/LeaveSummary';
import { MyLeaveRequests } from '../components/MyLeaveRequests';
import { daysIn, effectiveEnd, isTaken, marksByDay, type Selection } from '../leaveUtils';

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
  const year = String(new Date().getFullYear());
  const thisYear = requests.filter((r) => r.start_date.startsWith(year)).length;
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
        description="Ask for leave or work from home."
        actions={
          <Button onClick={requestLeave} leftIcon={<TreePalm className="h-4 w-4" />}>
            Request leave
          </Button>
        }
      />

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardContent className="pt-5">
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
          </CardContent>
        </Card>

        <LeaveSummary
          selection={selection}
          end={end}
          picked={picked}
          conflict={conflict}
          hint={hint}
          onClear={() => setSelection({ start: null, end: null })}
          onSent={() => {
            setSelection({ start: null, end: null });
            load();
          }}
        />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <div className="min-w-0">
<CardTitle>
            <span className="inline-flex flex-wrap items-center gap-3">
              My requests
              <span className="rounded-full bg-[var(--tm-primary-soft)] px-2.5 py-1 text-[11.5px] font-semibold text-[var(--tm-ink)]">
                This year · {thisYear}
              </span>
            </span>
          </CardTitle>
<CardDescription>Everything you have asked for, newest first.</CardDescription>
</div>
        </CardHeader>
        <CardContent>
          {error && <div className="tm-error mb-3 px-4 py-3 text-xs font-semibold">{error}</div>}
          <MyLeaveRequests requests={requests} loading={loading} onChanged={load} />
        </CardContent>
      </Card>

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
