import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, ChevronDown, Copy, Folder, FolderOpen, Pencil, Pin, Plus, Trash2, X } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { InfoTip } from '../../../components/ui/InfoTip';
import { Modal } from '../../../components/ui/Modal';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FilterBar, FilterSearch } from '../../../components/ui/FilterBar';
import { ItemCardSkeletons } from '../../../components/ui/ItemCard';
import { useAuthStore } from '../../../store/authStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { checklistApi, type Checklist, type ChecklistFile, type ChecklistItem } from '../../../services/http/checklistApi';
import { formatDate } from '../../../utils/time';
import { AssetPicker } from '../../tasks/components/AssetPicker';

const when = (iso: string) => formatDate(iso, 'MMM d');

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/** URL for links, otherwise the file extension (PDF, TXT, PNG…). */
const badgeOf = (a: Asset): string => {
  if (a.kind === 'link') return 'URL';
  const ext = a.name.includes('.') ? a.name.split('.').pop()!.toUpperCase() : '';
  return ext && ext.length <= 4 ? ext : 'FILE';
};

const sizeOf = (bytes: number): string => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

const withProtocol = (raw: string) => (/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);

const Badge: React.FC<{ asset: Asset }> = ({ asset }) => (
  <span className="inline-grid h-6 min-w-[2.5rem] shrink-0 place-items-center rounded-[var(--tm-radius-sm)] bg-[var(--tm-primary-soft)] px-1.5 text-[10px] font-extrabold tracking-wide text-[var(--tm-primary-dark)]">
    {badgeOf(asset)}
  </span>
);

const dashed =
  'inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--tm-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)] disabled:opacity-60';

const iconBtn =
  'grid h-8 w-8 shrink-0 place-items-center rounded-full text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]';

type NameDialog = { mode: 'new' } | { mode: 'rename'; item: ChecklistItem };

