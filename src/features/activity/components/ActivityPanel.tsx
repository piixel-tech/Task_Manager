import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Skeleton } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { activityApi, type ActivityEntry, type ActivityInput } from '../../../services/http/activityApi';
import type { ApiTask } from '../../../services/http/taskApi';
import { formatTimeAgo } from '../../../utils/time';
import { threads, useActivity, useProjectPeople } from '../useActivity';
import { Entry } from './Entry';
import { EntryComposer } from './EntryComposer';

type Tab = 'changes' | 'comments' | 'log';

/** The right-hand panel on a task: Mid-way changes, Comments and the automatic Activity log. */
export const ActivityPanel: React.FC<{ task: ApiTask }> = ({ task }) => {
  const me = useAuthStore((s) => s.user)!;
  const [params] = useSearchParams();
  const wanted = params.get('entry');
  const load = useCallback(() => activityApi.task(task.id), [task.id]);
  const { list, error, reload, update } = useActivity(load, `/tasks/${task.id}`);
  const everyone = useProjectPeople(task.project_id, [task.assignee?.id]);
  const people = everyone.filter((p) => p.id !== me.id);
  const [tab, setTab] = useState<Tab>('changes');

  // A link from a notification opens the right tab and scrolls to the entry.
  const target = useMemo(() => list?.items.find((e) => e.id === wanted), [list, wanted]);
  useEffect(() => {
    if (!target) return;
    const top = target.parent_id ? list?.items.find((e) => e.id === target.parent_id) : target;
    if (top) setTab(top.kind === 'comment' ? 'comments' : 'changes');
    const t = setTimeout(() => document.getElementById(`entry-${target.id}`)?.scrollIntoView({ block: 'center' }), 150);
    return () => clearTimeout(t);
  }, [target, list]);

  const post = async (input: ActivityInput) => {
    await activityApi.postTask(task.id, input);
    reload();
  };

  const items = list?.items ?? [];
  const changes = threads(items, 'change_request');
  const comments = threads(items, 'comment');
  const log = items.filter((e) => e.kind === 'log').reverse(); // newest first

  const renderThread = (t: { entry: ActivityEntry; replies: ActivityEntry[] }) => (
    <li key={t.entry.id}>
      <Entry entry={t.entry} replies={t.replies} meId={me.id} people={people} highlight={t.entry.id === wanted || t.replies.some((r) => r.id === wanted)} onUpdated={update} onReload={reload} onReply={post} />
    </li>
  );

  return (
    <Card id="activity">
      <CardHeader>
        <CardTitle className="text-base font-extrabold">Activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <PillTabs
          size="sm"
          activeTab={tab}
          onChange={(id) => setTab(id as Tab)}
          tabs={[
            { id: 'changes', label: 'Mid-way changes', count: list?.unresolved || undefined },
            { id: 'comments', label: 'Comments', count: comments.length || undefined },
            { id: 'log', label: 'Log' }
          ]}
        />
        {error && <p className="tm-error px-4 py-3 text-xs font-semibold">{error}</p>}

        {tab === 'changes' && (
          <>
            <p className="text-[12px] text-[var(--tm-ink-muted)]">Something needs to change while the work is under way? Post it here. The assignee or a head ticks it off when it is done.</p>
            <EntryComposer kind="change_request" people={people} placeholder="Describe the change" onPost={post} />
            {!list ? (
              error ? null : <div className="space-y-2" role="status" aria-label="Loading"><Skeleton className="h-14 w-full" rounded="lg" /><Skeleton className="h-14 w-full" rounded="lg" /></div>
            ) : changes.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-[var(--tm-ink-muted)]">No mid-way changes yet.</p>
            ) : (
              <ul className="space-y-3">{[...changes].reverse().map(renderThread)}</ul>
            )}
          </>
        )}

        {tab === 'comments' && (
          <>
            <EntryComposer kind="comment" people={everyone} placeholder="Write a comment. Type @ to mention someone" onPost={post} />
            {!list ? null : comments.length === 0 ? (
              <p className="py-3 text-center text-[13px] text-[var(--tm-ink-muted)]">No comments yet.</p>
            ) : (
              <ul className="space-y-3">{[...comments].reverse().map(renderThread)}</ul>
            )}
          </>
        )}

        {tab === 'log' &&
          (!list ? null : log.length === 0 ? (
            <p className="py-3 text-center text-[13px] text-[var(--tm-ink-muted)]">Nothing has happened yet.</p>
          ) : (
            <ol className="space-y-2.5 border-l-2 border-[var(--tm-border)] pl-4">
              {log.map((e) => (
                <li key={e.id} className="relative text-[13px] text-[var(--tm-ink-soft)]">
                  <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-[var(--tm-primary)]" />
                  <strong className="text-[var(--tm-ink)]">{e.author?.id === me.id ? 'You' : (e.author?.name ?? 'Someone')}</strong> {e.text}
                  <span className="ml-2 text-[11px] text-[var(--tm-ink-muted)]">{formatTimeAgo(e.created_at)}</span>
                </li>
              ))}
            </ol>
          ))}
      </CardContent>
    </Card>
  );
};
