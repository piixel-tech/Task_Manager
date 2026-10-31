import React from 'react';
import { Avatar } from '../../../components/ui/Avatar';
import { Modal } from '../../../components/ui/Modal';
import type { ChatGroup, ChatMessage } from '../../../services/http/chatApi';
import { recipientsOf } from '../chatUtils';
import { Ticks } from './Ticks';

const when = (iso: string) => new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/** Who has seen a message and when, who it was delivered to, and who it is still waiting on. */
export const MessageInfoModal: React.FC<{ message: ChatMessage | null; group: ChatGroup | undefined; onClose: () => void }> = ({
  message,
  group,
  onClose
}) => {
  if (!message || !group) return null;
  const person = (id: string) => group.members.find((u) => u.id === id);
  const seen = message.seen_by;
  const seenIds = new Set(seen.map((r) => r.user_id));
  const delivered = message.delivered_to.filter((r) => !seenIds.has(r.user_id));
  const known = new Set([...seenIds, ...delivered.map((r) => r.user_id)]);
  const waiting = recipientsOf(message, group).filter((id) => !known.has(id));

  const Row = ({ id, at }: { id: string; at?: string }) => (
    <li className="flex items-center gap-3 py-2">
      <Avatar name={person(id)?.name ?? '?'} src={person(id)?.avatar_url ?? undefined} size="xs" />
      <span className="text-[13.5px] font-semibold text-[var(--tm-ink)]">{person(id)?.name ?? 'Former member'}</span>
      {at && <span className="ml-auto text-[12px] text-[var(--tm-ink-muted)]">{when(at)}</span>}
    </li>
  );

  return (
    <Modal isOpen onClose={onClose} title="Message info" maxWidth="md">
      <div className="space-y-5">
        <p className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] p-3.5 text-[13px] text-[var(--tm-ink-soft)]">
          Sent {when(message.created_at)}
        </p>
        <section>
          <h3 className="flex items-center gap-1.5 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">
            <Ticks status="seen" /> Seen by
          </h3>
          <ul className="divide-y divide-[var(--tm-border)]">
            {seen.length === 0 && <li className="py-2 text-[13px] text-[var(--tm-ink-muted)]">No one yet</li>}
            {seen.map((r) => (
              <Row key={r.user_id} id={r.user_id} at={r.at} />
            ))}
          </ul>
        </section>
        {delivered.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">
              <Ticks status="delivered" /> Delivered to
            </h3>
            <ul className="divide-y divide-[var(--tm-border)]">
              {delivered.map((r) => (
                <Row key={r.user_id} id={r.user_id} at={r.at} />
              ))}
            </ul>
          </section>
        )}
        {waiting.length > 0 && (
          <section>
            <h3 className="flex items-center gap-1.5 text-[12.5px] font-extrabold uppercase tracking-wide text-[var(--tm-ink-muted)]">
              <Ticks status="sent" /> Not delivered yet
            </h3>
            <ul className="divide-y divide-[var(--tm-border)]">
              {waiting.map((id) => (
                <Row key={id} id={id} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Modal>
  );
};
