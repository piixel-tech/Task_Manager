import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardList, History, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { PersonLink } from '../../../components/ui/PersonLink';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
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
  head: { label: 'Head', className: 'bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]' },
  admin: { label: 'Admin', className: 'bg-[var(--tm-warning-bg)] text-[var(--tm-warning)]' },
  member: { label: 'Team', className: 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)]' }
};

const date = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

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

  const filtered = q.trim() !== '' || subfolderId !== '';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex-1">
          <Input pill placeholder="Search requirements" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-4 w-4" />} />
        </div>
        {subfolders.length > 0 && (
          <div className="lg:w-56">
            <Select
              aria-label="Filter by subfolder"
              value={subfolderId}
              onChange={(e) => setSubfolderId(e.target.value)}
              options={[{ value: '', label: 'All subfolders' }, ...subfolders.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
        )}
        {canAdd && (
          <Button onClick={() => setForm({ requirement: null })} leftIcon={<Plus className="h-4 w-4" />}>
            New requirement
          </Button>
        )}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

      {loading ? (
        <SkeletonGrid count={2} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6 text-[var(--tm-primary)]" />}
          title={filtered ? 'No requirements match' : 'No requirements yet'}
          description={filtered ? 'Try another search or filter.' : canAdd ? 'Add what the client has asked for so the whole team can see it.' : 'Nothing has been recorded for this project yet.'}
          actionLabel={!filtered && canAdd ? 'New requirement' : undefined}
          onAction={!filtered && canAdd ? () => setForm({ requirement: null }) : undefined}
        />
      ) : (
        <>
          <ul className="space-y-4">
            {items.map((r) => {
              const badge = BADGE[r.author_badge];
              return (
                <li key={r.id} className="rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-5 shadow-soft-xs">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1.5">
                      <h3 className="text-[15.5px] font-extrabold text-[var(--tm-ink)]">{r.title}</h3>
                      <div className="flex flex-wrap items-center gap-2 text-[12px] text-[var(--tm-ink-muted)]">
                        <PersonLink userId={r.author?.id} className="flex items-center gap-2">
                          <Avatar name={r.author?.name ?? '?'} src={r.author?.avatar_url ?? undefined} size="xs" />
                          <span className="font-semibold text-[var(--tm-ink-soft)]">{r.author?.name ?? 'Former member'}</span>
                        </PersonLink>
                        <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${badge.className}`}>{badge.label}</span>
                        <span>{date(r.created_at)}</span>
                        {r.subfolder && (
                          <span className="rounded-full bg-[var(--tm-primary-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--tm-primary-dark)]">{r.subfolder.name}</span>
                        )}
                        {r.edited && <span title={`Last edited ${date(r.updated_at)}`}>· Edited</span>}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
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
                  {r.details && <p className="mt-3 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-[var(--tm-ink-soft)]">{r.details}</p>}
                  <Attachments files={r.attachments} />
                </li>
              );
            })}
          </ul>
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
