import { useCallback, useEffect, useState } from 'react';
import { socket } from '../../services/socket';
import { chatApi, type ApprovalItem } from '../../services/http/chatApi';

/** The approvals still waiting for this client, kept fresh by live chat events. */
export function usePendingApprovals(): { items: ApprovalItem[]; reload: () => void } {
  const [items, setItems] = useState<ApprovalItem[]>([]);

  const reload = useCallback(() => {
    chatApi.approvals('pending').then(setItems).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const offs = ['chat:message', 'chat:message_update', 'chat:group'].map((e) => socket.on(e, reload));
    return () => offs.forEach((off) => off());
  }, [reload]);

  return { items, reload };
}
