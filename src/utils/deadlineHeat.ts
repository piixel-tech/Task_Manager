export interface Heat {
  level: 'amber' | 'red';
  /** 0..1: how strong the tint is. */
  strength: number;
}

/** Whole days from today to a YYYY-MM-DD date (negative = past). Local dates, so no timezone drift. */
function daysUntil(due: string, now: Date): number {
  const [y, m, d] = due.slice(0, 10).split('-').map(Number);
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((new Date(y, m - 1, d).getTime() - start) / 86_400_000);
}

/**
 * How hot a deadline is: nothing beyond 3 days, amber (stronger each day) for 3 to 1 days out,
 * red when it is due today (under 24 hours) or overdue. Pass `open: false` for finished work.
 */
export function deadlineHeat(due: string | null | undefined, open: boolean, now = new Date()): Heat | null {
  if (!open || !due) return null;
  const days = daysUntil(due, now);
  if (Number.isNaN(days) || days > 3) return null;
  if (days <= 0) return { level: 'red', strength: 1 };
  return { level: 'amber', strength: 0.35 + 0.65 * ((3 - days) / 2) };
}

/** Attributes for an element that should carry the tint (spread onto a div or button). */
export function heatAttrs(heat: Heat | null): { className?: string; 'data-heat'?: string; style?: React.CSSProperties } {
  return heat ? { className: 'tm-heat', 'data-heat': heat.level, style: { ['--heat' as string]: heat.strength } as React.CSSProperties } : {};
}
