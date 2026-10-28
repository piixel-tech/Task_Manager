import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, Plus, Search } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import { useOfficeStore } from '../../../store/useOfficeStore';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { officeApi, type OfficeCategory, type OfficePost, type OfficeStatus } from '../../../services/http/officeApi';
import { CATEGORIES, tint } from '../officeMeta';
import { OfficePostCard } from '../components/OfficePostCard';
import { NewPostModal } from '../components/NewPostModal';

const PAGE = 20;

/** The office board: issues and notices from everyone. Resolved posts stay as history. */
export const OfficePage: React.FC = () => {
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const setUnseen = useOfficeStore((s) => s.setUnseen);

  const [status, setStatus] = useState<OfficeStatus>('open');
  const [category, setCategory] = useState<OfficeCategory | null>(null);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState(''); // the debounced search
  const [items, setItems] = useState<OfficePost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  // Always reload from the top; `latest` guards against a slow older response landing last.
  const latest = useRef(0);
  const load = useCallback(async () => {
    const id = ++latest.current;
    try {
      const res = await officeApi.list({ status, category, q, limit: PAGE });
      if (id !== latest.current) return;
      setItems(res.items);
      setTotal(res.total);
      setUnseen(res.unseen_count);
      setError(null);
    } catch (err) {
      if (id === latest.current) setError(err instanceof Error ? err.message : 'Could not load the office board');
    } finally {
      if (id === latest.current) setLoading(false);
    }
  }, [status, category, q, setUnseen]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // New and resolved posts from teammates arrive live.
  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('office_') && load()), [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await officeApi.list({ status, category, q, skip: items.length, limit: PAGE });
      setItems((cur) => [...cur, ...res.items.filter((p) => !cur.some((c) => c.id === p.id))]);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const replace = (post: OfficePost) => setItems((cur) => cur.map((p) => (p.id === post.id ? post : p)));

  // Posts that have been on screen are reported to the API in one batch.
  const pending = useRef(new Set<string>());
  const flush = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onViewed = useCallback(
    (id: string) => {
      pending.current.add(id);
      clearTimeout(flush.current);
      flush.current = setTimeout(async () => {
        const ids = [...pending.current];
        pending.current.clear();
        try {
          const { unseen_count } = await officeApi.markSeen(ids);
          setUnseen(unseen_count);
          const viewer = me && {
            id: me.id,
            name: me.name,
            avatar_url: me.avatarUrl ?? null,
            role: me.role,
            company_id: me.companyId ?? null
          };
          setItems((cur) =>
            cur.map((p) =>
              ids.includes(p.id) && p.is_new
                ? { ...p, is_new: false, seen_count: p.seen_count + 1, seen_by: viewer ? [...p.seen_by, viewer] : p.seen_by }
                : p
            )
          );
        } catch {
          // Not critical: they will be reported again next time they are viewed.
        }
      }, 500);
    },
    [me, setUnseen]
  );
  useEffect(() => () => clearTimeout(flush.current), []);

  const react = async (post: OfficePost, emoji: string) => {
    try {
      replace(await officeApi.react(post.id, emoji));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not react');
    }
  };

  const toggleResolved = (post: OfficePost) =>
    confirm({
      title: post.resolved ? 'Reopen this post?' : 'Mark as resolved?',
      message: post.resolved
        ? 'It goes back to the open list and the team is notified.'
        : 'It stays on the board as history and the team is notified.',
      confirmLabel: post.resolved ? 'Reopen' : 'Mark resolved',
      action: async () => {
        replace(await officeApi.setResolved(post.id, !post.resolved));
      },
      successTitle: post.resolved ? 'Post reopened' : 'Marked as resolved'
    }).then((ok) => {
      if (ok) load(); // it may no longer match the open/resolved tab
    });

  const filtered = status !== 'open' || category !== null || q.trim() !== '';

  return (
    <>
      <PageHeader
        title="Office board"
        description="Issues and notices for the whole office. Anything solved stays here as history."
        actions={
          <Button size="sm" onClick={() => setComposing(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New post
          </Button>
        }
      />

      <div className="space-y-3.5">
        <div className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
          <PillTabs
            activeTab={status}
            onChange={(t) => setStatus(t as OfficeStatus)}
            tabs={[
              { id: 'open', label: 'Open' },
              { id: 'resolved', label: 'Resolved' },
              { id: 'all', label: 'All' }
            ]}
          />
          <div className="lg:w-80">
            <Input pill placeholder="Search posts" value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-4 w-4" />} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Category">
          <button
            type="button"
            aria-pressed={category === null}
            onClick={() => setCategory(null)}
            className={`h-9 rounded-full border px-4 text-[12.5px] font-bold ${
              category === null
                ? 'border-[var(--tm-ink)] bg-[var(--tm-ink)] text-[var(--tm-ink-invert)]'
                : 'border-[var(--tm-border)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]'
            }`}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              aria-pressed={category === c.value}
              onClick={() => setCategory(category === c.value ? null : c.value)}
              style={category === c.value ? tint(c.accent, 18) : undefined}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-bold ${
                category === c.value ? 'text-[var(--tm-ink)]' : 'border-[var(--tm-border)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]'
              }`}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

      {loading ? (
        <SkeletonGrid count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6 text-[var(--tm-primary)]" />}
          title={filtered ? 'No posts match' : 'All quiet in the office'}
          description={filtered ? 'Try another filter or search.' : 'Nothing open right now. Spotted something? Post it.'}
          actionLabel={filtered ? undefined : 'New post'}
          onAction={filtered ? undefined : () => setComposing(true)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            {items.map((p) => (
              <OfficePostCard key={p.id} post={p} onViewed={onViewed} onReact={react} onToggleResolved={toggleResolved} />
            ))}
          </div>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" isLoading={loadingMore} onClick={loadMore}>
                Show older ({total - items.length} more)
              </Button>
            </div>
          )}
        </>
      )}

      <NewPostModal isOpen={composing} onClose={() => setComposing(false)} onPosted={load} />
    </>
  );
};
