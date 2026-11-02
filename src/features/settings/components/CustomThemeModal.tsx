import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Switch } from '../../../components/ui/Switch';
import { useConfirm } from '../../../hooks/useConfirm';
import type { PaletteColors } from '../../../services/http/festivalApi';
import { themeApi, type CustomTheme } from '../../../services/http/themeApi';
import { useCustomThemesStore } from '../../../store/useCustomThemesStore';
import { PalettePreview } from './PalettePreview';

const START = { primary: '#6d4fc2', accent: '#ffc857', bg: '#f6f4fb' };
type Picks = typeof START;
const PICKERS: { key: keyof Picks; label: string; hint: string }[] = [
  { key: 'primary', label: 'Primary', hint: 'Links, icons, buttons' },
  { key: 'accent', label: 'Accent', hint: 'Highlights, counters' },
  { key: 'bg', label: 'Background', hint: 'The page canvas' }
];

interface Props {
  /** The theme being edited, or null to create a new one. */
  editing: CustomTheme | null;
  onClose: () => void;
  /** Called with the saved theme. */
  onSaved: (t: CustomTheme) => void;
}

/** Build or edit a custom theme from three colours, with a live preview and a readability check. */
export const CustomThemeModal: React.FC<Props> = ({ editing, onClose, onSaved }) => {
  const confirm = useConfirm();
  const [name, setName] = useState(editing?.name ?? '');
  const [picks, setPicks] = useState<Picks>(editing ? { primary: editing.primary, accent: editing.accent, bg: editing.bg } : START);
  const [shared, setShared] = useState(editing?.shared ?? false);
  const [palette, setPalette] = useState<{ light: PaletteColors; dark: PaletteColors } | null>(editing ? { light: editing.light, dark: editing.dark } : null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const seq = useRef(0);

  // Regenerate the preview shortly after the colours stop changing.
  useEffect(() => {
    const mine = ++seq.current;
    setChecking(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await themeApi.preview(picks);
        if (mine !== seq.current) return;
        setPalette({ light: r.light, dark: r.dark });
        setWarnings(r.warnings);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Could not check those colours');
      } finally {
        if (mine === seq.current) setChecking(false);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [picks]);

  const save = async () => {
    setError(null);
    if (!name.trim()) return setError('Give your theme a name');
    const input = { name: name.trim(), ...picks, shared };
    let saved: CustomTheme | null = null;
    const ok = await confirm({
      title: editing ? `Save changes to "${input.name}"?` : `Save "${input.name}"?`,
      message: shared ? 'Everyone on the team will be able to use it, with your name on it.' : 'Only you will see it. It follows you to your other devices.',
      confirmLabel: 'Save theme',
      action: async () => {
        saved = editing ? await themeApi.update(editing.id, input) : await themeApi.create(input);
        await useCustomThemesStore.getState().load();
      },
      successTitle: editing ? 'Theme updated' : 'Theme saved'
    });
    if (ok && saved) onSaved(saved);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? 'Edit custom theme' : 'Create a custom theme'}
      description="Pick three colours. The rest of the theme, and its dark mode, is made from them."
      maxWidth="3xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={checking || !palette}>
            Save theme
          </Button>
        </>
      }
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Input label="Theme name" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} placeholder="e.g. Ocean" />
          <div className="space-y-2.5">
            {PICKERS.map((p) => (
              <label key={p.key} className="flex items-center gap-3 rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-2.5">
                <input
                  type="color"
                  value={picks[p.key]}
                  onChange={(e) => setPicks((s) => ({ ...s, [p.key]: e.target.value }))}
                  aria-label={p.label}
                  className="tm-native h-10 w-10 shrink-0 cursor-pointer rounded-lg border-0 bg-transparent p-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-bold text-[var(--tm-ink)]">{p.label}</span>
                  <span className="block text-[11.5px] font-medium text-[var(--tm-ink-muted)]">{p.hint}</span>
                </span>
                <span className="text-[11.5px] font-semibold uppercase tabular-nums text-[var(--tm-ink-muted)]">{picks[p.key]}</span>
              </label>
            ))}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-sm)] bg-[var(--tm-card-muted)] px-3.5 py-3">
            <span className="min-w-0">
              <span className="block text-[13px] font-bold text-[var(--tm-ink)]">Share with team</span>
              <span className="block text-[11.5px] font-medium text-[var(--tm-ink-muted)]">Others can use it, under "Team themes", with your name.</span>
            </span>
            <Switch checked={shared} onChange={setShared} label="Share with team" />
          </div>
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
              {checking ? 'Updating…' : ''}
            </span>
          </div>
          {palette ? (
            <PalettePreview colors={mode === 'dark' ? palette.dark : palette.light} dark={mode === 'dark'} />
          ) : (
            <div className="grid h-48 place-items-center rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] text-[13px] text-[var(--tm-ink-muted)]">Preparing preview…</div>
          )}
          {warnings.length > 0 && (
            <ul className="tm-warn space-y-1 px-4 py-3 text-[12.5px] font-semibold" role="status">
              {warnings.map((w) => (
                <li key={w} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {w}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="tm-error mt-4 px-4 py-3 text-xs font-semibold">
          {error}
        </div>
      )}
    </Modal>
  );
};
