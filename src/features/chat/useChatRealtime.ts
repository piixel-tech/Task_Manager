import { useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/useChatStore';
import { socket } from '../../services/socket';
import { chatApi } from '../../services/http/chatApi';
import type { ChatMessage } from '../../services/http/chatApi';
import { toast } from '../../store/useToastStore';
import { previewOf } from './chatUtils';
import { amFocused } from '../../store/useFocusStore';
import { wantsPopup } from '../../store/useSettingsStore';

/**
 * Keeps chat live for the signed-in person wherever they are in the app: loads their groups for the unread
 * badge and applies messages, ticks, reactions, typing hints and group changes pushed over the WebSocket.
 * The socket itself is opened by useNotificationSync.
 */
export function useChatRealtime(): void {
  const userId = useAuthStore((s) => s.user?.id);
  const role = useAuthStore((s) => s.user?.role);

  useEffect(() => {
    const store = useChatStore;
    if (!userId) {
      store.getState().reset();
      return;
    }
    void store.getState().loadGroups();

    let first = true;
    const offs = [
      // After a reconnect, anything pushed while we were away has to be fetched again.
      socket.on('connected', () => {
        if (first) {
          first = false;
          return;
        }
        const { activeId, loadGroups } = store.getState();
        void loadGroups();
        if (activeId) {
          store.setState((s) => ({ threads: { ...s.threads, [activeId]: { ...s.threads[activeId], loaded: false } } }));
          void store.getState().openThread(activeId);
        }
      }),
      socket.on('chat:message', (m: ChatMessage) => {
        const { groups, activeId, upsertMessage } = store.getState();
        const group = groups.find((g) => g.id === m.group_id);
        const looking = activeId === m.group_id && document.visibilityState === 'visible';
        if (group && m.sender?.id !== userId && !looking && !amFocused() && wantsPopup('chat')) {
          const prefix = role === 'admin' ? '/admin/chat' : role === 'client' ? '/client/portal' : '/app/chat';
          toast.info(group.name, `${m.sender?.name.split(' ')[0] ?? 'Someone'}: ${previewOf(m)}`, `${prefix}?group=${m.group_id}`);
        }
        upsertMessage(m);
      }),
      socket.on('chat:message_update', (m: ChatMessage) => store.getState().upsertMessage(m)),
      socket.on('chat:message_removed', (e: { group_id: string; message_id: string }) => store.getState().removeMessage(e.group_id, e.message_id)),
      socket.on('chat:receipts', (e) => store.getState().applyReceipts(e)),
      socket.on('chat:typing', (e: { group_id: string; user_id: string; name: string }) => {
        if (e.user_id !== userId) store.getState().setTyping(e.group_id, e.user_id, e.name);
      }),
      // A group appeared, changed, lost a member or was deleted: fetch it (a 403/404 means we're out of it).
      socket.on('chat:group', (e: { group_id: string }) => {
        chatApi
          .group(e.group_id)
          .then((g) => store.getState().upsertGroup(g))
          .catch(() => store.getState().dropGroup(e.group_id));
      })
    ];
    return () => offs.forEach((off) => off());
  }, [userId, role]);
}
