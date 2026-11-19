import React, { useEffect } from 'react';
import { Cake, MessageCircle, PartyPopper } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { useAuthStore } from '../../store/authStore';
import { useCelebrationsStore } from '../../store/useCelebrationsStore';
import { useSendWishes } from './useSendWishes';

/** "Celebrations today": birthdays and work milestones for the whole team, with a quick way to send wishes. Hidden when nobody has one. */
export const CelebrationsCard: React.FC = () => {
  const me = useAuthStore((s) => s.user);
  const people = useCelebrationsStore((s) => s.today.people);
  const load = useCelebrationsStore((s) => s.load);
  const { send, busy } = useSendWishes();

  useEffect(() => {
    void load();
  }, [load]);

  if (!me || people.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-[var(--tm-primary)]" /> Celebrations today
          </CardTitle>
          <CardDescription>Birthdays and work anniversaries on the team.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {people.map((c) => {
            const key = `${c.user_id}:${c.kind}`;
            const mine = c.user_id === me.id;
            return (
              <li key={key} className="flex min-w-0 items-center gap-3 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-3">
                <Avatar name={c.name} src={c.avatar_url ?? undefined} size="lg" ring />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[14px] font-bold text-[var(--tm-ink)]">{mine ? 'You' : c.name}</p>
                  <p className="flex items-center gap-1 truncate text-[12px] text-[var(--tm-ink-muted)]">
                    {c.kind === 'birthday' ? <Cake className="h-3.5 w-3.5 shrink-0" /> : <PartyPopper className="h-3.5 w-3.5 shrink-0" />}
                    <span className="truncate">{c.label}</span>
                  </p>
                </div>
                {!mine && (
                  <Button size="sm" variant="outline" isLoading={busy === c.user_id} onClick={() => void send(c)} leftIcon={<MessageCircle className="h-4 w-4" />}>
                    <span className="hidden sm:inline">Send wishes</span>
                    <span className="sr-only sm:hidden">Send wishes</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
};
