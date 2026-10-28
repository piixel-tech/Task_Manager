import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../hooks/useConfirm';
import { useChatStore } from '../../../store/useChatStore';
import { chatApi, type ChatMessage } from '../../../services/http/chatApi';
import { previewOf } from '../chatUtils';

interface Props {
  message: ChatMessage | null;
  onClose: () => void;
}

/** Pick other groups to forward a message into. */
export const ForwardModal: React.FC<Props> = ({ message, onClose }) => {
  const confirm = useConfirm();
  const groups = useChatStore((s) => s.groups);
  const upsertMessage = useChatStore((s) => s.upsertMessage);
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    setPicked([]);
    setQ('');
  }, [message?.id]);

  const shown = useMemo(() => groups.filter((g) => g.name.toLowerCase().includes(q.trim().toLowerCase())), [groups, q]);
  if (!message) return null;

  const send = async () => {
    const ok = await confirm({
      title: `Forward to ${picked.length} ${picked.length === 1 ? 'group' : 'groups'}?`,
      message: `“${previewOf(message).slice(0, 80)}” is sent to everyone in ${picked.length === 1 ? 'that group' : 'those groups'}.`,
      confirmLabel: 'Forward',
      action: async () => {
        (await chatApi.forward(message.id, picked)).forEach(upsertMessage);
      },
      successTitle: 'Message forwarded'
    });
    if (ok) onClose();
  };

  return (
    <Modal isOpen onClose={onClose} title="Forward message" maxWidth="md">
      <div className="space-y-4">
        <p className="line-clamp-2 rounded-xl bg-[var(--tm-card-muted)] p-3 text-[13px] text-[var(--tm-ink-soft)]">{previewOf(message)}</p>
        <Input pill placeholder="Search groups" value={q} onChange={(e) => setQ(e.target.value)} />
        <ul className="max-h-60 divide-y divide-[var(--tm-border)] overflow-y-auto rounded-xl border border-[var(--tm-border)]">
          {shown.length === 0 && <li className="p-3 text-[13px] text-[var(--tm-ink-muted)]">No groups found.</li>}
          {shown.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-[var(--tm-card-muted)]">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--tm-primary)]"
                  checked={picked.includes(g.id)}
                  onChange={() => setPicked((p) => (p.includes(g.id) ? p.filter((x) => x !== g.id) : [...p, g.id]))}
                />
                <span className="text-[13.5px] font-semibold text-[var(--tm-ink)]">{g.name}</span>
                <span className="ml-auto text-[11px] text-[var(--tm-ink-muted)]">{g.members.length} members</span>
              </label>
            </li>
          ))}
        </ul>
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={picked.length === 0 || picked.length > 10} onClick={send}>
            Forward
          </Button>
        </div>
      </div>
    </Modal>
  );
};
