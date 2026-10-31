import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardList, File as FileIcon, FileText, History, Link2, Paperclip, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { FilterBar, FilterPill, FilterSearch } from '../../../components/ui/FilterBar';
import { PillTabs } from '../../../components/ui/PillTabs';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { Stagger, StaggerItem } from '../../../components/ui/Stagger';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { requirementApi, type Requirement, type RequirementBadge } from '../../../services/http/requirementApi';
import { Attachments } from './Attachments';
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

const KIND_ICON: Record<Kind, React.ReactNode> = {
  pdf: <FileText className="h-[18px] w-[18px]" />,
  file: <FileIcon className="h-[18px] w-[18px]" />,
  link: <Link2 className="h-[18px] w-[18px]" />,
  note: <StickyNote className="h-[18px] w-[18px]" />
};

const matchesKind = (r: Requirement, f: KindFilter) => {
  if (f === 'all') return true;
  const k = kindOf(r);
  if (f === 'files') return k === 'pdf' || k === 'file';
  if (f === 'links') return r.attachments.some((a) => a.kind === 'link') || URL_IN_TEXT.test(r.details);
  return k === 'note';
};

interface Props {
  projectId: string;
  subfolders: { id: string; name: string }[];
}

/** A project's running record of what the client asked for: search, filter, add, edit with history, admin delete. */
export const RequirementsPanel: React.FC<Props> = ({ projectId, subfolders }) => {
  const confirm = useConfirm();
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
      message: 'The requirement, its history and all of its files are deleted for good. The project heads and the author are notified.',
      confirmLabel: 'Delete requirement',
      danger: true,
      action: () => requirementApi.remove(r.id),
      successTitle: 'Requirement deleted'
    }).then((ok) => {
      if (ok) load();
    });

  const shown = useMemo(() => items.filter((r) => matchesKind(r, kind)), [items, kind]);
  const filtered = q.trim() !== '' || subfolderId !== '' || kind !== 'all';
  const activeCount = (q.trim() ? 1 : 0) + (subfolderId ? 1 : 0) + (kind !== 'all' ? 1 : 0);

  return (
    <div className="space-y-5">
      {/* Composer: opens the same form as before */}
      {canAdd && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-3 shadow-soft-sm">
          <button
            type="button"
            onClick={() => setForm({ requirement: null })}
            className="flex h-11 min-w-[220px] flex-1 items-center gap-2.5 rounded-full bg-[var(--tm-card-muted)] px-4 text-left text-[13.5px] text-[var(--tm-ink-muted)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
          >
            <Plus className="h-4 w-4 shrink-0 text-[var(--tm-primary-dark)]" />
            Add a requirement…
          </button>
          <button
            type="button"
            onClick={() => setForm({ requirement: null })}
            aria-label="Attach a file, document, PDF or link"
            title="Attach a file, document, PDF or link"
            className="grid h-11 w-11 place-items-center rounded-full border border-[var(--tm-border)] text-[var(--tm-ink-soft)] transition-colors hover:border-transparent hover:bg-[var(--tm-primary-soft)] hover:text-[var(--tm-primary-dark)]"
          >
            <Paperclip className="h-4 w-4" />
          </button>
          <Button onClick={() => setForm({ requirement: null })} leftIcon={<Plus className="h-4 w-4" />}>
            New requirement
          </Button>
        </div>
      )}

      <FilterBar activeCount={activeCount} onClear={() => { setSearch(''); setQ(''); setSubfolderId(''); setKind('all'); }}>
        <FilterSearch value={search} onChange={setSearch} placeholder="Search requirements" />
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
      </FilterBar>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {loading ? (
        <SkeletonRows count={3} />
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title={filtered ? 'No requirements match' : 'No requirements yet'}
          description={filtered ? 'Try another search or filter.' : canAdd ? 'Add what the client has asked for so the whole team can see it.' : 'Nothing has been recorded for this project yet.'}
          actionLabel={!filtered && canAdd ? 'New requirement' : undefined}
          onAction={!filtered && canAdd ? () => setForm({ requirement: null }) : undefined}
        />
      ) : (
        <>
          <Stagger key={`${kind}-${q}-${subfolderId}`} className="space-y-3" role="list">
            {shown.map((r) => {
              const badge = BADGE[r.author_badge];
              return (
                <StaggerItem key={r.id} role="listitem">
                  <article className="flex gap-3.5 rounded-[var(--tm-radius-card)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 shadow-soft-sm">
                    <span
                      aria-hidden
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]"
                    >
                      {KIND_ICON[kindOf(r)]}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                        <div className="min-w-0">
                          <h3 className="text-[15px] font-semibold text-[var(--tm-ink)]">{r.title}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11.5px] text-[var(--tm-ink-muted)]">
                            {r.subfolder && (
                              <span className="rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--tm-primary-dark)]">{r.subfolder.name}</span>
                            )}
                            {r.edited && <span title={`Last edited ${date(r.updated_at)}`}>Edited</span>}
                          </div>
                        </div>

                        {/* Who added it, and when */}
                        <div className="flex shrink-0 items-center gap-2 text-[12px] text-[var(--tm-ink-muted)]">
                          <PersonLink userId={r.author?.id} className="flex items-center gap-2">
                            <Avatar name={r.author?.name ?? '?'} src={r.author?.avatar_url ?? undefined} size="xs" />
                            <span className="font-semibold text-[var(--tm-ink-soft)]">{r.author?.name ?? 'Former member'}</span>
                          </PersonLink>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${badge.className}`}>{badge.label}</span>
                          <span className="whitespace-nowrap">{date(r.created_at)}</span>
                        </div>
                      </div>

                      {r.details && <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--tm-ink-soft)]">{r.details}</p>}
                      <Attachments files={r.attachments} />

                      {(r.edited || r.can_edit || r.can_delete) && (
                        <div className="mt-2 flex flex-wrap gap-1">
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
                      )}
                    </div>
                  </article>
                </StaggerItem>
              );
            })}
          </Stagger>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" isLoading={loadingMore} onClick={loadMore}>
                Show older ({total - items.length} more)
              </Button>
            </div>
          )}
        </>
      )}

      <RequirementFormModal
        isOpen={!!form}
        onClose={() => setForm(null)}
        projectId={projectId}
        subfolders={subfolders}
        requirement={form?.requirement}
        onSaved={load}
      />
      <RequirementHistoryModal requirement={history} onClose={() => setHistory(null)} />
    </div>
  );
};
