import { startOfWeek } from 'date-fns';
import type { Review } from '../../services/http/reviewApi';

/** A pending review is "waiting 2+ days" from this age. */
export const LATE_DAYS = 2;

/** Whole days since the review was submitted. */
export const ageDays = (r: Pick<Review, 'created_at'>, now: Date = new Date()): number =>
  Math.max(0, Math.floor((now.getTime() - new Date(r.created_at).getTime()) / 86_400_000));

export const isLate = (r: Review, now: Date = new Date()): boolean => r.decision === 'pending' && ageDays(r, now) >= LATE_DAYS;

/** Decisions made since Monday. */
export const decidedThisWeek = (rs: Review[], now: Date = new Date()): Review[] => {
  const from = startOfWeek(now, { weekStartsOn: 1 }).getTime();
  return rs.filter((r) => r.decision !== 'pending' && !!r.decided_at && new Date(r.decided_at).getTime() >= from);
};

export interface ToReviewStats {
  waiting: number;
  late: number;
  resubmissions: number;
  decidedWeek: number;
}

export function toReviewStats(rs: Review[], now: Date = new Date()): ToReviewStats {
  const pending = rs.filter((r) => r.decision === 'pending');
  return {
    waiting: pending.filter((r) => r.can_decide).length,
    late: pending.filter((r) => isLate(r, now)).length,
    resubmissions: pending.filter((r) => r.round > 1).length,
    decidedWeek: decidedThisWeek(rs, now).length
  };
}

/** Pending reviews split into the two groups of the To review list (oldest first inside each). */
export function groupPending(pending: Review[], now: Date = new Date()): { late: Review[]; fresh: Review[] } {
  const sorted = [...pending].sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { late: sorted.filter((r) => isLate(r, now)), fresh: sorted.filter((r) => !isLate(r, now)) };
}

/** The newest round of each task (rounds of one task come oldest first). */
export const latestRounds = (perTask: Review[][]): Review[] => perTask.filter((rounds) => rounds.length > 0).map((rounds) => rounds[rounds.length - 1]);

export interface SubmissionStats {
  changes: number;
  waiting: number;
  submitted: number;
  approvedMonth: number;
}

const sameMonth = (iso: string | null, now: Date) => !!iso && new Date(iso).getFullYear() === now.getFullYear() && new Date(iso).getMonth() === now.getMonth();

/** `latest`: the newest round of each of my tasks; `all`: every round I submitted. */
export function submissionStats(latest: Review[], all: Review[], now: Date = new Date()): SubmissionStats {
  return {
    changes: latest.filter((r) => r.decision === 'changes_requested').length,
    waiting: latest.filter((r) => r.decision === 'pending').length,
    submitted: all.filter((r) => sameMonth(r.created_at, now)).length,
    approvedMonth: all.filter((r) => r.decision === 'approved' && sameMonth(r.decided_at, now)).length
  };
}
