import React, { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { chatApi, type ChatGroup, type Invite } from '../../../services/http/chatApi';

const linkFor = (token: string) => `${window.location.origin}/join/${token}`;

/** "Expires in 6 days" / "Expires in 5 hours" */
function expiresIn(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return 'Expired';
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 24) return `Expires in ${Math.max(hours, 1)} ${hours <= 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** Invite links that let clients join this group: make one, copy it, share it on WhatsApp, revoke it. */
export const InviteSection: React.FC<{ group: ChatGroup }> = ({ group }) => {
  const confirm = useConfirm();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInvites(await chatApi.invites(group.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the invite links');
    }
  }, [group.id]);

  useEffect(() => {
    setInvites(null);
    load();
  }, [load]);

  const create = () =>
    confirm({
      title: 'Create an invite link?',
      message: 'Anyone who has the link can join this group as a client for the next 7 days. You can revoke it at any time.',
      confirmLabel: 'Create link',
      action: async () => {
        const invite = await chatApi.createInvite(group.id);
        setInvites((cur) => [invite, ...(cur ?? [])]);
      },
      successTitle: 'Invite link created'
    });

  const revoke = (invite: Invite) =>
    confirm({
      title: 'Revoke this link?',
      message: 'It stops working straight away. Clients who already joined stay in the group.',
      confirmLabel: 'Revoke',
      danger: true,
      action: async () => {
        await chatApi.revokeInvite(invite.id);
        setInvites((cur) => (cur ?? []).filter((i) => i.id !== invite.id));
      },
      successTitle: 'Link revoked'
    });

  const copy = async (invite: Invite) => {
    try {
      await navigator.clipboard.writeText(linkFor(invite.token));
      toast.success('Link copied', 'Paste it wherever you like.');
    } catch {
      toast.error('Could not copy', 'Select the link and copy it by hand.');
    }
  };

  const whatsapp = (invite: Invite) => {
    const text = `You're invited to join “${group.name}” on our project chat: ${linkFor(invite.token)}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[13px] font-extrabold text-[var(--tm-ink)]">Client invite links</h3>
        <Button size="sm" variant="outline" onClick={create} leftIcon={<Plus className="h-4 w-4" />}>
          New link
        </Button>
      </div>
      {error && <p className="text-[12.5px] text-[var(--tm-danger)]">{error}</p>}
      {invites && invites.length === 0 && (
        <p className="rounded-xl border border-dashed border-[var(--tm-border-strong)] p-3 text-[12.5px] text-[var(--tm-ink-muted)]">
          No active links. Make one to bring a client into this group.
        </p>
      )}
      <ul className="space-y-2">
        {invites?.map((i) => (
          <li key={i.id} className="rounded-xl border border-[var(--tm-border)] p-3">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 shrink-0 text-[var(--tm-ink-muted)]" />
              <input
                readOnly
                aria-label="Invite link"
                value={linkFor(i.token)}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 truncate bg-transparent text-[12.5px] text-[var(--tm-ink-soft)] outline-none"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="text-[11.5px] text-[var(--tm-ink-muted)]">
                {expiresIn(i.expires_at)} · {i.used_count} joined
              </span>
              <div className="ml-auto flex gap-1.5">
                <Button size="sm" variant="outline" onClick={() => copy(i)} leftIcon={<Copy className="h-4 w-4" />}>
                  Copy
                </Button>
                <Button size="sm" variant="outline" onClick={() => whatsapp(i)} leftIcon={<MessageCircle className="h-4 w-4 text-emerald-600" />}>
                  WhatsApp
                </Button>
                <Button size="sm" variant="ghost" aria-label="Revoke link" onClick={() => revoke(i)}>
                  <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
};
