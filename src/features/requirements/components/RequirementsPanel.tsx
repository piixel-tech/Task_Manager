import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ClipboardList, Download, History, Link2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { AssetDownloadButton } from '../../../components/ui/AssetDownloadButton';
import { AuthImage } from '../../../components/ui/AuthImage';
import { PersonLink } from '../../../components/ui/PersonLink';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FilterPill } from '../../../components/ui/FilterBar';
import { useMasterSelection } from '../../../components/ui/MasterDetail';
import { Input } from '../../../components/ui/Input';
import { PillTabs } from '../../../components/ui/PillTabs';
import { InfoTip } from '../../../components/ui/InfoTip';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../../store/authStore';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { assetApi, type Asset } from '../../../services/http/taskApi';
import { requirementApi, type Requirement, type RequirementBadge } from '../../../services/http/requirementApi';
import { TaskFormModal, type TaskPrefill } from '../../tasks/components/TaskFormModal';
import { RequirementFormModal } from './RequirementFormModal';
import { RequirementHistoryModal } from './RequirementHistoryModal';

const PAGE = 20;

const BADGE: Record<RequirementBadge, { label: string; className: string }> = {
  client: { label: 'Client', className: 'bg-[var(--tm-info-bg)] text-[var(--tm-info)]' },
  head: { label: 'Team', className: 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)]' }, // Head is per subfolder, so no "Head" label here
  admin: { label: 'Admin', className: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]' },
  member: { label: 'Team', className: 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)]' }
};

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

type Kind = 'pdf' | 'file' | 'link' | 'note';
type KindFilter = 'all' | 'files' | 'links' | 'notes';

const URL_IN_TEXT = /https?:\/\/\S+/i;

/** What a requirement is, read from what is already on it: its files, link attachments and any address in the text. */
const kindOf = (r: Requirement): Kind => {
  if (r.attachments.some((a) => a.mime === 'application/pdf' || a.name.toLowerCase().endsWith('.pdf'))) return 'pdf';
  if (r.attachments.some((a) => a.kind === 'upload')) return 'file';
  if (r.attachments.some((a) => a.kind === 'link') || URL_IN_TEXT.test(r.details)) return 'link';
  return 'note';
};

const matchesKind = (r: Requirement, f: KindFilter) => {
  if (f === 'all') return true;
  const k = kindOf(r);
  if (f === 'files') return k === 'pdf' || k === 'file';
  if (f === 'links') return r.attachments.some((a) => a.kind === 'link') || URL_IN_TEXT.test(r.details);
  return k === 'note';
};

const filesOf = (r: Requirement) => r.attachments.filter((a) => a.kind !== 'link');
const linksOf = (r: Requirement) => r.attachments.filter((a) => a.kind === 'link');

/** NOTE, LINK or "2 FILES": the small badge on a list row. */
const badgeLabel = (r: Requirement): string => {
  const n = filesOf(r).length;
  if (n > 0) return `${n} ${n === 1 ? 'FILE' : 'FILES'}`;
  return kindOf(r) === 'link' ? 'LINK' : 'NOTE';
};

/**
 * The notes as shown: blank lines squeezed and list markers with nothing after them ("1.", "2.", "-")
 * dropped, so an empty note never turns into a row of empty numbers or bullets. Empty gives "".
 */
