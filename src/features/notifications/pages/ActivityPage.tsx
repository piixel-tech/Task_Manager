import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui/Button';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { socket } from '../../../services/socket';
import { notificationApi } from '../../../services/http/notificationApi';
import { useNotificationStore } from '../../../store/useNotificationStore';
import { AllCaughtUp, NotificationGroups, NotificationSkeleton } from '../notificationVisuals';
import type { AppNotification } from '../../../types';

const PAGE = 30;

/** Everything the bell has ever shown, with the unread ones first to hand. */
export const ActivityPage: React.FC = () => {
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
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your activity'));
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
        title="Activity"
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

      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}

      {items === null ? (
        error ? null : <NotificationSkeleton count={6} />
      ) : items.length === 0 ? (
        <div className="rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)]">
          <AllCaughtUp
            title={filter === 'unread' ? 'You are all caught up' : 'Nothing here yet'}
            description={filter === 'unread' ? 'No unread notifications.' : 'Notifications you get will show up here.'}
          />
        </div>
      ) : (
        <>
          <div className="rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)] px-2 pt-1 shadow-soft-xs">
            <NotificationGroups items={items} onOpen={open} />
          </div>
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
