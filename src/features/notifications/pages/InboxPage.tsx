import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { socket } from '../../../services/socket';
import { notificationApi } from '../../../services/http/notificationApi';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { formatTimeAgo } from '../../../utils/time';
import type { AppNotification } from '../../../types';

const PAGE = 30;

/** Everything the bell has ever shown, with the unread ones first to hand. */
export const InboxPage: React.FC = () => {
  const navigate = useNavigate();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    notificationApi
      .page({ unreadOnly: filter === 'unread', limit: PAGE })
      .then((p) => {
        setItems(p.items);
        setTotal(p.total);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your inbox'));
  }, [filter]);

  useEffect(() => {
    setItems(null);
    load();
    return socket.on('notification', load); // a new one arrives while you are looking
  }, [load]);

  const more = async () => {
    if (!items) return;
    setLoadingMore(true);
    try {
      const p = await notificationApi.page({ unreadOnly: filter === 'unread', limit: PAGE, skip: items.length });
      setItems([...items, ...p.items]);
      setTotal(p.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load more');
    } finally {
      setLoadingMore(false);
    }
  };

  const open = (n: AppNotification) => {
    if (!n.read) {
      void useNotificationStore.getState().markAsRead(n.id);
      setItems((cur) => cur && (filter === 'unread' ? cur.filter((x) => x.id !== n.id) : cur.map((x) => (x.id === n.id ? { ...x, read: true } : x))));
    }
    if (n.link) navigate(n.link);
  };

  const markAll = async () => {
    await useNotificationStore.getState().markAllAsRead();
    setItems((cur) => cur && (filter === 'unread' ? [] : cur.map((x) => ({ ...x, read: true }))));
  };

  return (
    <>
      <PageHeader
        title="Inbox"
        description="Everything that was sent to you: assignments, reviews, mentions, chats and more."
        actions={
          unreadCount > 0 && (
            <Button size="sm" variant="outline" onClick={markAll}>
              Mark all as read
            </Button>
          )
        }
      />
      <PillTabs
        size="sm"
        activeTab={filter}
        onChange={(id) => setFilter(id as 'all' | 'unread')}
        tabs={[
          { id: 'all', label: 'All' },
          { id: 'unread', label: 'Unread', count: unreadCount || undefined }
        ]}
      />

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>}

      {items === null ? (
        error ? null : <SkeletonRows count={6} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Inbox className="h-6 w-6 text-[var(--tm-primary)]" />}
          title={filter === 'unread' ? 'You are all caught up' : 'Nothing here yet'}
          description={filter === 'unread' ? 'No unread notifications.' : 'Notifications you get will show up here.'}
        />
      ) : (
        <>
          <ul className="divide-y divide-[var(--tm-border)] overflow-hidden rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)]">
            {items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => open(n)}
                  className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--tm-bg-sunken)] ${!n.read ? 'bg-[var(--tm-primary-softer)]/60' : ''}`}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-[var(--tm-primary)]'}`} aria-label={n.read ? undefined : 'Unread'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-[13.5px] ${n.read ? 'font-semibold text-[var(--tm-ink-soft)]' : 'font-extrabold text-[var(--tm-ink)]'}`}>{n.title}</span>
                      <time dateTime={n.createdAt} className="shrink-0 text-[11px] text-[var(--tm-ink-muted)]">
                        {formatTimeAgo(n.createdAt)}
                      </time>
                    </span>
                    {n.message && <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--tm-ink-muted)]">{n.message}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {items.length < total && (
            <div className="flex justify-center">
              <Button variant="outline" size="sm" isLoading={loadingMore} onClick={more}>
                Show more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
};
