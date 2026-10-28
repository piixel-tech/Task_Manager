import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, FileText, Pencil, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { RichEditor, type RichEditorHandle } from '../../../components/editor/RichEditor';
import { RichText } from '../../../components/editor/RichText';
import { useConfirm } from '../../../hooks/useConfirm';
import { chatApi, type ChatGroup, type Scheduled } from '../../../services/http/chatApi';
import { toLocalInput, whenLabel } from '../chatUtils';

interface Props {
  /** The open group, or null when closed. */
  group: ChatGroup | null;
  onClose: () => void;
  /** The list changed (edited or cancelled). */
  onChanged: () => void;
}

/** My messages in this group that are waiting to go out: change the text or time, or cancel them. */
export const ScheduledModal: React.FC<Props> = ({ group, onClose, onChanged }) => {
  const confirm = useConfirm();
  const [items, setItems] = useState<Scheduled[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Scheduled | null>(null);
  const [when, setWhen] = useState('');
  const [empty, setEmpty] = useState(false);
  const editor = React.useRef<RichEditorHandle>(null);

  const load = useCallback(() => {
    if (!group) return;
    chatApi
      .scheduled(group.id)
      .then((rows) => {
        setItems(rows);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load scheduled messages'));
  }, [group]);

  useEffect(() => {
    setItems(null);
    setEditing(null);
    load();
  }, [load]);

  const startEdit = (s: Scheduled) => {
    setEditing(s);
    setWhen(toLocalInput(new Date(s.send_at)));
    setEmpty(!s.text && s.files.length === 0);
  };

  const save = async () => {
    if (!editing || !editor.current) return;
    const target = editing;
    const ok = await confirm({
      title: 'Save changes?',
      message: `This message will be sent ${whenLabel(new Date(when))}.`,
      confirmLabel: 'Save',
      action: async () => {
        await chatApi.editScheduled(target.id, { body: editor.current!.isEmpty() ? '' : editor.current!.html(), send_at: new Date(when).toISOString() });
      },
      successTitle: 'Scheduled message updated'
    });
    if (ok) {
      setEditing(null);
      load();
      onChanged();
    }
  };

  const cancel = async (s: Scheduled) => {
    const ok = await confirm({
      title: 'Cancel this scheduled message?',
      message: 'It will not be sent, and its attachments are removed.',
      confirmLabel: 'Cancel message',
      danger: true,
      action: () => chatApi.cancelScheduled(s.id),
      successTitle: 'Scheduled message cancelled'
    });
    if (ok) {
      load();
      onChanged();
    }
  };

  const valid = !!when && new Date(when).getTime() > Date.now() + 30_000 && (!empty || (editing?.files.length ?? 0) > 0);

  return (
    <Modal isOpen={!!group} onClose={onClose} title="Scheduled messages" description={group ? `Waiting to be sent to “${group.name}”, from you.` : undefined} maxWidth="lg">
      {error && <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}
      {items === null ? (
        error ? null : <p className="py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>
      ) : items.length === 0 ? (
        <div className="py-8 text-center text-[13px] text-[var(--tm-ink-muted)]">
          <CalendarClock className="mx-auto mb-2 h-6 w-6" />
          Nothing scheduled. Use the arrow next to Send to send a message later.
        </div>
      ) : editing ? (
        <div className="space-y-4">
          <RichEditor key={editing.id} ref={editor} initialHtml={editing.body} onChange={({ empty: e }) => setEmpty(e)} maxHeightClass="max-h-60" label="Scheduled message" />
          {editing.files.length > 0 && <p className="text-[12px] text-[var(--tm-ink-muted)]">Attachments: {editing.files.map((f) => f.name).join(', ')}</p>}
          <Input label="Send at" type="datetime-local" value={when} min={toLocalInput(new Date(Date.now() + 60_000))} onChange={(e) => setWhen(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Back
            </Button>
            <Button disabled={!valid} onClick={save}>
              Save changes
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => (
            <li key={s.id} className="rounded-2xl border border-[var(--tm-border)] p-3.5">
              <p className="mb-1.5 flex items-center gap-1.5 text-[12px] font-bold text-[var(--tm-primary-dark)]">
                <CalendarClock className="h-3.5 w-3.5" />
                {whenLabel(new Date(s.send_at))}
              </p>
              {s.body && <RichText html={s.body} className="line-clamp-4" />}
              {s.files.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-2 text-[12px] text-[var(--tm-ink-muted)]">
                  {s.files.map((f) => (
                    <span key={f.id} className="inline-flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5" />
                      {f.name}
                    </span>
                  ))}
                </p>
              )}
              <div className="mt-3 flex justify-end gap-2">
                <Button size="sm" variant="outline" leftIcon={<Pencil className="h-3.5 w-3.5" />} onClick={() => startEdit(s)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" leftIcon={<X className="h-3.5 w-3.5 text-[var(--tm-danger)]" />} onClick={() => void cancel(s)}>
                  Cancel
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
