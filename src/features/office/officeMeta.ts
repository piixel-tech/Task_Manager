import type { OfficeCategory } from '../../services/http/officeApi';

export interface CategoryMeta {
  value: OfficeCategory;
  label: string;
  emoji: string;
  /** Theme token for the category chip text and icon (lavender shades only). */
  accent: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { value: 'pantry', label: 'Pantry', emoji: '☕', accent: 'var(--tm-primary-dark)' },
  { value: 'electricity', label: 'Electricity', emoji: '💡', accent: 'var(--tm-primary-dark)' },
  { value: 'facilities', label: 'AC/Facilities', emoji: '❄️', accent: 'var(--tm-primary-dark)' },
  { value: 'it', label: 'IT/Internet', emoji: '💻', accent: 'var(--tm-primary-dark)' },
  { value: 'general', label: 'General', emoji: '📢', accent: 'var(--tm-primary-dark)' }
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

/** Selected-state surface for category pickers: the lavender tint and its border, in light and dark. */
export const tint = (_accent?: string, _amount?: number) => ({
  background: 'var(--tm-primary-soft)',
  borderColor: 'var(--tm-primary-light)'
});
