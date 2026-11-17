import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Megaphone, Plus, Search } from 'lucide-react';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { FadeIn } from '../../../components/ui/FadeIn';
import { useOfficeStore } from '../../../store/useOfficeStore';
import { toast } from '../../../store/useToastStore';
import { socket } from '../../../services/socket';
import { officeApi, type OfficePost, type OfficeStatus } from '../../../services/http/officeApi';
import { daysBetween, PinNote } from '../components/PinNote';
import { useOfficePostActions } from '../useOfficePostActions';
import { NewPostModal } from '../components/NewPostModal';

const PAGE = 20;
const TRAY = 6;
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** "Solved by Hal in 2 days · 14 Nov" */
export function solvedLine(p: OfficePost): string {
  const n = p.resolved_at ? daysBetween(p.created_at, p.resolved_at) : 0;
  const took = n === 0 ? 'the same day' : `in ${n} ${n === 1 ? 'day' : 'days'}`;
  return `Solved by ${p.resolved_by?.name ?? 'someone'} ${took}${p.resolved_at ? ` · ${shortDay(p.resolved_at)}` : ''}`;
}

/** The office board: a pinboard of notes from everyone. Resolved posts stay as history. */
export const OfficePage: React.FC = () => {
  const navigate = useNavigate();
  const setUnseen = useOfficeStore((s) => s.setUnseen);

  const [status, setStatus] = useState<OfficeStatus>('open');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState(''); // the debounced search
  const [items, setItems] = useState<OfficePost[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<{ open: number; resolved: number } | null>(null);
  const [history, setHistory] = useState<OfficePost[]>([]);
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
    // The tab counts and the "Solved" tray do not depend on the search.
    try {
      const [open, resolved] = await Promise.all([officeApi.list({ status: 'open', category: null, q: '', limit: 1 }), officeApi.list({ status: 'resolved', category: null, q: '', limit: TRAY })]);
      if (id === latest.current) {
        setCounts({ open: open.total, resolved: resolved.total });
        setHistory(resolved.items);
      }
    } catch {
      // The board itself is what matters; the counts catch up on the next load.
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

  const { onViewed, react, toggleResolved, remove } = useOfficePostActions(setItems, load);
  const filtered = status !== 'open' || q.trim() !== '';

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink)] transition-colors hover:bg-[var(--tm-bg-sunken)]"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[24px] font-bold leading-tight tracking-[-0.01em] text-[var(--tm-ink)]">Office board</h1>
            <p data-hint className="text-[13px] text-[var(--tm-ink-muted)]">Issues and notices for the whole office.</p>
          </div>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          <label className="flex h-11 min-w-[200px] items-center gap-2 rounded-full border border-[var(--tm-border)] bg-[var(--tm-card)] px-4 text-[var(--tm-ink-muted)] transition-[border-color,box-shadow] focus-within:border-[var(--tm-primary-light)] focus-within:shadow-glow">
            <Search className="h-4 w-4 shrink-0" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search posts"
              aria-label="Search posts"
              className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-[var(--tm-ink)] outline-none placeholder:text-[var(--tm-ink-muted)]"
            />
          </label>
          <PillTabs
            activeTab={status}
            onChange={(t) => setStatus(t as OfficeStatus)}
            showZero
            tabs={[
              { id: 'open', label: 'Open', count: counts?.open },
              { id: 'resolved', label: 'Resolved', count: counts?.resolved },
              { id: 'all', label: 'All', count: counts ? counts.open + counts.resolved : undefined }
            ]}
          />
          <Button onClick={() => setComposing(true)} leftIcon={<Plus className="h-4 w-4" />}>
            New post
          </Button>
        </div>
      </div>

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section
          aria-label="Pinboard"
          className="rounded-[28px] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-5 shadow-soft-xs sm:p-7"
          style={{ backgroundImage: 'radial-gradient(color-mix(in srgb, var(--tm-ink) 14%, transparent) 1px, transparent 1px)', backgroundSize: '20px 20px' }}
        >
          {loading ? (
            <SkeletonGrid count={3} />
          ) : items.length === 0 && filtered ? (
            <EmptyState icon={<Megaphone className="h-6 w-6 text-[var(--tm-primary-dark)]" />} title="No posts match" description="Try another filter or search." />
          ) : (
            <FadeIn>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((p, i) => (
                  <PinNote key={p.id} post={p} index={i} onViewed={onViewed} onReact={react} onToggleResolved={toggleResolved} onDelete={remove} />
                ))}
                <button
                  type="button"
                  onClick={() => setComposing(true)}
                  className="flex min-h-[250px] flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-[var(--tm-border-strong)] bg-transparent p-5 text-[14px] font-semibold text-[var(--tm-ink-soft)] transition-colors hover:bg-[var(--tm-card-muted)] hover:text-[var(--tm-ink)]"
                >
                  <Plus className="h-6 w-6" />
                  Pin something for the office
                </button>
              </div>
              {items.length < total && (
                <div className="mt-6 flex justify-center">
                  <Button variant="outline" isLoading={loadingMore} onClick={loadMore}>
                    Show older ({total - items.length} more)
                  </Button>
                </div>
              )}
            </FadeIn>
          )}
        </section>

        <aside aria-label="Solved history" className="rounded-[var(--tm-radius-card)] border border-[var(--tm-border)]/60 bg-[var(--tm-card)] p-4 shadow-soft-xs">
          <h2 className="flex items-center justify-between text-[15px] font-bold text-[var(--tm-ink)]">
            Solved · history
            <span className="rounded-full bg-[var(--tm-success-bg)] px-2.5 py-0.5 text-[12px] font-semibold tabular-nums text-[var(--tm-success)]">{counts?.resolved ?? 0}</span>
          </h2>
          <p data-hint className="mt-0.5 text-[13px] text-[var(--tm-ink-muted)]">Fixed issues, kept for reference.</p>
          {history.length === 0 ? (
            <EmptyState size="compact" className="mt-3" title="Nothing solved yet" description="Issues marked solved are kept here." />
          ) : (
            <ul className="mt-3 space-y-3">
              {history.map((p) => (
                <li key={p.id} className="rounded-2xl bg-[var(--tm-card-muted)] px-3.5 py-3">
                  <p className="line-clamp-2 text-[13.5px] font-semibold text-[var(--tm-ink-muted)] line-through">{p.text}</p>
                  <p className="mt-1 text-[11.5px] font-medium text-[var(--tm-success)]">{solvedLine(p)}</p>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setStatus('resolved')} className="mt-4 text-[13px] font-semibold text-[var(--tm-ink)] hover:underline">
            View all history →
          </button>
        </aside>
      </div>

      <NewPostModal isOpen={composing} onClose={() => setComposing(false)} onPosted={load} />
    </>
  );
};
