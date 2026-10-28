import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { useConfirm } from '../../../hooks/useConfirm';
import { useChatStore } from '../../../store/useChatStore';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { chatApi, type ChatGroup } from '../../../services/http/chatApi';
import { AssetPicker } from '../../tasks/components/AssetPicker';

interface Props {
  group: ChatGroup | null;
  onClose: () => void;
}

/** Ask the client(s) in a group to approve something: a question, optional files, and the wording of both buttons. */
export const ApprovalRequestModal: React.FC<Props> = ({ group, onClose }) => {
  const confirm = useConfirm();
  const upsertMessage = useChatStore((s) => s.upsertMessage);
  const [question, setQuestion] = useState('');
  const [files, setFiles] = useState<Asset[]>([]);
  const [approveLabel, setApproveLabel] = useState('Approve');
  const [rejectLabel, setRejectLabel] = useState('Reject');
  const uploaded = useRef<Set<string>>(new Set());
  const sent = useRef(false);

  useEffect(() => {
    if (!group) return;
    setQuestion('');
    setFiles([]);
    setApproveLabel('Approve');
    setRejectLabel('Reject');
    uploaded.current = new Set();
    sent.current = false;
  }, [group?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!group) return null;
  const clients = group.members.filter((m) => m.role === 'client');

  const close = () => {
    if (!sent.current) uploaded.current.forEach((id) => assetApi.remove(id).catch(() => {})); // don't leave unsent uploads behind
    onClose();
  };

  const changeFiles = (next: Asset[]) => {
    files.filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id)).forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setFiles(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await confirm({
      title: 'Send this approval request?',
      message: `${clients.map((c) => c.name).join(', ')} ${clients.length === 1 ? 'is' : 'are'} asked to answer “${approveLabel.trim()}” or “${rejectLabel.trim()}”. They get a reminder every 24 hours until someone answers.`,
      confirmLabel: 'Send request',
      action: async () => {
        upsertMessage(
          await chatApi.requestApproval(group.id, {
            question: question.trim(),
            file_ids: files.map((f) => f.id),
            approve_label: approveLabel.trim(),
            reject_label: rejectLabel.trim()
          })
        );
      },
      successTitle: 'Approval request sent'
    });
    if (ok) {
      sent.current = true;
      onClose();
    }
  };

  return (
    <Modal isOpen onClose={close} title="Request client approval" description={`In “${group.name}”`} maxWidth="lg">
      <form onSubmit={submit} className="space-y-4">
        {clients.length === 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
            No client has joined this group yet. Create an invite link in Group info first.
          </div>
        )}
        <div>
          <label htmlFor="approval-question" className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">
            What do you need approved?
          </label>
          <textarea
            id="approval-question"
            autoFocus
            value={question}
            maxLength={1000}
            rows={4}
            placeholder="e.g. Is the new logo OK to go live on Friday?"
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full resize-y rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 text-[14px] text-[var(--tm-ink)] outline-none focus:border-[var(--tm-primary)]"
          />
        </div>
        <AssetPicker value={files} onChange={changeFiles} onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Approve button" value={approveLabel} maxLength={30} onChange={(e) => setApproveLabel(e.target.value)} />
          <Input label="Reject button" value={rejectLabel} maxLength={30} onChange={(e) => setRejectLabel(e.target.value)} helperText="Rejecting asks the client for a reason." />
        </div>
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button type="submit" disabled={!question.trim() || !approveLabel.trim() || !rejectLabel.trim() || clients.length === 0}>
            Send request
          </Button>
        </div>
      </form>
    </Modal>
  );
};
