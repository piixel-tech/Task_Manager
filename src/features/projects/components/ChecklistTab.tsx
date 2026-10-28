import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, FileText, Link2, ListChecks, Paperclip, Pencil, Plus, Trash2, X } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { checklistApi, type Checklist, type ChecklistFile, type ChecklistItem } from '../../../services/http/checklistApi';
import { formatDate } from '../../../utils/time';
import { AssetPicker } from '../../tasks/components/AssetPicker';

const when = (iso: string) => formatDate(iso, 'MMM d, h:mm a');

/** Per-subfolder checklist: text and attachments only. Any member adds and attaches; authors edit and delete their own. */
export const ChecklistTab: React.FC<{ subfolderId: string }> = ({ subfolderId }) => {
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);

  const [list, setList] = useState<Checklist | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [text, setText] = useState('');
  const [files, setFiles] = useState<Asset[]>([]);
  const uploaded = useRef<Set<string>>(new Set());
  const [attachTo, setAttachTo] = useState<ChecklistItem | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await checklistApi.list(subfolderId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the checklist');
    }
  }, [subfolderId]);

  useEffect(() => {
    load();
  }, [load]);

  // Teammates' changes arrive live.
  useEffect(
    () => socket.on('notification', (n: { type?: string; link?: string }) => n?.type === 'checklist_updated' && n.link?.includes(subfolderId) && load()),
    [subfolderId, load]
  );

  const replace = (item: ChecklistItem) =>
    setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === item.id ? item : i)) } : l));

  const saveEdit = async (item: ChecklistItem) => {
    const next = editing?.text.trim() ?? '';
    if (!next || next === item.text) return setEditing(null);
    const ok = await confirm({
      title: 'Save this change?',
      message: `“${item.text}” becomes “${next}” and the team is notified.`,
      confirmLabel: 'Save',
      action: async () => {
        replace(await checklistApi.edit(item.id, next));
      },
      successTitle: 'Item updated'
    });
    if (ok) setEditing(null);
  };

  const discardUploads = () => {
    uploaded.current.forEach((id) => assetApi.remove(id).catch(() => {}));
    uploaded.current = new Set();
    setFiles([]);
  };

  const dropFile = (next: Asset[]) => {
    files
      .filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id))
      .forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setFiles(next);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    const ok = await confirm({
      title: 'Add this item?',
      message: `“${text.trim()}” is added and the team is notified.`,
      confirmLabel: 'Add item',
      action: async () => {
        await checklistApi.add(subfolderId, text.trim(), files.map((f) => f.id));
      },
      successTitle: 'Item added'
    });
    if (ok) {
      setText('');
      setFiles([]);
      uploaded.current = new Set();
      load();
    }
  };

  const remove = (item: ChecklistItem) =>
    confirm({
      title: `Delete “${item.text}”?`,
      message: 'Its attachments are deleted too, and the team is notified.',
      confirmLabel: 'Delete item',
      danger: true,
      action: () => checklistApi.remove(item.id),
      successTitle: 'Item deleted'
    }).then((ok) => {
      if (ok) load();
    });

  const detach = (item: ChecklistItem, f: ChecklistFile) =>
    confirm({
      title: `Remove “${f.name}”?`,
      message: 'The file is deleted from this item.',
      confirmLabel: 'Remove',
      danger: true,
      action: async () => {
        replace(await checklistApi.detach(item.id, f.id));
      },
      successTitle: 'Attachment removed'
    });

  const open = (a: Asset) => assetApi.open(a).catch((err) => toast.error('Could not open the file', err.message));

  if (!list) {
    return error ? (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
    ) : (
      <SkeletonGrid count={2} />
    );
  }

  return (
    <div className="space-y-6">
      {list.can_write ? (
        <Card>
          <CardContent className="pt-6">
            <form onSubmit={add} className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <Input placeholder="Add a checklist item…" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} />
                </div>
                <Button type="submit" disabled={!text.trim()} leftIcon={<Plus className="h-4 w-4" />}>
                  Add item
                </Button>
              </div>
              <AssetPicker value={files} onChange={dropFile} onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))} />
              {files.length > 0 && !text.trim() && (
                <button type="button" onClick={discardUploads} className="text-[12px] font-semibold text-[var(--tm-danger)] hover:underline">
                  Discard attachments
                </button>
              )}
            </form>
          </CardContent>
        </Card>
      ) : (
        <p className="text-[13px] text-[var(--tm-ink-muted)]">Read-only. Only members of this subfolder can add items.</p>
      )}

      {list.items.length === 0 ? (
        <EmptyState
          icon={<ListChecks className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="The checklist is empty"
          description="Add the things this subfolder needs to get done or keep track of."
        />
      ) : (
        <Card>
          <CardContent className="space-y-1 pt-6">
            <p className="pb-2 text-[12px] font-semibold text-[var(--tm-ink-muted)]">
              {list.items.length} {list.items.length === 1 ? 'item' : 'items'}
            </p>
            <ul className="divide-y divide-[var(--tm-border)]">
              {list.items.map((item) => (
                <li key={item.id} className="flex gap-3 py-3.5">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    {editing?.id === item.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          saveEdit(item);
                        }}
                        className="flex items-center gap-2"
                      >
                        <div className="flex-1">
                          <Input
                            autoFocus
                            aria-label="Item text"
                            value={editing.text}
                            maxLength={500}
                            onChange={(e) => setEditing({ id: item.id, text: e.target.value })}
                            onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
                          />
                        </div>
                        <Button type="submit" size="sm" disabled={!editing.text.trim()} leftIcon={<Check className="h-4 w-4" />}>
                          Save
                        </Button>
                        <Button type="button" variant="ghost" size="sm" aria-label="Cancel" onClick={() => setEditing(null)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </form>
                    ) : (
                      <p className="text-[14px] font-semibold text-[var(--tm-ink)]">{item.text}</p>
                    )}
                    <p className="text-[11.5px] text-[var(--tm-ink-muted)]">
                      Added by {item.created_by?.name ?? 'someone'} · {when(item.created_at)}
                      {item.updated_at && ` · Edited ${when(item.updated_at)}`}
                    </p>

                    {item.attachments.length > 0 && (
                      <ul className="flex flex-wrap gap-2 pt-1">
                        {item.attachments.map((f) => (
                          <li key={f.id} className="flex items-center rounded-full bg-[var(--tm-card-muted)] text-[12px] font-semibold text-[var(--tm-ink)]">
                            <button
                              type="button"
                              onClick={() => open(f)}
                              title={`Attached by ${f.owner?.name ?? 'someone'} · ${when(f.created_at)}`}
                              className="flex items-center gap-2 rounded-full px-3 py-1.5 hover:bg-[var(--tm-bg-sunken)]"
                            >
                              {f.kind === 'link' ? <Link2 className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                              <span className="max-w-[180px] truncate">{f.name}</span>
                              <span className="font-normal text-[var(--tm-ink-muted)]">{f.owner?.name.split(' ')[0]}</span>
                            </button>
                            {list.can_write && (f.owner_id === me?.id || list.can_manage) && (
                              <button
                                type="button"
                                aria-label={`Remove ${f.name}`}
                                onClick={() => detach(item, f)}
                                className="pr-2.5 text-[var(--tm-ink-muted)] hover:text-[var(--tm-danger)]"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex shrink-0 items-start gap-1">
                    {list.can_write && (
                      <Button variant="ghost" size="sm" aria-label="Attach files" onClick={() => setAttachTo(item)}>
                        <Paperclip className="h-4 w-4" />
                      </Button>
                    )}
                    {item.can_edit && editing?.id !== item.id && (
                      <Button variant="ghost" size="sm" aria-label="Edit item" onClick={() => setEditing({ id: item.id, text: item.text })}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {item.can_delete && (
                      <Button variant="ghost" size="sm" aria-label="Delete item" onClick={() => remove(item)}>
                        <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AttachModal item={attachTo} onClose={() => setAttachTo(null)} onDone={load} />
    </div>
  );
};

/** Attach more files or links to an existing item. */
const AttachModal: React.FC<{ item: ChecklistItem | null; onClose: () => void; onDone: () => void }> = ({ item, onClose, onDone }) => {
  const confirm = useConfirm();
  const [files, setFiles] = useState<Asset[]>([]);
  const uploaded = useRef<Set<string>>(new Set());
  const saved = useRef(false);

  useEffect(() => {
    if (item) {
      setFiles([]);
      uploaded.current = new Set();
      saved.current = false;
    }
  }, [item]);

  const close = () => {
    if (!saved.current) uploaded.current.forEach((id) => assetApi.remove(id).catch(() => {}));
    onClose();
  };

  const change = (next: Asset[]) => {
    files
      .filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id))
      .forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setFiles(next);
  };

  const attach = async () => {
    if (!item || files.length === 0) return;
    const ok = await confirm({
      title: `Attach to “${item.text}”?`,
      message: `${files.length} ${files.length === 1 ? 'item' : 'items'} will be attached and the team notified.`,
      confirmLabel: 'Attach',
      action: async () => {
        await checklistApi.attach(item.id, files.map((f) => f.id));
      },
      successTitle: 'Attached'
    });
    if (ok) {
      saved.current = true;
      onDone();
      onClose();
    }
  };

  return (
    <Modal isOpen={!!item} onClose={close} title="Attach files or links" maxWidth="lg">
      <div className="space-y-4">
        <AssetPicker value={files} onChange={change} onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))} />
        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="button" disabled={files.length === 0} onClick={attach}>
            Attach
          </Button>
        </div>
      </div>
    </Modal>
  );
};
