import type { OfficeCategory } from '../../services/http/officeApi';

export interface CategoryMeta {
  value: OfficeCategory;
  label: string;
  emoji: string;
  /** Used for the card tint, border and emoji bubble. */
  accent: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { value: 'pantry', label: 'Pantry', emoji: '☕', accent: '#d97706' },
  { value: 'electricity', label: 'Electricity', emoji: '💡', accent: '#eab308' },
  { value: 'facilities', label: 'AC/Facilities', emoji: '❄️', accent: '#0ea5e9' },
  { value: 'it', label: 'IT/Internet', emoji: '💻', accent: '#8b5cf6' },
  { value: 'general', label: 'General', emoji: '📢', accent: '#10b981' }
];

export const categoryMeta = (value: OfficeCategory): CategoryMeta => CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[4];

/** Same set the API accepts. */
export const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🎉'];

/** "just now", "5 min ago", "3 h ago", "2 d ago", then the date. */
export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Tint a surface with the category colour; works in light and dark because it mixes with the card colour. */
export const tint = (accent: string, amount = 8) => ({
  background: `color-mix(in srgb, ${accent} ${amount}%, var(--tm-card))`,
  borderColor: `color-mix(in srgb, ${accent} 35%, var(--tm-border))`
});
