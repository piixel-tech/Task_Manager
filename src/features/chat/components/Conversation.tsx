import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowLeft, CalendarClock, Info, Link2, PanelRight, Search, Users } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { MuteMenu } from '../../../components/ui/MuteMenu';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { focusEndLabel, useFocusOf } from '../../../store/useFocusStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/useChatStore';
import { chatApi, type ChatGroup, type ChatMessage } from '../../../services/http/chatApi';
import { dayLabel, sameDay } from '../chatUtils';
import { ApprovalRequestModal } from './ApprovalRequestModal';
import { Composer } from './Composer';
import { TaskFormModal, type TaskPrefill } from '../../tasks/components/TaskFormModal';
import { ChatSearchModal } from './ChatSearchModal';
import { ForwardModal } from './ForwardModal';
import { MessageBubble } from './MessageBubble';
import { MessageInfoModal } from './MessageInfoModal';
import { StartMeetButton } from '../../google/MeetButtons';
import { PinnedBar } from './PinnedBar';
import { ScheduledModal } from './ScheduledModal';

/** A member's first name in the header, with a moon (and a tooltip) while they are in Focus mode. */
const MemberLabel: React.FC<{ user: ChatGroup['members'][number]; meId: string }> = ({ user, meId }) => {
  const until = useFocusOf(user);
  const name = user.id === meId ? 'You' : user.name.split(' ')[0] + (user.role === 'client' ? ' (client)' : '');
  return until && user.id !== meId ? <span title={`${user.name} is in focus until ${focusEndLabel(until)}`}>{name} 🌙</span> : <>{name}</>;
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The normal task form, filled in from a message: first line as the title, the text as the description. */
function prefillFrom(m: ChatMessage, group: ChatGroup): TaskPrefill {
  const text = m.text.trim();
  const description = m.html && m.body ? m.body : text ? text.split(/\n+/).map((l) => `<p>${escapeHtml(l)}</p>`).join('') : m.file ? '<p>See the attached file.</p>' : '';
  const title = (text.split('\n')[0] || m.file?.name || 'Task from chat').slice(0, 200);
  return { title, description, messageId: m.id, subfolderId: group.subfolder?.id, projectId: group.subfolder?.project_id, fileName: m.file?.name };
}

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 120;

/** Right column: header, scrolling messages (older ones load as you scroll up), typing hint and the message box. */
export const Conversation: React.FC<{ group: ChatGroup; onBack: () => void; onInfo: () => void; panelOpen?: boolean; onTogglePanel?: () => void }> = ({
  group,
  onBack,
  onInfo,
  panelOpen,
  onTogglePanel
}) => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user)!;
  const thread = useChatStore((s) => s.threads[group.id]);
  const typingNow = useChatStore((s) => s.typing[group.id]);
  const jump = useChatStore((s) => (s.jump?.groupId === group.id ? s.jump : null));
  const { loadOlder, loadNewer, showLatest, clearJump, upsertMessage, removeMessage } = useChatStore.getState();

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [info, setInfo] = useState<ChatMessage | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [searching, setSearching] = useState(false);
  const [scheduledOpen, setScheduledOpen] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const [taskFrom, setTaskFrom] = useState<ChatMessage | null>(null);
  const isClient = me.role === 'client';

  const list = useRef<HTMLDivElement>(null);
  const pinned = useRef(true); // keep the view glued to the newest message
  const heightBefore = useRef<number | null>(null); // scroll height before older messages were added
  const lastShown = useRef<{ group: string; id?: string } | null>(null); // to glide only to messages that arrive while reading

  const items = thread?.items ?? [];
  const firstId = items[0]?.id;
  const last = items[items.length - 1];
  const typers = Object.values(typingNow ?? {}).map((t) => t.name.split(' ')[0]);

  useEffect(() => {
    setReplyTo(null);
    pinned.current = true;
  }, [group.id]);

  const refreshScheduled = useCallback(() => {
    chatApi.scheduled(group.id).then((rows) => setScheduledCount(rows.length)).catch(() => {});
  }, [group.id]);
  useEffect(refreshScheduled, [refreshScheduled]);
  // One of mine arrived: a scheduled message may just have gone out.
  const lastMineId = last?.sender?.id === me.id ? last.id : null;
  useEffect(() => {
    if (lastMineId) refreshScheduled();
  }, [lastMineId, refreshScheduled]);

  // Jump to a message (search result, pin, mention link) once it is on screen, then flash it.
  useEffect(() => {
    if (!jump || !thread?.loaded) return;
    const el = document.getElementById(`msg-${jump.messageId}`);
    if (!el) return;
    pinned.current = false;
    el.scrollIntoView({ block: 'center' });
    setFlash(jump.messageId);
    clearJump();
    const t = setTimeout(() => setFlash((f) => (f === jump.messageId ? null : f)), 2200);
    return () => clearTimeout(t);
  }, [jump, thread?.loaded, items.length, clearJump]);

  // Older messages were added above: keep what the reader was looking at in place.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && heightBefore.current != null) {
      el.scrollTop = el.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    }
  }, [firstId]);

  // New message (or first load, or someone typing): stay at the bottom when we were there, or when it's ours.
  useLayoutEffect(() => {
    const el = list.current;
    if (el && !jump && !thread?.hasNewer && (pinned.current || last?.sender?.id === me.id)) {
      const arrived = lastShown.current?.group === group.id && lastShown.current.id !== last?.id && lastShown.current.id !== undefined;
      el.scrollTo({ top: el.scrollHeight, behavior: arrived ? 'smooth' : 'auto' });
      pinned.current = true;
    }
    lastShown.current = { group: group.id, id: last?.id };
  }, [last?.id, thread?.loaded, thread?.hasNewer, group.id, typers.length, me.id, jump]);

  // A short conversation never scrolls, so fetch more until the box is full or there's nothing older.
  useEffect(() => {
    const el = list.current;
    if (el && thread?.loaded && thread.hasMore && !thread.loadingOlder && el.scrollHeight <= el.clientHeight) {
      heightBefore.current = el.scrollHeight;
      void loadOlder(group.id);
    }
  }, [thread?.loaded, thread?.hasMore, thread?.loadingOlder, items.length, group.id, loadOlder]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
    if (el.scrollTop < NEAR_TOP_PX && thread?.hasMore && !thread.loadingOlder) {
      heightBefore.current = el.scrollHeight;
      void loadOlder(group.id);
    }
    if (thread?.hasNewer && !thread.loadingNewer && el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_TOP_PX) void loadNewer(group.id);
  };

  const togglePin = (m: ChatMessage) => {
    const isPinned = group.pinned_ids.includes(m.id);
    return confirm({
      title: isPinned ? 'Unpin this message?' : 'Pin this message?',
      message: isPinned ? 'It stays in the conversation but leaves the pinned list for everyone.' : 'Everyone in the group sees it in the pinned list at the top.',
      confirmLabel: isPinned ? 'Unpin' : 'Pin',
      action: async () => {
        if (isPinned) await chatApi.unpin(m.id);
        else await chatApi.pin(m.id);
      },
      successTitle: isPinned ? 'Message unpinned' : 'Message pinned'
    });
  };

  const react = async (m: ChatMessage, emoji: string) => {
    try {
      upsertMessage(await chatApi.react(m.id, emoji));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not react');
    }
  };

  const remove = (m: ChatMessage, scope: 'me' | 'everyone') =>
    confirm({
      title: scope === 'everyone' ? 'Delete for everyone?' : 'Delete for you?',
      message:
        scope === 'everyone'
          ? 'Everyone in the group will see that this message was deleted. This cannot be undone.'
          : 'It disappears from your view only. Others still see it.',
      confirmLabel: scope === 'everyone' ? 'Delete for everyone' : 'Delete for me',
      danger: true,
      action: async () => {
        await chatApi.deleteMessage(m.id, scope);
        if (scope === 'me') removeMessage(group.id, m.id);
        else upsertMessage({ ...m, deleted: true, body: '', file: null, duration: null, reply: null, reactions: [] });
      },
      successTitle: scope === 'everyone' ? 'Message deleted for everyone' : 'Message deleted'
    });

  const prefix = me.role === 'admin' ? '/admin' : '/app';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-[var(--tm-border)] bg-[var(--tm-card)] px-4 py-3">
        <Button variant="ghost" size="sm" className="lg:hidden" aria-label="Back to chats" onClick={onBack}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <button type="button" onClick={onInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Group info">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
            <Users className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-extrabold text-[var(--tm-ink)]">{group.name}</span>
            <span className="block truncate text-[12px] text-[var(--tm-ink-muted)]" aria-live="polite">
              {typers.length > 0 ? (
                <span className="font-semibold text-[var(--tm-primary-dark)]">
                  {typers.length === 1 ? `${typers[0]} is typing…` : typers.length === 2 ? `${typers.join(' and ')} are typing…` : `${typers.length} people are typing…`}
                </span>
              ) : (
                group.members.map((u, i) => (
                  <React.Fragment key={u.id}>
                    {i > 0 && ', '}
                    <MemberLabel user={u} meId={me.id} />
                  </React.Fragment>
                ))
              )}
            </span>
          </span>
        </button>
        {group.subfolder && !isClient && (
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => navigate(`${prefix}/projects/${group.subfolder!.project_id}/subfolders/${group.subfolder!.id}`)}
            leftIcon={<Link2 className="h-4 w-4" />}
          >
            {group.subfolder.name}
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-label="Search this chat" title="Search this chat" onClick={() => setSearching(true)}>
          <Search className="h-5 w-5" />
        </Button>
        <MuteMenu mutedKey={`chat:${group.id}`} />
        {!isClient && <StartMeetButton groupId={group.id} />}
        {!isClient && (
          <Button variant="ghost" size="sm" aria-label="Scheduled messages" title="Scheduled messages" onClick={() => setScheduledOpen(true)} className="relative">
            <CalendarClock className="h-5 w-5" />
            {scheduledCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-[var(--tm-primary)] px-1 text-[10px] font-extrabold text-[var(--tm-on-primary)]">{scheduledCount}</span>
            )}
          </Button>
        )}
        <Button variant="ghost" size="sm" aria-label="Group info" onClick={onInfo} className="xl:hidden">
          <Info className="h-5 w-5" />
        </Button>
        {onTogglePanel && (
          <Button variant="ghost" size="sm" aria-label={panelOpen ? 'Hide chat info' : 'Show chat info'} aria-pressed={panelOpen} title="Chat info and media" onClick={onTogglePanel} className="hidden xl:inline-flex">
            <PanelRight className="h-5 w-5" />
          </Button>
        )}
      </header>

      <PinnedBar group={group} onJump={(id) => void useChatStore.getState().jumpTo(group.id, id)} onToggle={togglePin} />

      <div ref={list} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto bg-[var(--tc-area)] px-3 py-4 sm:px-6">
        {thread?.loadingOlder && <p className="py-2 text-center text-[12px] text-[var(--tm-ink-muted)]">Loading older messages…</p>}
        {thread && !thread.hasMore && items.length > 0 && <p className="py-2 text-center text-[12px] text-[var(--tm-ink-muted)]">This is the start of the conversation</p>}
        {!thread?.loaded && (
          <div className="space-y-3 py-6" role="status" aria-label="Loading messages">
            <Skeleton className="h-10 w-2/5" rounded="lg" />
            <Skeleton className="ml-auto h-10 w-1/3" rounded="lg" />
            <Skeleton className="h-14 w-1/2" rounded="lg" />
          </div>
        )}
        {thread?.loaded && items.length === 0 && (
          <EmptyState className="my-6" title="No messages yet" description="Say hello 👋" />
        )}

        {items.map((m, i) => {
          const prev = items[i - 1];
          const newDay = !prev || !sameDay(prev.created_at, m.created_at);
          const showSender = newDay || prev.sender?.id !== m.sender?.id;
          return (
            <React.Fragment key={m.id}>
              {newDay && (
                <div className="flex justify-center pb-1 pt-3">
                  <span className="rounded-full border border-[var(--tc-other-border)] bg-[var(--tm-card)] px-3 py-0.5 text-[11px] font-semibold text-[var(--tm-ink-muted)]">{dayLabel(m.created_at)}</span>
                </div>
              )}
              <div className={showSender ? 'pt-3' : 'pt-1'}>
              <MessageBubble
                message={m}
                group={group}
                meId={me.id}
                showSender={showSender}
                onReply={setReplyTo}
                onReact={react}
                onForward={setForwarding}
                onDelete={remove}
                onInfo={setInfo}
                onPin={togglePin}
                onCreateTask={isClient ? undefined : setTaskFrom}
                flash={flash === m.id}
              />
              </div>
            </React.Fragment>
          );
        })}
        {typers.length > 0 && (
          <div className="flex items-end gap-2 pt-3" role="status" aria-label="Someone is typing">
            <div className="w-8 shrink-0" />
            <div className="tm-msg-in flex items-center gap-1 rounded-[18px] rounded-bl-[6px] border border-[var(--tc-other-border)] bg-[var(--tc-other-bg)] px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[var(--tm-ink-muted)]" style={{ animationDelay: `${i * 150}ms` }} />
              ))}
            </div>
          </div>
        )}
        {thread?.loadingNewer && <p className="py-2 text-center text-[12px] text-[var(--tm-ink-muted)]">Loading newer messages…</p>}
      </div>

      {thread?.hasNewer && (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              pinned.current = true;
              void showLatest(group.id);
            }}
            className="absolute -top-12 right-4 z-10 flex items-center gap-1.5 rounded-full bg-[var(--tm-primary)] px-3.5 py-2 text-[12.5px] font-bold text-[var(--tm-on-primary)] shadow-soft-md"
          >
            <ArrowDown className="h-4 w-4" /> Jump to latest
          </button>
        </div>
      )}

      <Composer
        key={group.id}
        group={group}
        meId={me.id}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onRequestApproval={isClient ? undefined : () => setRequesting(true)}
        onScheduled={refreshScheduled}
      />

      <ChatSearchModal
        isOpen={searching}
        onClose={() => setSearching(false)}
        group={group}
        onOpen={(_, messageId) => {
          setSearching(false);
          void useChatStore.getState().jumpTo(group.id, messageId);
        }}
      />
      <TaskFormModal isOpen={!!taskFrom} onClose={() => setTaskFrom(null)} prefill={taskFrom ? prefillFrom(taskFrom, group) : null} onSaved={() => setTaskFrom(null)} />
      <ScheduledModal group={scheduledOpen ? group : null} onClose={() => setScheduledOpen(false)} onChanged={refreshScheduled} />

      {requesting && <ApprovalRequestModal group={group} onClose={() => setRequesting(false)} />}

      <ForwardModal message={forwarding} onClose={() => setForwarding(null)} />
      <MessageInfoModal message={info ? (items.find((x) => x.id === info.id) ?? info) : null} group={group} onClose={() => setInfo(null)} />
    </div>
  );
};

