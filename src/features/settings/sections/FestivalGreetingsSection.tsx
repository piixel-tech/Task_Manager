import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { celebrationApi, type FestivalGreeting } from '../../../services/http/celebrationApi';
import { useCelebrationsStore } from '../../../store/useCelebrationsStore';

const EMPTY = { name: '', date: '', message: '' };

/** Admin: festival greetings (name, date, message). On that date everyone's dashboard greeting shows the message. */
export const FestivalGreetingsSection: React.FC = () => {
  const confirm = useConfirm();
  const [items, setItems] = useState<FestivalGreeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<FestivalGreeting | null>(null);

  const load = useCallback(() => {
    celebrationApi
      .festivals()
      .then((list) => {
        setItems(list);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  const valid = form.name.trim() !== '' && form.date !== '' && form.message.trim() !== '';
  const reset = () => {
    setForm(EMPTY);
    setEditing(null);
  };
  /** Today's greeting may have changed: let the dashboard fetch it again. */
  const refreshDashboard = () => void useCelebrationsStore.getState().load(true);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const input = { name: form.name.trim(), date: form.date, message: form.message.trim() };
    const ok = await confirm({
      title: editing ? 'Save this festival greeting?' : 'Add this festival greeting?',
      message: `On ${format(parseISO(input.date), 'd MMMM yyyy')} everyone's dashboard greeting says “${input.message}”.`,
      confirmLabel: editing ? 'Save' : 'Add',
      action: () => (editing ? celebrationApi.editFestival(editing.id, input) : celebrationApi.addFestival(input)),
      successTitle: editing ? 'Festival greeting saved' : 'Festival greeting added'
    });
    if (ok) {
      reset();
      load();
      refreshDashboard();
    }
  };

  const remove = async (f: FestivalGreeting) => {
    const ok = await confirm({
      title: `Remove “${f.name}”?`,
      message: 'It will no longer appear in anyone’s greeting.',
      confirmLabel: 'Remove',
      danger: true,
      action: () => celebrationApi.removeFestival(f.id),
      successTitle: 'Festival greeting removed'
    });
    if (ok) {
      if (editing?.id === f.id) reset();
      load();
      refreshDashboard();
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="min-w-0">
          <CardTitle>Festival greetings</CardTitle>
          <CardDescription>
            On the date, everyone sees your message as their dashboard greeting. Birthdays and work anniversaries still come first.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <form noValidate onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Input label="Festival" value={form.name} maxLength={60} placeholder="e.g. Diwali" onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
          <div className="sm:col-span-2">
            <Input
              label="Greeting message"
              value={form.message}
              maxLength={60}
              placeholder="e.g. Happy Diwali, team!"
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              helperText={`${form.message.length}/60`}
              required
            />
          </div>
          <div className="flex justify-end gap-2 sm:col-span-2">
            {editing && (
              <Button type="button" variant="ghost" onClick={reset}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={!valid}>
              {editing ? 'Save changes' : 'Add greeting'}
            </Button>
          </div>
        </form>

        {error && <p className="text-[13px] text-[var(--tm-danger)]">{error}</p>}
        {items && items.length === 0 && <p className="text-[13px] text-[var(--tm-ink-muted)]">No festival greetings yet.</p>}
        {items && items.length > 0 && (
          <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)]">
            {items.map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-[14px] font-bold text-[var(--tm-ink)]">
                    {f.name} <span className="font-medium text-[var(--tm-ink-muted)]">· {format(parseISO(f.date), 'd MMM yyyy')}</span>
                  </p>
                  <p className="truncate text-[12.5px] text-[var(--tm-ink-muted)]">{f.message}</p>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`Edit ${f.name}`}
                  title="Edit"
                  onClick={() => {
                    setEditing(f);
                    setForm({ name: f.name, date: f.date, message: f.message });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" aria-label={`Remove ${f.name}`} title="Remove" onClick={() => void remove(f)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
