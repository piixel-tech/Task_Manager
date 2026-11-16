import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckSquare, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { Switch } from '../../../components/ui/Switch';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/useChatStore';
import { isMutedKey, useMutesStore } from '../../../store/useMutesStore';
import { chatApi, type ChatGroup, type Scheduled } from '../../../services/http/chatApi';
import { SharedTabs } from './SharedTabs';

const LABEL = 'pb-2 text-[12px] font-semibold text-[var(--tm-ink-muted)]';
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Right column: who is in the chat, what was shared, tasks made from it, scheduled messages and mute. Managing the group stays in the group info dialog. */
export const ChatInfoPanel: React.FC<{ group: ChatGroup; meId: string; onManage: () => void; onOpenScheduled?: () => void }> = ({ group, meId, onManage, onOpenScheduled }) => {
  const navigate = useNavigate();
  const prefix = useAuthStore((s) => (s.user?.role === 'admin' ? '/admin' : '/app'));
  const isClient = useAuthStore((s) => s.user?.role === 'client');
  const items = useChatStore((s) => s.threads[group.id]?.items);
  const mutes = useMutesStore((s) => s.mutes);
  const setMute = useMutesStore((s) => s.set);
  const muteKey = `chat:${group.id}`;
  const [scheduled, setScheduled] = useState<Scheduled[]>([]);

  useEffect(() => {
    if (isClient) return;
    let live = true;
    chatApi
      .scheduled(group.id)
      .then((rows) => live && setScheduled(rows))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [group.id, isClient, items?.length]);

  // Tasks made from messages of this chat (those on screen; the newest first).
  const tasks = [...new Map((items ?? []).filter((m) => m.task && !m.deleted).reverse().map((m) => [m.task!.id, m.task!])).values()];
  const people = group.members.length === 2 ? group.members.find((u) => u.id !== meId) : undefined;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-5">
      <div className="flex flex-col items-center gap-1.5 pb-5 text-center">
        {people ? (
          <Avatar name={people.name} src={people.avatar_url ?? undefined} size="xl" />
        ) : (
          <span className="grid h-20 w-20 place-items-center rounded-full bg-[var(--tc-other-bg)] text-[var(--tm-ink-soft)]">
            <Users className="h-9 w-9" />
          </span>
        )}
        <h2 className="mt-1 text-[17px] font-bold text-[var(--tm-ink)]">{group.name}</h2>
        <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
          {group.members.length > 2 ? 'Group' : 'Chat'} · {group.members.length} members
        </p>
        <button type="button" onClick={onManage} className="text-[12.5px] font-semibold text-[var(--tm-ink-soft)] underline-offset-2 hover:text-[var(--tm-ink)] hover:underline">
          Group info
        </button>
      </div>

      <section className="pb-5">
        <h3 className={LABEL}>Members</h3>
        <ul className="space-y-0.5">
          {group.members.map((u) => (
            <li key={u.id}>
              <PersonLink userId={u.id} className="flex items-center gap-2.5 rounded-[var(--tm-radius-md)] px-1.5 py-1.5 hover:bg-[var(--tc-other-bg)]">
                <Avatar name={u.name} src={u.avatar_url ?? undefined} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--tm-ink)]">
                  {u.name}
                  {u.id === meId && ' (you)'}
                </span>
                <span className="shrink-0 text-[12px] capitalize text-[var(--tm-ink-muted)]">{u.role}</span>
              </PersonLink>
            </li>
          ))}
        </ul>
      </section>

      <section className="pb-5">
        <h3 className={LABEL}>Media &amp; files</h3>
        <SharedTabs groupId={group.id} onOpenMessage={(id) => void useChatStore.getState().jumpTo(group.id, id)} />
      </section>

      {tasks.length > 0 && (
        <section className="pb-5">
          <h3 className={LABEL}>Tasks from this chat</h3>
          <ul className="space-y-0.5">
            {tasks.map((t) => (
              <li key={t.id}>
                <button type="button" onClick={() => navigate(`${prefix}/tasks/${t.id}`)} className="flex w-full items-center gap-2.5 rounded-[var(--tm-radius-md)] px-1.5 py-1.5 text-left hover:bg-[var(--tc-other-bg)]">
                  <CheckSquare className="h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
                  <span className="truncate text-[13.5px] font-medium text-[var(--tm-ink)]">{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isClient && scheduled.length > 0 && (
        <section className="pb-5">
          <h3 className={LABEL}>Scheduled messages</h3>
          <ul className="space-y-0.5">
            {scheduled.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={onOpenScheduled} disabled={!onOpenScheduled} className="flex w-full items-start gap-2.5 rounded-[var(--tm-radius-md)] px-1.5 py-1.5 text-left hover:bg-[var(--tc-other-bg)]">
                  <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-[var(--tm-ink)]">{m.text || 'Attachment'}</span>
                    <span className="block text-[12px] text-[var(--tm-ink-muted)]">{when(m.send_at)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-auto flex items-center justify-between gap-3 border-t border-[var(--tm-border)] pt-4">
        <span className="text-[13.5px] font-medium text-[var(--tm-ink)]">Mute notifications</span>
        <Switch checked={isMutedKey(mutes, muteKey)} onChange={(on) => void setMute(muteKey, on ? 'always' : 'off')} label="Mute notifications" />
      </section>
    </div>
  );
};
