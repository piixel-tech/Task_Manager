import { format, parseISO, differenceInMinutes, differenceInSeconds, isValid, getDaysInMonth, startOfMonth, getDay, endOfWeek } from 'date-fns';

export function getSimulatedDate(): string | null {
  return localStorage.getItem('tm_simulated_date');
}

export function setSimulatedDate(dateStr: string | null): void {
  if (!dateStr) {
    localStorage.removeItem('tm_simulated_date');
  } else {
    localStorage.setItem('tm_simulated_date', dateStr);
  }
}

export function getTodayDateString(): string {
  const sim = getSimulatedDate();
  if (sim) return sim;
  return format(new Date(), 'yyyy-MM-dd');
}

export function getNowISO(): string {
  const simDate = getSimulatedDate();
  const now = new Date();
  if (simDate) {
    const [y, m, d] = simDate.split('-').map(Number);
    const dateObj = new Date(now);
    dateObj.setFullYear(y, m - 1, d);
    return dateObj.toISOString();
  }
  return now.toISOString();
}

export function formatDate(dateString?: string, formatStr: string = 'MMM dd, yyyy'): string {
  if (!dateString) return 'N/A';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return dateString;
    return format(date, formatStr);
  } catch {
    return dateString;
  }
}

export function formatTime(dateString?: string): string {
  if (!dateString) return '--:--';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return dateString;
    return format(date, 'hh:mm a');
  } catch {
    return dateString;
  }
}

/** Compact relative time for notification rows: "now", "5m", "3h", "2d". */
export function formatTimeAgo(dateString?: string): string {
  if (!dateString) return '';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '';
    const seconds = Math.max(0, differenceInSeconds(new Date(), date));
    if (seconds < 60) return 'now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    return format(date, 'MMM dd');
  } catch {
    return '';
  }
}

export function calculateDurationMinutes(startTimeISO: string, endTimeISO?: string): number {
  try {
    const start = parseISO(startTimeISO);
    const end = endTimeISO ? parseISO(endTimeISO) : parseISO(getNowISO());
    if (!isValid(start) || !isValid(end)) return 0;
    return Math.max(0, differenceInMinutes(end, start));
  } catch {
    return 0;
  }
}

export function calculateDurationSeconds(startTimeISO: string, endTimeISO?: string): number {
  try {
    const start = parseISO(startTimeISO);
    const end = endTimeISO ? parseISO(endTimeISO) : parseISO(getNowISO());
    if (!isValid(start) || !isValid(end)) return 0;
    return Math.max(0, differenceInSeconds(end, start));
  } catch {
    return 0;
  }
}

export function isDueThisWeek(dueDateStr?: string, weekStartsOn: 0 | 1 | 6 = 1): boolean {
  if (!dueDateStr) return false;
  try {
    const todayStr = getTodayDateString(); // e.g. '2026-10-09'
    const todayDate = parseISO(`${todayStr}T00:00:00`);
    const weekEnd = endOfWeek(todayDate, { weekStartsOn });
    const weekEndStr = format(weekEnd, 'yyyy-MM-dd');

    const taskDateStr = dueDateStr.slice(0, 10);
    return taskDateStr >= todayStr && taskDateStr <= weekEndStr;
  } catch {
    return false;
  }
}

export function getMonthInfo(year: number, monthIndex: number) {
  const date = new Date(year, monthIndex, 1);
  const totalDays = getDaysInMonth(date);
  const startDayOfWeek = getDay(startOfMonth(date)); // 0 = Sun, 1 = Mon...
  return { totalDays, startDayOfWeek };
}

