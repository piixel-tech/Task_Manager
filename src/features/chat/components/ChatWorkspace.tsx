import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { ChatInfoPanel } from './ChatInfoPanel';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useAuthStore } from '../../../store/authStore';
import { useChatStore } from '../../../store/useChatStore';
import { Conversation } from './Conversation';
import { ChatSearchModal } from './ChatSearchModal';
import { GroupInfoModal } from './GroupInfoModal';
import { GroupList } from './GroupList';
import { NewGroupModal } from './NewGroupModal';

/**
 * Group list on the left, the open conversation on the right (one at a time on a phone).
 * Used by the team's chat page and by the client portal; clients can't start groups.
 */
export const ChatWorkspace: React.FC<{ canCreate: boolean; heightClass?: string }> = ({
  canCreate,
  heightClass = 'h-[calc(100dvh-10.5rem)]'
}) => {
  const me = useAuthStore((s) => s.user)!;
  const groups = useChatStore((s) => s.groups);
  const loaded = useChatStore((s) => s.groupsLoaded);
  const activeId = useChatStore((s) => s.activeId);
  const setActive = useChatStore((s) => s.setActive);
  const markRead = useChatStore((s) => s.markRead);
  const [params, setParams] = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [search, setSearch] = useState<null | 'all' | 'mentions'>(null);

  const active = groups.find((g) => g.id === activeId) ?? null;
  const wanted = params.get('group');

  // Open the group named in the link (from a notification or an invite), once we know it exists.
  useEffect(() => {
    if (wanted && groups.some((g) => g.id === wanted)) setActive(wanted);
  }, [wanted, groups, setActive]);

  // A link to one message (a mention notification): open its group, then scroll to it.
  const wantedMessage = params.get('message');
  useEffect(() => {
    if (!wantedMessage || !wanted || activeId !== wanted) return;
    void useChatStore.getState().jumpTo(wanted, wantedMessage).then(() => {
      setParams({ group: wanted }, { replace: true });
    });
  }, [wantedMessage, wanted, activeId, setParams]);

  // Leaving the page closes the conversation, so new messages count as unread again.
  useEffect(() => () => setActive(null), [setActive]);

  // Coming back to this tab while a conversation is open counts as reading it.
  useEffect(() => {
    const onVisible = () => {
      const id = useChatStore.getState().activeId;
      if (document.visibilityState === 'visible' && id) void markRead(id);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead]);

  const select = (id: string | null) => {
    setActive(id);
    setParams(id ? { group: id } : {}, { replace: true });
  };

  return (
    <>
      <div
        className={`flex ${heightClass} min-h-[440px] gap-4`}
      >
        <aside className={`${active ? 'hidden lg:block' : 'block'} w-full shrink-0 overflow-hidden rounded-[24px] bg-[var(--tm-card)] p-3 shadow-soft lg:w-[320px]`}>
          <GroupList groups={groups} loaded={loaded} activeId={activeId} meId={me.id} onSelect={select} onNew={canCreate ? () => setCreating(true) : undefined}
            onSearch={() => setSearch('all')}
            onMentions={() => setSearch('mentions')}
          />
        </aside>

        <section className={`${active ? 'block' : 'hidden lg:flex'} min-w-0 flex-1 overflow-hidden rounded-[24px] bg-[var(--tm-card)] shadow-soft lg:items-center lg:justify-center`}>
          {active ? (
            <Conversation group={active} onBack={() => select(null)} onInfo={() => setShowInfo(true)} panelOpen={panelOpen} onTogglePanel={() => setPanelOpen((o) => !o)} />
          ) : (
            <EmptyState
              icon={<MessageSquare className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
              title="Pick a conversation"
              description={canCreate ? 'Choose a group on the left, or start a new one.' : 'Choose a conversation on the left.'}
              actionLabel={canCreate ? 'New group' : undefined}
              onAction={canCreate ? () => setCreating(true) : undefined}
            />
          )}
        </section>

        {active && panelOpen && (
          <aside className="hidden w-[320px] shrink-0 overflow-hidden rounded-[24px] bg-[var(--tm-card)] shadow-soft xl:block">
            <ChatInfoPanel group={active} meId={me.id} onManage={() => setShowInfo(true)} />
          </aside>
        )}
      </div>

      {canCreate && (
        <NewGroupModal
          isOpen={creating}
          onClose={() => setCreating(false)}
          onCreated={(g) => {
            useChatStore.getState().upsertGroup(g);
            select(g.id);
          }}
        />
      )}
      <GroupInfoModal group={showInfo ? active : null} onClose={() => setShowInfo(false)} />
      <ChatSearchModal
        isOpen={search !== null}
        mentionsOnly={search === 'mentions'}
        onClose={() => setSearch(null)}
        onOpen={(groupId, messageId) => {
          setSearch(null);
          select(groupId);
          void useChatStore.getState().jumpTo(groupId, messageId);
        }}
      />
    </>
  );
};
