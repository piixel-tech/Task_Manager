/** Items per day for the last `days` days (oldest first), from dates already on the page. */
export function dailyCounts<T>(items: T[], getDate: (item: T) => string | null | undefined, days = 14): number[] {
  const out = new Array<number>(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const item of items) {
    const raw = getDate(item);
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const ago = Math.round((today.getTime() - d.getTime()) / 86_400_000);
    if (ago >= 0 && ago < days) out[days - 1 - ago] += 1;
  }
  return out;
}

/** A KPI's chart series (the last week) and the % change of the last week against the week before; no delta when there is nothing to compare. */
export function weekTrend(series: number[]): { trend: number[]; delta: number | undefined } {
  const half = Math.floor(series.length / 2);
  const prev = series.slice(0, half).reduce((a, b) => a + b, 0);
  const now = series.slice(half).reduce((a, b) => a + b, 0);
  return { trend: series.slice(half), delta: prev === 0 ? undefined : Math.round(((now - prev) / prev) * 100) };
}

/** Items per day for the next `days` days starting today (e.g. what falls due this week). */
export function upcomingCounts<T>(items: T[], getDate: (item: T) => string | null | undefined, days = 7): number[] {
  const out = new Array<number>(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const item of items) {
    const raw = getDate(item);
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    d.setHours(0, 0, 0, 0);
    const ahead = Math.round((d.getTime() - today.getTime()) / 86_400_000);
    if (ahead >= 0 && ahead < days) out[ahead] += 1;
  }
  return out;
}
