import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { differenceInDays, parseISO } from 'date-fns';
import { PartyPopper, XCircle } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { useAuthStore } from '../../../store/authStore';
import { socket } from '../../../services/socket';
import { leaveApi, type LeaveRequest } from '../../../services/http/leaveApi';
import { Confetti } from '../../calendar/components/BookingConfirmedModal';
import { datesText } from '../leaveUtils';

const RECENT_DAYS = 7;
const KEY = (userId: string) => `tm.leave.seen.${userId}`;

const readSeen = (userId: string): string[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(userId)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
};
const writeSeen = (userId: string, ids: string[]) => {
  try {
    localStorage.setItem(KEY(userId), JSON.stringify(ids.slice(-100)));
  } catch {
    /* storage unavailable: the popup may show again next time, nothing else breaks */
  }
};

/** The decided requests this person has not been told about yet (decided in the last week). */
export const unseenDecisions = (requests: LeaveRequest[], seen: string[], now = Date.now()): LeaveRequest[] =>
  requests
    .filter((r) => r.status !== 'pending' && r.decided_at && !seen.includes(r.id) && differenceInDays(now, parseISO(r.decided_at)) < RECENT_DAYS)
    .sort((a, b) => Date.parse(a.decided_at!) - Date.parse(b.decided_at!));

const kindOf = (r: LeaveRequest) => (r.type === 'wfh' ? 'Work from home' : 'leave');

/** One popup for one decision: confetti when approved, the admin's reason when rejected. */
export const LeaveDecisionDialog: React.FC<{ request: LeaveRequest | null; onClose: () => void }> = ({ request, onClose }) => {
  const { reduced } = useMotionPrefs();
  if (!request) return null;
  const approved = request.status === 'approved';
  return (
    <>
    {/* Its own overlay, so the flying pieces never make the dialog scroll */}
    {approved && !reduced && createPortal(<div aria-hidden className="pointer-events-none fixed inset-0 z-[200] overflow-hidden"><Confetti /></div>, document.body)}
    <Modal isOpen onClose={onClose} maxWidth="sm" hideClose>
      <div className="flex flex-col items-center pt-5 text-center">
        <span
          className={`grid h-14 w-14 place-items-center rounded-full ${approved ? 'bg-[var(--tm-success-bg)] text-[var(--tm-success)]' : 'bg-[var(--tm-danger-bg)] text-[var(--tm-danger)]'}`}
        >
          {approved ? <PartyPopper className="h-7 w-7" /> : <XCircle className="h-7 w-7" />}
        </span>
        <h3 className="mt-4 text-[18px] font-extrabold text-[var(--tm-ink)]">
          {approved ? (request.type === 'wfh' ? 'Work from home approved 🎉' : 'Yay! Your leave is approved 🎉') : 'Your request was rejected'}
        </h3>
        <p className="mt-1.5 text-[14px] font-semibold text-[var(--tm-ink-soft)]">
          {kindOf(request) === 'leave' ? 'Leave' : 'Work from home'} · {datesText(request)}
        </p>
        {approved ? (
          request.decided_by && <p className="mt-1 text-[12.5px] text-[var(--tm-ink-muted)]">Approved by {request.decided_by.name}</p>
        ) : (
          <div className="tm-error mt-3 w-full px-4 py-3 text-left text-[13px]">
            <span className="block text-[11px] font-bold uppercase tracking-wide">Reason from {request.decided_by?.name ?? 'your admin'}</span>
            <span className="mt-0.5 block font-semibold">{request.reject_reason ?? 'No reason was given.'}</span>
          </div>
        )}
        <Button className="mt-6 w-full" onClick={onClose}>
          {approved ? 'Thanks!' : 'Got it'}
        </Button>
      </div>
    </Modal>
    </>
  );
};

/**
 * Tells an employee about a decision on their request: now, when it arrives while the app is open, and the next time they open
 * the app if it was decided while they were away. Each decision is shown once (remembered in this browser).
 */
export const LeaveDecisionHost: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const [queue, setQueue] = useState<LeaveRequest[]>([]);
  const userId = user?.role === 'employee' ? user.id : null;

  const check = useCallback(() => {
    if (!userId) return;
    leaveApi
      .mine()
      .then((all) => {
        const seen = readSeen(userId);
        setQueue((q) => {
          const queued = new Set(q.map((r) => r.id));
          const fresh = unseenDecisions(all, seen).filter((r) => !queued.has(r.id));
          return fresh.length ? [...q, ...fresh] : q;
        });
      })
      .catch(() => undefined); // a popup is a nicety: never get in the way
  }, [userId]);

  useEffect(() => {
    check();
    if (!userId) return;
    return socket.on('notification', (n: { type?: string }) => n?.type === 'leave_decision' && check());
  }, [check, userId]);

  const current = queue[0] ?? null;
  const close = () => {
    if (!current || !userId) return;
    writeSeen(userId, [...readSeen(userId), current.id]);
    setQueue((q) => q.slice(1));
  };

  return <LeaveDecisionDialog request={current} onClose={close} />;
};