/** "Essentials" of a subfolder: pinned quick-access tiles and expandable folders of files and links. Any member adds; authors rename and delete their own. */
export const ChecklistTab: React.FC<{ subfolderId: string }> = ({ subfolderId }) => {
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);

  const [list, setList] = useState<Checklist | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<NameDialog | null>(null);
  const [name, setName] = useState('');
  /** Files and links picked in the New item form; uploads made there are removed again if it is cancelled. */
  const [newAssets, setNewAssets] = useState<Asset[]>([]);
  const madeHere = useRef<Set<string>>(new Set());
  const kept = useRef(false);
  const [linkFor, setLinkFor] = useState<string | null>(null);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [dragOver, setDragOver] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pickFor = useRef<ChecklistItem | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await checklistApi.list(subfolderId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the essentials');
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

  const replace = (item: ChecklistItem) => setList((l) => (l ? { ...l, items: l.items.map((i) => (i.id === item.id ? item : i)) } : l));
  const expand = (id: string, on?: boolean) =>
    setOpen((cur) => {
      const next = new Set(cur);
      if (on ?? !next.has(id)) next.add(id);
      else next.delete(id);
      return next;
    });

  const openAsset = (a: Asset, siblings?: Asset[]) => assetApi.open(a, siblings).catch((err) => toast.error('Could not open the file', err.message));

  // --- New item / rename ---------------------------------------------------------------------------
  const startDialog = (d: NameDialog) => {
    setName(d.mode === 'rename' ? d.item.text : '');
    setNewAssets([]);
    madeHere.current = new Set();
    kept.current = false;
    setDialog(d);
  };

  const closeDialog = () => {
    if (!kept.current) madeHere.current.forEach((id) => assetApi.remove(id).catch(() => {}));
    madeHere.current = new Set();
    setNewAssets([]);
    setDialog(null);
  };

  const changeNewAssets = (next: Asset[]) => {
    newAssets
      .filter((a) => madeHere.current.has(a.id) && !next.some((n) => n.id === a.id))
      .forEach((a) => assetApi.remove(a.id).catch(() => {}));
    setNewAssets(next);
  };

  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    const next = name.trim();
    if (!dialog || !next) return;
    if (dialog.mode === 'new') {
      let createdId = '';
      const ok = await confirm({
        title: 'Add this item?',
        message: `“${next}” is added${newAssets.length ? ` with ${plural(newAssets.length, 'attachment')}` : ''} and the team is notified.`,
        confirmLabel: 'Add item',
        action: async () => {
          createdId = (await checklistApi.add(subfolderId, next, newAssets.map((a) => a.id))).id;
        },
        successTitle: 'Item added'
      });
      if (ok) {
        kept.current = true; // the item owns these files now
        setDialog(null);
        setNewAssets([]);
        await load();
        expand(createdId, true);
      }
      return;
    }
    const item = dialog.item;
    if (next === item.text) return setDialog(null);
    const ok = await confirm({
      title: 'Save this change?',
      message: `“${item.text}” becomes “${next}” and the team is notified.`,
      confirmLabel: 'Save',
      action: async () => {
        replace(await checklistApi.edit(item.id, next));
      },
      successTitle: 'Item updated'
    });
    if (ok) setDialog(null);
  };

  // --- Pin, delete -----------------------------------------------------------------------------------
  const togglePin = async (item: ChecklistItem) => {
    try {
      const next = await checklistApi.pin(item.id);
      replace(next);
      toast.success(next.pinned ? 'Pinned to Quick access' : 'Unpinned');
    } catch (err) {
      toast.error('Could not change the pin', err instanceof Error ? err.message : undefined);
    }
  };

  const remove = (item: ChecklistItem) =>
    confirm({
      title: `Delete “${item.text}”?`,
      message: 'Its files and links are deleted too, and the team is notified.',
      confirmLabel: 'Delete item',
      danger: true,
      action: () => checklistApi.remove(item.id),
      successTitle: 'Item deleted'
    }).then((ok) => {
      if (ok) load();
    });

  // --- Files and links inside an item ----------------------------------------------------------
  const attachAssets = async (item: ChecklistItem, what: string, make: () => Promise<Asset[]>) => {
    const ok = await confirm({
      title: `Add to “${item.text}”?`,
      message: `${what} will be added and the team notified.`,
      confirmLabel: 'Add',
      action: async () => {
        const assets = await make();
        if (assets.length === 0) return;
        try {
          replace(await checklistApi.attach(item.id, assets.map((a) => a.id)));
        } catch (err) {
          assets.forEach((a) => assetApi.remove(a.id).catch(() => {})); // never leave them orphaned
          throw err;
        }
      },
      successTitle: 'Added'
    });
    if (ok) expand(item.id, true);
    return ok;
  };

  const addFiles = (item: ChecklistItem, files: File[]) => {
    if (files.length === 0) return;
    void attachAssets(item, plural(files.length, 'file'), () => assetApi.upload(files));
  };

  const addLink = async (item: ChecklistItem, e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    const url = withProtocol(linkUrl);
    const title = linkTitle.trim() || url;
    const ok = await attachAssets(item, 'The link', async () => [await assetApi.addLink(title, url)]);
    if (ok) {
      setLinkFor(null);
      setLinkTitle('');
      setLinkUrl('');
    }
  };

  const detach = (item: ChecklistItem, f: ChecklistFile) =>
    confirm({
      title: `Remove “${f.name}”?`,
      message: f.kind === 'link' ? 'The link is removed from this item.' : 'The file is deleted from this item.',
      confirmLabel: 'Remove',
      danger: true,
      action: async () => {
        replace(await checklistApi.detach(item.id, f.id));
      },
      successTitle: 'Removed'
    });

  const copy = (f: ChecklistFile) =>
    navigator.clipboard
      .writeText(f.url)
      .then(() => toast.success('Link copied'))
      .catch(() => toast.error('Could not copy the link'));

  const q = search.trim().toLowerCase();
  const shown = useMemo(
    () => (list ? list.items.filter((i) => !q || i.text.toLowerCase().includes(q) || i.attachments.some((f) => f.name.toLowerCase().includes(q))) : []),
    [list, q]
  );
  const pinned = useMemo(() => (list ? list.items.filter((i) => i.pinned) : []), [list]);

  if (!list) {
    return error ? <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div> : <ItemCardSkeletons count={3} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-1.5 text-[20px] font-extrabold leading-tight text-[var(--tm-ink)]">
            Essentials
            <InfoTip topic="sub-essentials">The links and files this team keeps coming back to, like briefs and brand kits. Pin one to find it in a click.</InfoTip>
          </h2>
          <p data-hint className="mt-1 text-[13px] text-[var(--tm-ink-muted)]">Everything the team keeps coming back to — one click away.</p>
        </div>
        {list.can_write && (
          <Button onClick={() => startDialog({ mode: 'new' })} leftIcon={<Plus className="h-4 w-4" />}>
            New item
          </Button>
        )}
      </div>

      {!list.can_write && <p className="text-[13px] text-[var(--tm-ink-muted)]">Read-only. Only members of this subfolder can add items.</p>}

      {pinned.length > 0 && (
        <section aria-label="Quick access">
          <h3 className="mb-3 px-1 text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">Quick access</h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4 max-sm:gap-2.5">
            {pinned.map((item) => {
              const first = item.attachments[0];
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => (first ? openAsset(first, item.attachments) : expand(item.id, true))}
                    className="group flex h-full w-full flex-col gap-2 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 text-left shadow-soft-sm transition-[border-color,box-shadow] hover:border-[var(--tm-primary-light)] hover:shadow-soft"
                  >
                    <span className="flex items-center justify-between gap-2">
                      {first ? <Badge asset={first} /> : <Folder className="h-5 w-5 text-[var(--tm-ink-soft)]" />}
                      <ArrowUpRight className="h-4 w-4 text-[var(--tm-ink-muted)] transition-colors group-hover:text-[var(--tm-primary-dark)]" />
                    </span>
                    <span className="truncate text-[14px] font-bold text-[var(--tm-ink)]">{item.text}</span>
                    <span className="truncate text-[12px] text-[var(--tm-ink-muted)]">{first ? first.name : 'Nothing added yet'}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {list.items.length >= 6 && (
        <FilterBar activeCount={q ? 1 : 0} onClear={() => setSearch('')}>
          <FilterSearch value={search} onChange={setSearch} placeholder="Search essentials" />
        </FilterBar>
      )}

      {list.items.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title="No essentials yet"
          description="Add the links and files this team keeps coming back to."
        />
      ) : shown.length === 0 ? (
        <EmptyState icon={<FolderOpen className="h-6 w-6 text-[var(--tm-primary-dark)]" />} title="No items match" description="Try another search." />
      ) : (
        <section aria-label="Essentials">
          <ul className="divide-y divide-[var(--tm-border)] overflow-hidden rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] shadow-soft-sm">
            {shown.map((item) => {
              const isOpen = open.has(item.id);
              const files = item.attachments.filter((a) => a.kind !== 'link').length;
              const links = item.attachments.length - files;
              return (
                <li
                  key={item.id}
                  onDragOver={(e) => {
                    if (!list.can_write || !e.dataTransfer.types.includes('Files')) return;
                    e.preventDefault();
                    setDragOver(item.id);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver((d) => (d === item.id ? null : d));
                  }}
                  onDrop={(e) => {
                    if (!list.can_write) return;
                    e.preventDefault();
                    setDragOver(null);
                    expand(item.id, true);
                    addFiles(item, Array.from(e.dataTransfer.files));
                  }}
                  className={dragOver === item.id ? 'bg-[var(--tm-primary-softer)] ring-2 ring-inset ring-[var(--tm-primary)]' : ''}
                >
                  <div className="flex items-center gap-1 pr-3">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => expand(item.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3.5 text-left"
                    >
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]">
                        {isOpen ? <FolderOpen className="h-[18px] w-[18px]" /> : <Folder className="h-[18px] w-[18px]" />}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[14.5px] font-bold text-[var(--tm-ink)]">{item.text}</span>
                          {item.pinned && (
                            <span className="shrink-0 rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-primary-dark)]">Pinned</span>
                          )}
                        </span>
                        <span className="block truncate text-[12px] text-[var(--tm-ink-muted)]">
                          {plural(files, 'file')} · {plural(links, 'link')} · added by {item.created_by?.name ?? 'a former member'}, {when(item.created_at)}
                        </span>
                      </span>
                    </button>
                    {list.can_write && (
                      <button
                        type="button"
                        aria-label={item.pinned ? 'Unpin' : 'Pin'}
                        title={item.pinned ? 'Unpin' : 'Pin to Quick access'}
                        aria-pressed={item.pinned}
                        onClick={() => togglePin(item)}
                        className={`${iconBtn} ${item.pinned ? 'text-[var(--tm-primary-dark)]' : ''}`}
                      >
                        <Pin className={`h-4 w-4 ${item.pinned ? 'fill-current' : ''}`} />
                      </button>
                    )}
                    {item.can_edit && (
                      <button type="button" aria-label="Rename" title="Rename" onClick={() => startDialog({ mode: 'rename', item })} className={iconBtn}>
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    {item.can_delete && (
                      <button type="button" aria-label="Delete" title="Delete" onClick={() => remove(item)} className={`${iconBtn} hover:text-[var(--tm-danger)]`}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    <button type="button" aria-label={isOpen ? 'Collapse' : 'Expand'} onClick={() => expand(item.id)} className={iconBtn}>
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  {isOpen && (
                    <div className="space-y-3 px-4 pb-4 pl-[4.25rem]">
                      {item.attachments.length === 0 ? (
                        <p className="text-[12.5px] text-[var(--tm-ink-muted)]">Nothing here yet.{list.can_write ? ' Drop files on this folder, or add a file or link.' : ''}</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {item.attachments.map((f) => (
                            <li key={f.id} className="flex items-center gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-3 py-2">
                              <Badge asset={f} />
                              <button
                                type="button"
                                onClick={() => openAsset(f, item.attachments)}
                                title={`Added by ${f.owner?.name ?? 'someone'} · ${when(f.created_at)}`}
                                className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-[var(--tm-ink)] hover:underline"
                              >
                                {f.name}
                              </button>
                              <span className="shrink-0 text-[12px] text-[var(--tm-ink-muted)]">{f.kind === 'link' ? 'link' : sizeOf(f.size)}</span>
                              {f.kind === 'link' && (
                                <button
                                  type="button"
                                  onClick={() => copy(f)}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]"
                                >
                                  <Copy className="h-3.5 w-3.5" /> Copy link
                                </button>
                              )}
                              {list.can_write && (f.owner_id === me?.id || list.can_manage) && (
                                <button
                                  type="button"
                                  aria-label={`Remove ${f.name}`}
                                  onClick={() => detach(item, f)}
                                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--tm-ink-muted)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-danger)]"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}

                      {list.can_write &&
                        (linkFor === item.id ? (
                          <form noValidate onSubmit={(e) => addLink(item, e)} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
                            <Input placeholder="Link title (optional)" aria-label="Link title" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
                            <Input autoFocus placeholder="https://…" aria-label="Link address" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
                            <Button type="submit" size="sm" disabled={!linkUrl.trim()}>
                              Add link
                            </Button>
                            <Button type="button" size="sm" variant="ghost" onClick={() => setLinkFor(null)}>
                              Cancel
                            </Button>
                          </form>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className={dashed}
                              onClick={() => {
                                pickFor.current = item;
                                picker.current?.click();
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" /> File
                            </button>
                            <button
                              type="button"
                              className={dashed}
                              onClick={() => {
                                setLinkTitle('');
                                setLinkUrl('');
                                setLinkFor(item.id);
                              }}
                            >
                              <Plus className="h-3.5 w-3.5" /> Link
                            </button>
                          </div>
                        ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {list.can_write && <p className="px-1 text-center text-[12px] text-[var(--tm-ink-muted)]">Up to 25 MB each · executables blocked</p>}

      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        aria-label="Choose files"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (pickFor.current) addFiles(pickFor.current, files);
        }}
      />

      <Modal
        isOpen={!!dialog}
        onClose={closeDialog}
        title={dialog?.mode === 'rename' ? 'Rename item' : 'New item'}
        description={dialog?.mode === 'rename' ? undefined : 'Name it and attach files or links, all in one step.'}
        maxWidth="md"
      >
        <form noValidate onSubmit={submitName} className="space-y-4">
          <Input autoFocus label="Name" placeholder="e.g. Brand kit" value={name} maxLength={500} onChange={(e) => setName(e.target.value)} />
          {dialog?.mode === 'new' && <AssetPicker value={newAssets} onChange={changeNewAssets} onUploaded={(ids) => ids.forEach((id) => madeHere.current.add(id))} />}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {dialog?.mode === 'rename' ? 'Save' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
