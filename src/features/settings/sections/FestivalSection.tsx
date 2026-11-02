import React, { useCallback, useEffect, useRef, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { PillTabs } from '../../../components/ui/PillTabs';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import {
  festivalApi,
  PALETTE_KEYS,
  PALETTE_KEY_LABELS,
  type FestivalAdminState,
  type FestivalPreset,
  type PaletteColors
} from '../../../services/http/festivalApi';
import { useFestivalStore } from '../../../store/useFestivalStore';
import { PalettePreview } from '../components/PalettePreview';

const CUSTOM = 'custom';
const BLANK: PaletteColors = {
  bg: '#f6f4fb',
  surface: '#ffffff',
  primary: '#6d4fc2',
  'primary-soft': '#e6defa',
  text: '#1f1a33',
  'text-muted': '#5d5775',
  border: '#ddd6f0',
  accent: '#ffc857'
};

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const plusDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));
const nice = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export const FestivalSection: React.FC = () => {
  const confirm = useConfirm();
  const [presets, setPresets] = useState<FestivalPreset[]>([]);
  const [current, setCurrent] = useState<FestivalAdminState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [choice, setChoice] = useState<string>(CUSTOM);
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState('');
  const [greeting, setGreeting] = useState('');
  const [start, setStart] = useState(plusDays(0));
  const [end, setEnd] = useState(plusDays(2));
  const [light, setLight] = useState<PaletteColors>(BLANK);
  const [dark, setDark] = useState<PaletteColors | null>(null);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [checking, setChecking] = useState(false);
  const [adjusted, setAdjusted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    Promise.all([festivalApi.presets(), festivalApi.current()])
      .then(([p, c]) => {
        if (!alive) return;
        setPresets(p);
        setCurrent(c);
      })
      .catch((e) => alive && setLoadError(e instanceof Error ? e.message : 'Could not load the festival theme'));
    return () => {
      alive = false;
      clearTimeout(timer.current);
    };
  }, []);

  /** Ask the server for the readable version of my colours and the dark set derived from them. */
  const check = useCallback((colors: PaletteColors) => {
    clearTimeout(timer.current);
    setChecking(true);
    timer.current = setTimeout(async () => {
      try {
        const r = await festivalApi.preview(colors);
        setLight(r.light);
        setDark(r.dark);
        setAdjusted(PALETTE_KEYS.some((k) => r.light[k] !== colors[k]));
        setFormError(null);
      } catch (e) {
        setFormError(e instanceof Error ? e.message : 'Could not check those colours');
      } finally {
        setChecking(false);
      }
    }, 450);
  }, []);

  const pick = (key: string) => {
    setChoice(key);
    setFormError(null);
    setAdjusted(false);
    if (key === CUSTOM) {
      setName('');
      setEmoji('');
      setGreeting('');
      check(light);
      return;
    }
    const p = presets.find((x) => x.key === key);
    if (!p) return;
    setName(p.name);
    setEmoji(p.emoji);
    setGreeting(p.greeting);
    setLight(p.light);
    setDark(p.dark);
  };

  const setColor = (k: keyof PaletteColors, value: string) => {
    const next = { ...light, [k]: value };
    setLight(next);
    setAdjusted(false);
    check(next);
  };

  const status = current?.festival
    ? current.state === 'live'
      ? `Live now: ${current.festival.name}, until ${nice(current.festival.end_date)}`
      : current.state === 'scheduled'
        ? `Scheduled: ${current.festival.name}, ${nice(current.festival.start_date)} to ${nice(current.festival.end_date)}`
        : `Ended: ${current.festival.name}`
    : 'No festival theme is set.';

  const publish = async () => {
    setFormError(null);
    if (!name.trim()) return setFormError('Give the festival a name');
    if (!start || !end) return setFormError('Pick a start and an end date');
    if (end < start) return setFormError("The end date can't be before the start date");
    await confirm({
      title: `Publish the ${name.trim()} theme?`,
      message: `Everyone will see it from ${nice(start)} to ${nice(end)}, with a small banner. People can switch back to their own theme, and it ends by itself after ${nice(end)}.`,
      confirmLabel: 'Publish',
      action: async () => {
        const saved = await festivalApi.publish({
          name: name.trim(),
          emoji: emoji.trim(),
          greeting: greeting.trim(),
          preset: choice === CUSTOM ? null : choice,
          start_date: start,
          end_date: end,
          light
        });
        setCurrent(saved);
        void useFestivalStore.getState().load();
      },
      successTitle: 'Festival theme published'
    });
  };

  const endNow = async () => {
    if (!current?.festival) return;
    await confirm({
      title: `End the ${current.festival.name} theme?`,
      message: 'Everyone goes back to their own theme right away.',
      confirmLabel: 'End theme',
      danger: true,
      action: async () => {
        setCurrent(await festivalApi.end());
        void useFestivalStore.getState().load();
      },
      successTitle: 'Festival theme ended'
    });
  };

  if (loadError) {
    return (
      <div role="alert" className="tm-error px-4 py-3 text-xs font-semibold">
        {loadError}
      </div>
    );
  }
  if (!current) return <SkeletonRows count={3} />;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Festival theme</CardTitle>
          <CardDescription>
            Give everyone a festive look for a few days. It applies to the whole team and clients between the dates, shows a small banner, lets people switch
            back to their own theme, and ends by itself.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[var(--tm-ink)]">
              <PartyPopper className="h-4 w-4 text-[var(--tm-primary-dark)]" />
              {status}
            </p>
            {current.festival && (
              <Button variant="outline" size="sm" onClick={() => void endNow()}>
                End now
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Choose a festival</CardTitle>
          <CardDescription>Start from a preset, or pick Custom festival to name it and choose every colour yourself.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {[...presets.map((p) => ({ key: p.key, label: `${p.emoji} ${p.name}` })), { key: CUSTOM, label: 'Custom festival' }].map((o) => (
              <button
                key={o.key}
                type="button"
                aria-pressed={choice === o.key}
                onClick={() => pick(o.key)}
                className={`rounded-full border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                  choice === o.key
                    ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                    : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)]'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Festival name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Founders Day" />
            <Input label="Emoji (optional)" value={emoji} maxLength={8} onChange={(e) => setEmoji(e.target.value)} placeholder="🎉" />
            <div className="sm:col-span-2">
              <Input label="Banner message" value={greeting} maxLength={140} onChange={(e) => setGreeting(e.target.value)} placeholder={`Happy ${name || 'festival'}!`} />
            </div>
            <Input label="Starts" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            <Input label="Ends" type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Colours and preview</CardTitle>
          <CardDescription>
            Tweak any colour. Text colours are adjusted automatically when they would be hard to read, and dark mode is made from your light colours.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="grid grid-cols-2 gap-3">
              {PALETTE_KEYS.map((k) => (
                <label key={k} className="flex items-center gap-2.5 rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-2">
                  <input
                    type="color"
                    value={light[k]}
                    onChange={(e) => setColor(k, e.target.value)}
                    aria-label={PALETTE_KEY_LABELS[k]}
                    className="tm-native h-9 w-9 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[12px] font-bold text-[var(--tm-ink)]">{PALETTE_KEY_LABELS[k]}</span>
                    <span className="block text-[11px] font-medium uppercase text-[var(--tm-ink-muted)]">{light[k]}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <PillTabs
                  tabs={[
                    { id: 'light', label: 'Light' },
                    { id: 'dark', label: 'Dark' }
                  ]}
                  activeTab={mode}
                  onChange={(m) => setMode(m as 'light' | 'dark')}
                />
                <span className="text-[12px] font-medium text-[var(--tm-ink-muted)]" aria-live="polite">
                  {checking ? 'Checking readability…' : adjusted ? 'Adjusted for readability' : ''}
                </span>
              </div>
              <PalettePreview colors={mode === 'dark' && dark ? dark : light} dark={mode === 'dark'} banner={{ emoji, text: greeting }} />
            </div>
          </div>

          {formError && (
            <div role="alert" className="tm-error mt-4 px-4 py-3 text-xs font-semibold">
              {formError}
            </div>
          )}
          <div className="mt-5 flex justify-end">
            <Button onClick={() => void publish()} disabled={checking}>
              Publish festival theme
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
