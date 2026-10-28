import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Megaphone, PartyPopper } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { useAuthStore } from '../../../store/authStore';
import { useOfficeStore } from '../../../store/useOfficeStore';
import { socket } from '../../../services/socket';
import { officeApi, type OfficeSummary } from '../../../services/http/officeApi';
import { categoryMeta, timeAgo, tint } from '../officeMeta';

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

  if (failed && !data) return null; // the dashboard is still useful without it

  const unseen = data?.unseen_count ?? 0;

  return (
    <Card className="overflow-hidden border-2 border-[var(--tm-primary)]/40 bg-gradient-to-br from-[var(--tm-primary-softer)] to-[var(--tm-card)]">
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--tm-primary)] text-[var(--tm-on-primary)] shadow-soft-sm">
              <Megaphone className="h-5 w-5" />
            </span>
            <div>
              <h2 className="flex items-center gap-2 text-base font-extrabold text-[var(--tm-ink)]">
                Office board
                {unseen > 0 && (
                  <span className="rounded-full bg-[var(--tm-danger)] px-2.5 py-0.5 text-[11px] font-extrabold text-white" aria-label={`${unseen} unseen`}>
                    {unseen} new
                  </span>
                )}
              </h2>
              <p className="text-[12.5px] text-[var(--tm-ink-muted)]">
                {data ? (data.open_count === 0 ? 'Nothing open right now' : `${data.open_count} open ${data.open_count === 1 ? 'issue' : 'issues'}`) : 'Loading…'}
              </p>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(board)} rightIcon={<ArrowRight className="h-4 w-4" />}>
            Open board
          </Button>
        </div>

        {data && data.latest.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-[var(--tm-card)] p-4 text-[13.5px] font-semibold text-[var(--tm-ink-soft)]">
            <PartyPopper className="h-4 w-4 text-[var(--tm-primary)]" />
            All clear. Spotted something? Post it on the board.
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-3">
            {data?.latest.map((p) => {
              const meta = categoryMeta(p.category);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => navigate(board)}
                    style={tint(meta.accent, 10)}
                    className="relative flex h-full w-full flex-col gap-2 rounded-2xl border p-3.5 text-left transition-transform hover:-translate-y-0.5"
                  >
                    {p.is_new && <span className="absolute right-3 top-3 h-2.5 w-2.5 rounded-full bg-[var(--tm-danger)]" aria-label="New" />}
                    <span className="flex items-center gap-2 text-[11.5px] font-extrabold uppercase tracking-wide" style={{ color: meta.accent }}>
                      <span className="text-base">{p.emoji}</span>
                      {p.category_label}
                    </span>
                    <span className="line-clamp-3 text-[13.5px] font-semibold text-[var(--tm-ink)]">{p.text}</span>
                    <span className="mt-auto flex items-center gap-1.5 pt-1 text-[11.5px] text-[var(--tm-ink-muted)]">
                      <Avatar name={p.author?.name ?? 'Someone'} src={p.author?.avatar_url ?? undefined} size="xs" />
                      {p.author?.name.split(' ')[0] ?? 'Someone'} · {timeAgo(p.created_at)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
