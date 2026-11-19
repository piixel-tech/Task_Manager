import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { chatApi } from '../../services/http/chatApi';
import { useAuthStore } from '../../store/authStore';
import { toast } from '../../store/useToastStore';
import { basePath } from '../settings/settingsMenu';

export interface WishTarget {
  user_id: string;
  name: string;
}

/** Open (or start) the chat between me and this person. There is no separate direct-message type, so it is a two-person chat. */
async function chatWith(meId: string, meName: string, other: WishTarget): Promise<string> {
  const groups = await chatApi.groups();
  const existing = groups.find((g) => g.members.length === 2 && g.members.some((m) => m.id === meId) && g.members.some((m) => m.id === other.user_id));
  if (existing) return existing.id;
  return (await chatApi.createGroup(`${meName} & ${other.name}`.slice(0, 100), [other.user_id], null)).id;
}

/** "Send wishes": opens the chat with that person. `busy` is the user id being opened. */
export function useSendWishes() {
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const [busy, setBusy] = useState<string | null>(null);

  const send = async (target: WishTarget) => {
    if (!me || busy) return;
    setBusy(target.user_id);
    try {
      const id = await chatWith(me.id, me.name, target);
      navigate(`${basePath(me.role)}/chat?group=${id}`);
    } catch (err) {
      toast.error('Could not open the chat', err instanceof Error ? err.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return { send, busy };
}
