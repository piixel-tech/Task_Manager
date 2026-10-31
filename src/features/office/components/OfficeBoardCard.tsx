import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Megaphone, PartyPopper } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { CornerButton } from '../../../components/ui/CornerButton';
import { useAuthStore } from '../../../store/authStore';
import { useOfficeStore } from '../../../store/useOfficeStore';
import { socket } from '../../../services/socket';
import { officeApi, type OfficePost, type OfficeSummary } from '../../../services/http/officeApi';
import { OfficePostCard } from './OfficePostCard';
import { useOfficePostActions } from '../useOfficePostActions';

/** Dashboard highlight: the latest unresolved office posts and how many you haven't seen. */
export const OfficeBoardCard: React.FC = () => {
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const setUnseen = useOfficeStore((s) => s.setUnseen);
  const [data, setData] = useState<OfficeSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const board = `${role === 'admin' ? '/admin' : '/app'}/office`;

  const load = useCallback(async () => {
    try {
      const s = await officeApi.summary();
      setData(s);
      setUnseen(s.unseen_count);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [setUnseen]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => socket.on('notification', (n: { type?: string }) => n?.type?.startsWith('office_') && load()), [load]);

  const setLatest = useCallback(
    (update: React.SetStateAction<OfficePost[]>) =>
      setData((d) => (d ? { ...d, latest: typeof update === 'function' ? update(d.latest) : update } : d)),
    []
  );
  const { onViewed, react, toggleResolved } = useOfficePostActions(setLatest, load);

  if (failed && !data) return null; // the dashboard is still useful without it

  const unseen = data?.unseen_count ?? 0;

  return (
    <Card lift className="overflow-hidden bg-gradient-to-br from-[var(--tm-primary-softer)] to-[var(--tm-card)]">
      <CardContent className="space-y-5 pt-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-[var(--tm-solid)] text-[var(--tm-solid-accent)] shadow-soft-sm">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--tm-ink)]">
                Office board
                {unseen > 0 && (
                  <span className="rounded-full bg-[var(--tm-danger)] px-2.5 py-0.5 text-[11px] font-extrabold text-[var(--tm-on-primary)]" aria-label={`${unseen} unseen`}>
                    {unseen} new
                  </span>
                )}
              </h2>
              <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
                {data ? (data.open_count === 0 ? 'Nothing open right now' : `${data.open_count} open ${data.open_count === 1 ? 'issue' : 'issues'}`) : 'Loading…'}
              </p>
            </div>
          </div>
          <CornerButton label="Open board" onClick={() => navigate(board)} />
        </div>

        {data && data.latest.length === 0 ? (
          <p className="flex items-center gap-2 rounded-[var(--tm-radius-sm)] bg-[var(--tm-card)] p-4 text-[13.5px] font-semibold text-[var(--tm-ink-soft)]">
            <PartyPopper className="h-4 w-4 text-[var(--tm-primary-dark)]" />
            All clear. Spotted something? Post it on the board.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {data?.latest.map((p, i) => (
              <OfficePostCard key={p.id} post={p} index={i} onViewed={onViewed} onReact={react} onToggleResolved={toggleResolved} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
