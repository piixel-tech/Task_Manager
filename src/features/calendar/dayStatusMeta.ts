import { CheckCircle2, Clock, Home, PartyPopper, Plane, type LucideIcon } from 'lucide-react';
import type { DayStatus } from '../status/statusMeta';

/** The kinds of day the calendar shows. */
export type DayKind = DayStatus | 'holiday' | 'weekend';

export interface DayKindMeta {
  kind: DayKind;
  /** Short label in pills, legend and group lines. Holidays show the holiday's own name instead; weekends have none. */
  label: string;
  /** Longer name for the day popover. */
  long: string;
  icon: LucideIcon;
  /** Fixed colours (src/styles/effects.css), the same in every theme, light and dark. Never colour alone: each also has an icon and a label. */
  color: string;
  tint: string;
}

const meta = (kind: DayKind, label: string, long: string, icon: LucideIcon): DayKindMeta => ({
  kind,
  label,
  long,
  icon,
  color: `var(--st-${kind})`,
  tint: `color-mix(in srgb, var(--st-${kind}) 14%, var(--tm-card))`
});

export const KIND_META: Record<DayKind, DayKindMeta> = {
  present: meta('present', 'Office', 'In the office', CheckCircle2),
  wfh: meta('wfh', 'WFH', 'Working from home', Home),
  half_day: meta('half_day', 'Half day', 'Half day', Clock),
  leave: meta('leave', 'Leave', 'On leave', Plane),
  holiday: meta('holiday', 'Holiday', 'Holiday', PartyPopper),
  weekend: meta('weekend', 'Weekend', 'Weekly off', Clock)
};

/** Person statuses in the order they are listed. */
export const PERSON_KINDS: DayStatus[] = ['present', 'wfh', 'half_day', 'leave'];

/** The legend, in order. */
export const LEGEND_KINDS: DayKind[] = ['present', 'wfh', 'half_day', 'leave', 'holiday', 'weekend'];
