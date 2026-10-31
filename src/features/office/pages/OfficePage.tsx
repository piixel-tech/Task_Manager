import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Megaphone, Plus } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { FilterBar, FilterSearch } from '../../../components/ui/FilterBar';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { FadeIn } from '../../../components/ui/FadeIn';
import { useOfficeStore } from '../../../store/useOfficeStore';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { officeApi, type OfficePost, type OfficeStatus } from '../../../services/http/officeApi';
import { OfficePostCard } from '../components/OfficePostCard';
import { useOfficePostActions } from '../useOfficePostActions';
import { NewPostModal } from '../components/NewPostModal';

const PAGE = 20;

/** The office board: issues and notices from everyone. Resolved posts stay as history. */
export const OfficePage: React.FC = () => {
  const setUnseen = useOfficeStore((s) => s.setUnseen);

  const [status, setStatus] = useState<OfficeStatus>('open');
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
      const res = await officeApi.list({ status, category: null, q, limit: PAGE });
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
  }, [status, q, setUnseen]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // New and resolved posts from teammates arrive live.
  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('office_') && load()), [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await officeApi.list({ status, category: null, q, skip: items.length, limit: PAGE });
      setItems((cur) => [...cur, ...res.items.filter((p) => !cur.some((c) => c.id === p.id))]);
      setTotal(res.total);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const { onViewed, react, toggleResolved } = useOfficePostActions(setItems, load);

  const filtered = status !== 'open' || q.trim() !== '';

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

      <FilterBar
        activeCount={(status !== 'open' ? 1 : 0) + (search.trim() ? 1 : 0)}
        onClear={() => {
          setStatus('open');
          setSearch('');
        }}
      >
        <PillTabs
          activeTab={status}
          onChange={(t) => setStatus(t as OfficeStatus)}
          tabs={[
            { id: 'open', label: 'Open' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'all', label: 'All' }
          ]}
        />
        <FilterSearch value={search} onChange={setSearch} placeholder="Search posts" />
      </FilterBar>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {loading ? (
        <SkeletonGrid count={3} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title={filtered ? 'No posts match' : 'All quiet in the office'}
          description={filtered ? 'Try another filter or search.' : 'Nothing open right now. Spotted something? Post it.'}
          actionLabel={filtered ? undefined : 'New post'}
          onAction={filtered ? undefined : () => setComposing(true)}
        />
      ) : (
        <FadeIn>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((p, i) => (
              <OfficePostCard key={p.id} post={p} index={i} onViewed={onViewed} onReact={react} onToggleResolved={toggleResolved} />
            ))}
          </div>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" isLoading={loadingMore} onClick={loadMore}>
                Show older ({total - items.length} more)
              </Button>
            </div>
          )}
        </FadeIn>
      )}

      <NewPostModal isOpen={composing} onClose={() => setComposing(false)} onPosted={load} />
    </>
  );
};
