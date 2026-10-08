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
      bg: 'bg-indigo-50',
      textCol: 'text-indigo-700',
      border: 'border-indigo-200'
    };
  }
  if (company === 'unwork') {
    return {
      text: 'Unwork',
      bg: 'bg-amber-50',
      textCol: 'text-amber-700',
      border: 'border-amber-200'
    };
  }
  return {
    text: 'Piixel & Unwork',
    bg: 'bg-emerald-50',
    textCol: 'text-emerald-700',
    border: 'border-emerald-200'
  };
}
