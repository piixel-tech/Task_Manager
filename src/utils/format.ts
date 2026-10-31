export function formatLoginId(name: string, company: string, jobTitle: string): string {
  const sanitize = (str: string) =>
    str
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-');

  return `${sanitize(name)}-${sanitize(company)}@${sanitize(jobTitle)}`;
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function formatCompanyBadge(company: 'piixel' | 'unwork' | 'both'): { text: string; bg: string; textCol: string; border: string } {
  if (company === 'piixel') {
    return {
      text: 'Piixel',
      bg: 'bg-[var(--tm-primary-soft)]',
      textCol: 'text-[var(--tm-primary-dark)]',
      border: 'border-[var(--tm-border-strong)]'
    };
  }
  if (company === 'unwork') {
    return {
      text: 'Unwork',
      bg: 'bg-[var(--tm-warning-bg)]',
      textCol: 'text-[var(--tm-warning)]',
      border: 'border-[var(--tm-warning-ring)]'
    };
  }
  return {
    text: 'Piixel & Unwork',
    bg: 'bg-[var(--tm-success-bg)]',
    textCol: 'text-[var(--tm-success)]',
    border: 'border-[var(--tm-success-ring)]'
  };
}

/** 3725 -> "1h 02m", 95 -> "1m 35s", 40 -> "40s". */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}
