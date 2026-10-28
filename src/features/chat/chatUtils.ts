import type { ChatGroup, ChatMessage, MessageStatus } from '../../services/http/chatApi';

export const REACTIONS = ['👍', '❤️', '😂', '😮', '🙏', '🎉'];

/** Short text for the group list and reply quotes. */
export function previewOf(m: ChatMessage): string {
  if (m.deleted) return 'This message was deleted';
  if (m.type === 'approval') return `${m.reminder ? '⏰ Reminder' : '✅ Approval'}: ${m.text || m.approval?.question || ''}`;
  if (m.type === 'image') return `📷 ${m.text || 'Photo'}`;
  if (m.type === 'voice') return '🎤 Voice message';
  if (m.type === 'file') return `📎 ${m.text || m.file?.name || 'File'}`;
  return m.text;
}

/** Who a message is waiting on: everyone but the sender who was already in the group when it was sent. */
export function recipientsOf(m: ChatMessage, group: ChatGroup): string[] {
  const sent = new Date(m.created_at).getTime();
  return group.members
    .map((u) => u.id)
    .filter((id) => id !== m.sender?.id && new Date(group.joined_at[id] ?? group.created_at).getTime() <= sent);
}

/** ✓ sent, ✓✓ delivered to everyone, blue ✓✓ seen by everyone. */
export function statusOf(m: ChatMessage, group: ChatGroup | undefined): MessageStatus {
  if (!group) return m.status;
  const rec = recipientsOf(m, group);
  const seen = new Set(m.seen_by.map((r) => r.user_id));
  const delivered = new Set([...seen, ...m.delivered_to.map((r) => r.user_id)]);
  if (rec.length && rec.every((id) => seen.has(id))) return 'seen';
  if (rec.length && rec.every((id) => delivered.has(id))) return 'delivered';
  return 'sent';
}

export const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

/** Time for the group list: the clock today, "Yesterday", then the date. */
export function listTime(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return clock(iso);
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** Divider label between days: "Today", "Yesterday", or a full date. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

export const mmss = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

/** `<input type="datetime-local">` wants local time as YYYY-MM-DDTHH:mm. */
export const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/** "Tomorrow at 9:00 AM", "Mon, Nov 3 at 9:00 AM"... for confirmations and the scheduled list. */
export function whenLabel(d: Date): string {
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} at ${time}`;
}

/** The quick "send later" choices, in the browser's time zone. */
export function scheduleOptions(now = new Date()): { label: string; hint: string; when: Date }[] {
  const nineAm = (daysAhead: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(9, 0, 0, 0);
    return d;
  };
  const toMonday = ((8 - now.getDay()) % 7) || 7; // always the coming Monday, never today
  const hint = (d: Date) => d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const tomorrow = nineAm(1);
  const monday = nineAm(toMonday);
  return [
    { label: 'Tomorrow 9:00 AM', hint: hint(tomorrow), when: tomorrow },
    { label: 'Next Monday 9:00 AM', hint: hint(monday), when: monday }
  ];
}
