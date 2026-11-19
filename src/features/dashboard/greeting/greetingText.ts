import type { GreetingPrefs } from '../../../services/http/accountApi';

/** Friendly openers; one is picked per day when "rotate" is on. */
export const ROTATING_OPENERS = ['Welcome back', 'Hey', "Let's go", 'Hi there', 'Good to see you', 'Ready to roll'] as const;

/** Day of the year (1-366) for a local date, so the opener changes at midnight and is the same all day. */
export function dayOfYear(d: Date): number {
  return Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000);
}

/** The time-of-day opener: morning, afternoon, evening, and a late-night line from 9 pm to 5 am. */
export function timeOpener(hour: number): { text: string; lateNight: boolean } {
  if (hour >= 21 || hour < 5) return { text: 'Burning the midnight oil', lateNight: true };
  if (hour < 12) return { text: 'Good morning', lateNight: false };
  if (hour < 17) return { text: 'Good afternoon', lateNight: false };
  return { text: 'Good evening', lateNight: false };
}

export interface GreetingInput {
  /** The name to greet ("Boss" for the admin, otherwise their real name). */
  defaultName: string;
  prefs: GreetingPrefs;
  now: Date;
}

/** The title line: time of day (or the daily opener when switched on) and the name. The late-night line is never replaced by the rotation. */
export function greetingTitle({ defaultName, prefs, now }: GreetingInput): string {
  const { text, lateNight } = timeOpener(now.getHours());
  const opener = prefs.rotate && !lateNight ? ROTATING_OPENERS[dayOfYear(now) % ROTATING_OPENERS.length] : text;
  return defaultName ? `${opener}, ${defaultName}` : opener;
}

export interface CelebrationLite {
  user_id?: string;
  name?: string;
  avatar_url?: string | null;
  kind: 'birthday' | 'milestone';
  label: string;
  months: number | null;
  duration?: string | null;
  company?: string | null;
}

export interface TitleContext extends GreetingInput {
  /** My own birthday / work milestone today, if any. */
  mine?: CelebrationLite[];
  /** Other people's birthdays / milestones today (not mine). */
  others?: CelebrationLite[];
  /** Festival greetings for today. */
  festivals?: { name?: string; message: string }[];
}

export type HeadingKind = 'own' | 'others' | 'festival' | 'normal';

export interface Heading {
  text: string;
  kind: HeadingKind;
  /** 'others': who is being celebrated (for the avatars and "Send wishes"). */
  people: CelebrationLite[];
  /** 'festival': its name, for the themed animation. */
  festival?: string;
  /** 'own': what is being celebrated, for the animation. */
  own?: 'birthday' | 'milestone';
}

const firstName = (name = ''): string => name.trim().split(/\s+/)[0] ?? '';
const andList = (xs: string[]): string => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const where = (c: CelebrationLite) => (c.company ? `at ${c.company}` : 'on the team');

/** The heading for my own celebration: "Happy birthday, Kanisha!" / "Happy 1 year at Piixel, Kanisha!". */
export function ownHeading(c: CelebrationLite, name: string): string {
  const to = name ? `, ${name}` : '';
  return c.kind === 'birthday' ? `Happy birthday${to}!` : `Happy ${c.duration ?? c.label} ${where(c)}${to}!`;
}

/**
 * The heading when other people are celebrating, all in one line:
 * "Today is Kanisha's birthday", "Today is Kanisha's and Sam's birthdays", "Kanisha completes 1 year at Piixel today",
 * and both kinds together joined with a dot.
 */
export function othersHeading(people: CelebrationLite[]): string {
  const born = people.filter((c) => c.kind === 'birthday');
  const work = people.filter((c) => c.kind === 'milestone');
  const parts: string[] = [];
  if (born.length) parts.push(`Today is ${andList(born.map((c) => `${firstName(c.name)}'s`))} birthday${born.length > 1 ? 's' : ''}`);
  if (work.length) {
    const same = work.every((c) => c.duration === work[0].duration && c.company === work[0].company);
    parts.push(
      same
        ? `${andList(work.map((c) => firstName(c.name)))} ${work.length > 1 ? 'complete' : 'completes'} ${work[0].duration ?? work[0].label} ${where(work[0])} today`
        : `${work.map((c) => `${firstName(c.name)} completes ${c.duration ?? c.label} ${where(c)}`).join(', ')} today`
    );
  }
  return parts.join(' \u00b7 ');
}

/**
 * The dashboard heading. In order: my own birthday or work milestone, then somebody else's, then a festival greeting, then the
 * normal greeting (time of day, or the daily opener).
 */
export function dashboardHeading(ctx: TitleContext): Heading {
  const name = ctx.defaultName;
  const mine = ctx.mine ?? [];
  const own = mine.find((c) => c.kind === 'birthday') ?? [...mine].sort((a, b) => (b.months ?? 0) - (a.months ?? 0))[0];
  if (own) return { text: ownHeading(own, name), kind: 'own', people: [], own: own.kind };
  const others = ctx.others ?? [];
  if (others.length) return { text: othersHeading(others), kind: 'others', people: others };
  const festival = ctx.festivals?.find((f) => f.message.trim());
  if (festival) return { text: festival.message.trim(), kind: 'festival', people: [], festival: festival.name };
  return { text: greetingTitle(ctx), kind: 'normal', people: [] };
}

/**
 * How much smaller than the page title size a heading is drawn, so a long celebration line scales down instead of breaking:
 * up to 26 characters full size, then 0.86, 0.72 and 0.62 of it. (It also wraps onto a second line when it still does not fit.)
 */
export function headingScale(text: string): number {
  const n = text.length;
  return n <= 26 ? 1 : n <= 38 ? 0.86 : n <= 52 ? 0.72 : 0.62;
}

/** Just the heading text. */
export const dashboardTitle = (ctx: TitleContext): string => dashboardHeading(ctx).text;

export interface DayContext {
  /** Open tasks due before today / today. */
  overdue: number;
  dueToday: number;
  /** Today is the first working day after an approved leave ended. */
  backFromLeave: boolean;
  now: Date;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The line under the title, from how the day looks. Most pressing first. */
export function greetingSubtitle({ overdue, dueToday, backFromLeave, now }: DayContext): string {
  if (backFromLeave) return 'Welcome back from leave. Take it easy, catch up at your own pace.';
  if (overdue > 0) return `${plural(overdue, 'task is', 'tasks are')} overdue${dueToday > 0 ? `, and ${dueToday} due today` : ''}. Start there.`;
  if (dueToday > 0) return `${plural(dueToday, 'task is', 'tasks are')} due today.`;
  const day = now.getDay();
  if (day === 5) return 'Nothing due today. Happy Friday, finish the week strong.';
  if (day === 1) return 'Nothing due today. A calm start to the week.';
  return 'Nothing due today. A good day to get ahead.';
}

/** Previous Mon-Fri before `ymd` (YYYY-MM-DD). Holidays are not considered. */
export function previousWorkday(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  do {
    dt.setDate(dt.getDate() - 1);
  } while (dt.getDay() === 0 || dt.getDay() === 6);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export interface LeaveSpan {
  type: string;
  status: string;
  start_date: string;
  end_date: string;
}

/** True on the first working day after an approved leave (not work-from-home), when today is not itself a leave day. */
export function isFirstDayBack(leaves: LeaveSpan[], today: string): boolean {
  const real = leaves.filter((l) => l.type === 'leave' && l.status === 'approved');
  if (real.some((l) => l.start_date <= today && today <= l.end_date)) return false;
  const prev = previousWorkday(today);
  return real.some((l) => l.end_date >= prev && l.end_date < today);
}