export const cleanNotes = (details: string): string =>
  details
    .split('\n')
    .filter((line) => !/^\s*(\d+[.)]|[-*•])\s*$/.test(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const sizeOf = (bytes: number): string => (bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const extOf = (name: string): string => {
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : '';
  return ext && ext.length <= 4 ? ext : 'FILE';
};
const hostOf = (url: string): string => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const dashed =
  'inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--tm-border)] px-3 py-1.5 text-[12.5px] font-semibold text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)] disabled:opacity-60';

interface Props {
  projectId: string;
  subfolders: { id: string; name: string }[];
}

/** A project's running record of what the client asked for: a list on the left, the chosen requirement on the right. */
export const RequirementsPanel: React.FC<Props> = ({ projectId, subfolders }) => {
  const confirm = useConfirm();
  const navigate = useNavigate();
  const me = useAuthStore((s) => s.user);
  const prefix = me?.role === 'admin' ? '/admin' : '/app';
  const canMakeTask = me?.role === 'admin' || me?.role === 'employee';

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [subfolderId, setSubfolderId] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [items, setItems] = useState<Requirement[]>([]);
  const [total, setTotal] = useState(0);
  const [canAdd, setCanAdd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ requirement: Requirement | null } | null>(null);
  const [history, setHistory] = useState<Requirement | null>(null);
  const [taskFrom, setTaskFrom] = useState<TaskPrefill | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkTitle, setLinkTitle] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const picker = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const latest = useRef(0); // ignore a slow older response that lands after a newer one
  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const res = await requirementApi.list(projectId, { q, subfolder_id: subfolderId, limit: PAGE });
      if (id !== latest.current) return;
      setItems(res.items);
      setTotal(res.total);
      setCanAdd(res.can_add);
      setError(null);
    } catch (err) {
      if (id === latest.current) setError(err instanceof Error ? err.message : 'Could not load the requirements');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [projectId, q, subfolderId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Teammates' and the client's changes arrive live.
  useEffect(
    () =>
      socket.on('notification', (n: { type?: string; link?: string }) => {
        if (n?.type?.startsWith('requirement_') && n.link?.includes(projectId)) load();
      }),
    [projectId, load]
  );

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await requirementApi.list(projectId, { q, subfolder_id: subfolderId, skip: items.length, limit: PAGE });
      setItems((cur) => [...cur, ...res.items.filter((r) => !cur.some((c) => c.id === r.id))]);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const remove = (r: Requirement) =>
    confirm({
      title: `Delete “${r.title}”?`,
      message: 'The requirement, its history and all of its files are deleted for everyone, and the project heads and the author are notified. An admin can restore it from the Trash for 30 days.',
      confirmLabel: 'Delete requirement',
      danger: true,
      action: () => requirementApi.remove(r.id),
      successTitle: 'Requirement deleted'
    }).then((ok) => {
      if (ok) load();
    });

  // --- Adding to the open requirement (saved as an edit, so the earlier version stays in the history) ---
  const addAssets = async (r: Requirement, what: string, make: () => Promise<Asset[]>) => {
    const ok = await confirm({
      title: `Add to “${r.title}”?`,
      message: `${what} will be added. The earlier version stays in the history and the project heads are notified.`,
      confirmLabel: 'Add',
      action: async () => {
        const assets = await make();
        if (assets.length === 0) return;
        try {
          await requirementApi.edit(r.id, { attachment_ids: [...r.attachments.map((a) => a.id), ...assets.map((a) => a.id)] });
        } catch (err) {
          assets.forEach((a) => assetApi.remove(a.id).catch(() => {})); // never leave them orphaned
          throw err;
        }
      },
      successTitle: 'Added'
    });
    if (ok) load();
    return ok;
  };

  const addLink = async (r: Requirement, e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) return;
    const url = /^https?:\/\//i.test(linkUrl.trim()) ? linkUrl.trim() : `https://${linkUrl.trim()}`;
    const title = linkTitle.trim() || url;
    if (await addAssets(r, 'The link', async () => [await assetApi.addLink(title, url)])) {
      setLinkOpen(false);
      setLinkTitle('');
      setLinkUrl('');
    }
  };

  const downloadAll = async (files: Asset[]) => {
    for (const f of files) await assetApi.download(f).catch((err) => toast.error('Could not download the file', err.message));
  };

  const makeTask = (r: Requirement) => {
    const notes = cleanNotes(r.details);
    const files = r.attachments.length;
    setTaskFrom({
      title: r.title.slice(0, 200),
      description: notes ? notes.split(/\n+/).map((l) => `<p>${escapeHtml(l)}</p>`).join('') : '<p>See the attached requirement files.</p>',
      projectId: r.project_id,
      subfolderId: r.subfolder?.id,
      requirementId: r.id,
      filesNote: files ? `The ${files} ${files === 1 ? 'file or link' : 'files and links'} from this requirement ${files === 1 ? 'is' : 'are'} attached to the task as copies.` : undefined
    });
  };

  const shown = useMemo(() => items.filter((r) => matchesKind(r, kind)), [items, kind]);
  const fromClient = useMemo(() => shown.filter((r) => r.author_badge === 'client'), [shown]);
  const fromTeam = useMemo(() => shown.filter((r) => r.author_badge !== 'client'), [shown]);
  const ordered = useMemo(() => [...fromClient, ...fromTeam], [fromClient, fromTeam]);
  const { selected, open, select, back } = useMasterSelection(ordered);

  const filtered = q.trim() !== '' || subfolderId !== '' || kind !== 'all';

  const row = (r: Requirement) => {
    const on = r.id === selected?.id;
    return (
      <li key={r.id}>
        <button
          type="button"
          onClick={() => select(r.id)}
          aria-current={on}
          className={`flex w-full items-start gap-3 rounded-[var(--tm-radius-md)] px-3 py-2.5 text-left transition-colors ${
            on ? 'bg-[var(--tm-primary-soft)]' : 'hover:bg-[var(--tm-bg-sunken)]'
          }`}
        >
          <span className="mt-0.5 inline-grid h-6 min-w-[3rem] shrink-0 place-items-center rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] px-1.5 text-[10px] font-extrabold tracking-wide text-[var(--tm-ink-soft)]">
            {badgeLabel(r)}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13.5px] font-bold text-[var(--tm-ink)]">{r.title}</span>
            <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">
              {[r.author?.name ?? 'Former member', r.subfolder?.name, shortDate(r.created_at)].filter(Boolean).join(' · ')}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const group = (label: string, rows: Requirement[]) =>
    rows.length > 0 && (
      <section key={label} aria-label={label}>
        <h4 className="mb-1 px-3 text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">
          {label} <span className="tabular-nums">· {rows.length}</span>
        </h4>
        <ul className="space-y-0.5">{rows.map(row)}</ul>
      </section>
    );

  const detail = (r: Requirement) => {
    const badge = BADGE[r.author_badge];
    const files = filesOf(r);
    const links = linksOf(r);
    const notes = cleanNotes(r.details);
    return (
      <article className="rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-5 shadow-soft-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-[11.5px] font-bold">
            <span className="rounded-full bg-[var(--tm-primary-soft)] px-2.5 py-0.5 text-[var(--tm-primary-dark)]">{r.subfolder?.name ?? 'Whole project'}</span>
            <span className="rounded-full bg-[var(--tm-card-muted)] px-2.5 py-0.5 text-[var(--tm-ink-soft)]">
              {files.length} {files.length === 1 ? 'file' : 'files'}
            </span>
            <span className="rounded-full bg-[var(--tm-card-muted)] px-2.5 py-0.5 text-[var(--tm-ink-soft)]">
              {links.length} {links.length === 1 ? 'link' : 'links'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {canMakeTask && (
              <Button variant="outline" size="sm" onClick={() => makeTask(r)} rightIcon={<ArrowRight className="h-4 w-4" />}>
                Make task
              </Button>
            )}
            {r.edited && (
              <Button variant="ghost" size="sm" onClick={() => setHistory(r)} leftIcon={<History className="h-4 w-4" />}>
                History ({r.version_count})
              </Button>
            )}
            {r.can_edit && (
              <Button variant="ghost" size="sm" aria-label={`Edit ${r.title}`} onClick={() => setForm({ requirement: r })}>
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {r.can_delete && (
              <Button variant="ghost" size="sm" aria-label={`Delete ${r.title}`} onClick={() => remove(r)}>
                <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
              </Button>
            )}
          </div>
        </div>

        <h2 className="mt-3 break-words text-[22px] font-extrabold leading-tight text-[var(--tm-ink)]">{r.title}</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--tm-ink-muted)]">
          <PersonLink userId={r.author?.id} className="flex items-center gap-2">
            <Avatar name={r.author?.name ?? '?'} src={r.author?.avatar_url ?? undefined} size="xs" />
            <span className="font-semibold text-[var(--tm-ink-soft)]">{r.author?.name ?? 'Former member'}</span>
          </PersonLink>
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>{badge.label}</span>
          <span>{date(r.created_at)}</span>
          {r.edited && <span title={`Last edited ${date(r.updated_at)}`}>· Edited</span>}
        </div>

        <section className="mt-6" aria-label="Notes">
          <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">Notes</h3>
          {notes ? (
            <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--tm-ink)]">{notes}</p>
          ) : (
            <p className="text-[13.5px] italic text-[var(--tm-ink-muted)]">No notes…</p>
          )}
        </section>

        {files.length > 0 && (
          <section className="mt-6" aria-label="Files">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">Files</h3>
              {files.length > 1 && (
                <Button variant="ghost" size="sm" onClick={() => downloadAll(files)} leftIcon={<Download className="h-4 w-4" />}>
                  Download all
                </Button>
              )}
            </div>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {files.map((f) => (
                <li key={f.id} className="overflow-hidden rounded-[var(--tm-radius-md)] border border-[var(--tm-border)] bg-[var(--tm-card)]">
                  <button type="button" onClick={() => void assetApi.open(f, files)} aria-label={`Preview ${f.name}`} className="block w-full text-left">
                    {f.mime.startsWith('image/') ? (
                      <AuthImage url={f.url} alt={f.name} className="h-28 w-full object-cover" />
                    ) : (
                      <div className="grid h-28 w-full place-items-center bg-[var(--tm-card-muted)]">
                        <span className="rounded-[var(--tm-radius-sm)] bg-[var(--tm-primary-soft)] px-3 py-1.5 text-[13px] font-extrabold tracking-wide text-[var(--tm-primary-dark)]">{extOf(f.name)}</span>
                      </div>
                    )}
                  </button>
                  <div className="flex items-center gap-2 px-3 py-2">
                    <button type="button" onClick={() => void assetApi.open(f, files)} className="min-w-0 flex-1 text-left" title={f.name}>
                      <span className="block truncate text-[12.5px] font-semibold text-[var(--tm-ink)] hover:underline">{f.name}</span>
                      <span className="block text-[11.5px] text-[var(--tm-ink-muted)]">{sizeOf(f.size)}</span>
                    </button>
                    <AssetDownloadButton asset={f} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {links.length > 0 && (
          <section className="mt-6" aria-label="Links">
            <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">Links</h3>
            <ul className="space-y-1.5">
              {links.map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => assetApi.open(l).catch((err) => toast.error('Could not open the link', err.message))}
                    className="flex w-full items-center gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-3 py-2 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                  >
                    <Link2 className="h-4 w-4 shrink-0 text-[var(--tm-ink-soft)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-[var(--tm-ink)]">{l.name}</span>
                      <span className="block truncate text-[11.5px] text-[var(--tm-ink-muted)]">{hostOf(l.url)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {r.can_edit &&
          (linkOpen ? (
            <form noValidate onSubmit={(e) => addLink(r, e)} className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_auto_auto]">
              <Input placeholder="Link title (optional)" aria-label="Link title" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
              <Input autoFocus placeholder="https://…" aria-label="Link address" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <Button type="submit" size="sm" disabled={!linkUrl.trim()}>
                Add link
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setLinkOpen(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <div className="mt-6 flex flex-wrap gap-2">
              <button type="button" className={dashed} onClick={() => picker.current?.click()}>
                <Plus className="h-3.5 w-3.5" /> File
              </button>
              <button type="button" className={dashed} onClick={() => setLinkOpen(true)}>
                <Plus className="h-3.5 w-3.5" /> Link
              </button>
              <button type="button" className={dashed} onClick={() => setForm({ requirement: r })}>
                <Plus className="h-3.5 w-3.5" /> Note
              </button>
            </div>
          ))}
      </article>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-1.5 text-[15px] font-semibold text-[var(--tm-ink)]">
            Requirements <span className="tabular-nums text-[var(--tm-ink-muted)]">· {total}</span>
            <InfoTip topic="sub-requirements">A running list of what the client asked for. Anyone on the project can read it, and every edit keeps the earlier version.</InfoTip>
          </h2>
          <p data-hint className="mt-0.5 text-[13px] text-[var(--tm-ink-muted)]">What the client asked for, in one place.</p>
        </div>
        {canAdd && (
          <Button onClick={() => setForm({ requirement: null })} leftIcon={<Plus className="h-4 w-4" />}>
            New requirement
          </Button>
        )}
      </div>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section
          aria-label="Requirements list"
          className={`min-w-0 flex-col gap-3 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-4 shadow-soft-xs ${open ? 'hidden lg:flex' : 'flex'}`}
        >
          {canAdd && (
            <button
              type="button"
              onClick={() => setForm({ requirement: null })}
              className="flex h-11 items-center gap-2.5 rounded-full bg-[var(--tm-card-muted)] px-4 text-left text-[13.5px] text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
            >
              <Plus className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" />
              Add a requirement…
            </button>
          )}

          <label className="flex h-11 items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-[var(--tm-ink-muted)] transition-[border-color,box-shadow] focus-within:border-[var(--tm-primary-light)] focus-within:shadow-glow">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requirements"
              aria-label="Search requirements"
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <PillTabs
              size="sm"
              activeTab={kind}
              onChange={(id) => setKind(id as KindFilter)}
              tabs={[
                { id: 'all', label: 'All' },
                { id: 'files', label: 'Files' },
                { id: 'links', label: 'Links' },
                { id: 'notes', label: 'Notes' }
              ]}
            />
            {subfolders.length > 0 && (
              <FilterPill
                label="Subfolder"
                value={subfolderId}
                onChange={setSubfolderId}
                options={[{ value: '', label: 'All subfolders' }, ...subfolders.map((s) => ({ value: s.id, label: s.name }))]}
              />
            )}
          </div>

          <div className="max-h-[calc(100dvh-20rem)] min-h-[200px] space-y-4 overflow-y-auto pr-1">
            {loading ? (
              <SkeletonRows count={4} />
            ) : ordered.length === 0 ? (
              <EmptyState
                size="compact"
                title={filtered ? 'No requirements match' : 'No requirements yet'}
                description={filtered ? 'Try another search or filter.' : 'What the client asks for is recorded here.'}
                actionLabel={!filtered && canAdd ? 'New requirement' : undefined}
                onAction={!filtered && canAdd ? () => setForm({ requirement: null }) : undefined}
              />
            ) : (
              <>
                {group('From client', fromClient)}
                {group('From team', fromTeam)}
                {items.length < total && (
                  <div className="flex justify-center">
                    <Button variant="outline" size="sm" isLoading={loadingMore} onClick={loadMore}>
                      Show older ({total - items.length} more)
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        <div className={`min-w-0 ${open ? 'block' : 'hidden lg:block'}`}>
          <button
            type="button"
            onClick={back}
            className="mb-3 inline-flex items-center gap-1 rounded-full px-3 py-2 text-[13px] font-bold text-[var(--tm-ink)] hover:bg-[var(--tm-bg-sunken)] lg:hidden"
          >
            <ChevronLeft className="h-4 w-4" /> All
          </button>
          {loading ? null : !selected ? (
            <EmptyState
              icon={<ClipboardList className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
              title={filtered ? 'No requirements match' : 'No requirements yet'}
              description={filtered ? 'Try another search or filter.' : canAdd ? 'Add what the client has asked for so the whole team can see it.' : 'Nothing has been recorded for this project yet.'}
              actionLabel={!filtered && canAdd ? 'New requirement' : undefined}
              onAction={!filtered && canAdd ? () => setForm({ requirement: null }) : undefined}
            />
          ) : (
            <div key={selected.id} className="animate-fade-in">
              {detail(selected)}
            </div>
          )}
        </div>
      </div>

      <input
        ref={picker}
        type="file"
        multiple
        className="hidden"
        aria-label="Choose files"
        onChange={(e) => {
          const chosen = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (selected && chosen.length) void addAssets(selected, `${chosen.length} ${chosen.length === 1 ? 'file' : 'files'}`, () => assetApi.upload(chosen));
        }}
      />

      <RequirementFormModal
        isOpen={!!form}
        onClose={() => setForm(null)}
        projectId={projectId}
        subfolders={subfolders}
        requirement={form?.requirement}
        onSaved={load}
      />
      <RequirementHistoryModal requirement={history} onClose={() => setHistory(null)} />
      <TaskFormModal
        isOpen={!!taskFrom}
        onClose={() => setTaskFrom(null)}
        prefill={taskFrom}
        onSaved={(t) => navigate(`${prefix}/tasks/${t.id}`)}
      />
    </div>
  );
};
