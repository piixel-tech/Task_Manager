import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CalendarDays, Moon, Pencil } from 'lucide-react';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/Card';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusChip } from '../../components/ui/StatusChip';
import { personApi, type PersonProfile } from '../../services/http/personApi';
import { useAuthStore } from '../../store/authStore';
import { statusMeta } from '../status/statusMeta';
import { basePath } from '../settings/settingsMenu';

const ROLE_LABEL = { admin: 'Admin', employee: 'Team member', client: 'Client' } as const;

/** Anyone's profile: the same page whether the viewer is an admin, an employee or a client. */
export const PersonProfilePage: React.FC = () => {
  const { userId = '' } = useParams<{ userId: string }>();
  const me = useAuthStore((s) => s.user);
  const [person, setPerson] = useState<PersonProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setPerson(null);
    setError(null);
    personApi
      .profile(userId)
      .then((p) => !cancelled && setPerson(p))
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (error) return <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>;
  if (!person) return <p className="text-[13px] text-[var(--tm-ink-muted)]">Loading…</p>;

  const base = basePath(me?.role);
  const isMe = me?.id === person.id;
  const status = statusMeta(person.status);
  const isTeam = person.role !== 'client';
  // Staff open the person's calendar; a client's only calendar is booking time with their team.
  const calendarTo = me?.role === 'client' ? '/client/meetings' : `${base}/calendar/${person.id}`;

  return (
    <>
      <PageHeader
        title={person.name}
        description={[person.title, person.company].filter(Boolean).join(' · ') || ROLE_LABEL[person.role]}
        actions={
          isMe ? (
            <Link to={`${base}/settings/profile`}>
              <Button variant="outline" leftIcon={<Pencil className="h-4 w-4" />}>
                Edit my profile
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-5 p-6">
          <Avatar name={person.name} src={person.avatar_url ?? undefined} size="2xl" focus={person.in_focus} />
          <div className="min-w-0 space-y-2">
            <h2 className="text-xl font-extrabold text-[var(--tm-ink)]">{person.name}</h2>
            <p className="text-[13px] font-semibold text-[var(--tm-ink-muted)]">{person.title || ROLE_LABEL[person.role]}</p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip tone="neutral">{ROLE_LABEL[person.role]}</StatusChip>
              {person.in_focus && (
                <StatusChip tone="primary">
                  <Moon className="mr-1 h-3 w-3" /> In focus mode
                </StatusChip>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
          </CardHeader>
          <CardContent>
            {person.bio ? (
              <p className="whitespace-pre-line text-[14px] leading-relaxed text-[var(--tm-ink-soft)]">{person.bio}</p>
            ) : (
              <p className="text-[13px] text-[var(--tm-ink-muted)]">{isMe ? 'Add a short bio in your profile settings.' : 'Nothing here yet.'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>{isTeam ? 'Their status for today.' : 'Clients do not set a daily status.'}</CardDescription>
          </CardHeader>
          <CardContent>
            {isTeam && (
              <StatusChip tone={status?.tone ?? 'neutral'} dot>
                {status ? status.label : 'No status set yet'}
              </StatusChip>
            )}
          </CardContent>
        </Card>
      </div>

      {isTeam && (
        <Card>
          <CardHeader>
            <CardTitle>Calendar</CardTitle>
            <CardDescription>
              {me?.role === 'client' ? 'Book a meeting with them from your project team.' : 'Their daily status, bookings and free slots.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to={calendarTo}>
              <Button variant="outline" leftIcon={<CalendarDays className="h-4 w-4" />}>
                {me?.role === 'client' ? 'Book a meeting' : isMe ? 'Open my calendar' : 'Open calendar'}
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </>
  );
};
