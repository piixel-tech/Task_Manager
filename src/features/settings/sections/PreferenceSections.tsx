import React, { useEffect, useState } from 'react';
import { Check, Monitor, Moon, Plus, Sun } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Switch } from '../../../components/ui/Switch';
import { ChangePasswordCard } from '../../../components/settings/ChangePasswordCard';
import { PALETTE_GROUPS, type BuiltInPalette, type NotifPrefs, type UserSettings } from '../../../services/http/accountApi';
import { themeApi, type CustomTheme } from '../../../services/http/themeApi';
import { useCustomThemesStore } from '../../../store/useCustomThemesStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { CustomThemeModal } from '../components/CustomThemeModal';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { FocusControls } from '../../focus/FocusMenu';
import { ShortcutList } from '../../shortcuts/ShortcutList';

const KINDS: { key: keyof NotifPrefs; label: string; note: string }[] = [
  { key: 'tasks', label: 'Tasks and projects', note: 'Assignments, due dates, mid-way changes, comments, new subfolders and requirements.' },
  { key: 'reviews', label: 'Reviews', note: 'Work waiting for your approval, and decisions on yours.' },
  { key: 'chat', label: 'Chat', note: 'New messages, being added to a group, client approvals. Controls the message popups too.' },
  { key: 'mentions', label: 'Mentions', note: 'When someone @mentions you.' },
  { key: 'office', label: 'Office board', note: 'New posts and when issues are resolved.' },
  { key: 'bookings', label: 'Bookings', note: 'Meetings booked or cancelled on your calendar.' }
];

export const NotificationsSection: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Switch off what you do not want to hear about. A kind that is off is not shown as a popup and does not appear in your bell at all. Mentions and Focus mode work separately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {KINDS.map((k) => (
          <div key={k.key} className="flex items-center justify-between gap-4 rounded-[var(--tm-radius-sm)] px-1 py-3">
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-[var(--tm-ink)]">{k.label}</p>
              <p className="text-[12.5px] text-[var(--tm-ink-muted)]">{k.note}</p>
            </div>
            <Switch label={k.label} checked={settings.notif_prefs[k.key]} onChange={(on) => void update({ notif_prefs: { [k.key]: on } })} />
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 rounded-[var(--tm-radius-sm)] border-t border-[var(--tm-border)] px-1 pt-4">
          <div>
            <p className="text-[14px] font-bold text-[var(--tm-ink)]">Sound effects</p>
            <p className="text-[12.5px] text-[var(--tm-ink-muted)]">Soft sounds, for example when a task you worked on is approved.</p>
          </div>
          <Switch label="Sound effects" checked={settings.sound} onChange={(on) => void update({ sound: on })} />
        </div>
      </CardContent>
    </Card>
  );
};

const THEMES: { id: UserSettings['theme']; label: string; icon: React.ReactNode }[] = [
  { id: 'light', label: 'Light', icon: <Sun className="h-5 w-5" /> },
  { id: 'dark', label: 'Dark', icon: <Moon className="h-5 w-5" /> },
  { id: 'system', label: 'System', icon: <Monitor className="h-5 w-5" /> }
];

const DENSITIES: { id: UserSettings['density']; label: string; note: string }[] = [
  { id: 'comfortable', label: 'Comfortable', note: 'More breathing room' },
  { id: 'compact', label: 'Compact', note: 'More on screen at once' }
];

const Choice: React.FC<{ selected: boolean; onClick: () => void; children: React.ReactNode }> = ({ selected, onClick, children }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`flex flex-col items-center gap-1.5 rounded-[var(--tm-radius-md)] border p-4 text-center transition-colors ${
      selected ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]' : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)]'
    }`}
  >
    {children}
  </button>
);

const PALETTE_LABELS: Record<BuiltInPalette, string> = {
  purple: 'Purple',
  indigo: 'Indigo',
  blue: 'Blue',
  sky: 'Sky',
  teal: 'Teal',
  green: 'Green',
  red: 'Red',
  coral: 'Coral',
  pink: 'Pink',
  orange: 'Orange',
  gold: 'Gold',
  brown: 'Brown',
  olive: 'Olive',
  grey: 'Grey',
  monochrome: 'Monochrome'
};

/**
 * One swatch. `data-theme` on the button scopes that palette's variables to it, so it always shows its own colours.
 * `actions` (edit / delete for my own themes) sit under the name.
 */
const PaletteSwatch: React.FC<{
  themeAttr: string;
  label: string;
  note?: string;
  selected: boolean;
  onClick: () => void;
  actions?: React.ReactNode;
}> = ({ themeAttr, label, note, selected, onClick, actions }) => (
  <div className="flex flex-col items-center">
    <button
      type="button"
      data-theme={themeAttr}
      aria-pressed={selected}
      aria-label={`${label} theme`}
      onClick={onClick}
      className={`flex w-full flex-col items-center gap-2 rounded-[var(--tm-radius-md)] border-2 p-3 transition-colors ${
        selected ? 'border-[var(--tm-primary)]' : 'border-transparent hover:border-[var(--tm-border-strong)]'
      }`}
    >
      <span className="relative flex h-14 w-full items-end gap-1 overflow-hidden rounded-[var(--tm-radius-sm)] border border-[var(--border)] bg-[var(--bg)] p-1.5">
        <span className="h-full flex-1 rounded-lg bg-[var(--surface)]" />
        <span className="h-3/4 flex-1 rounded-lg bg-[var(--primary)]" />
        <span className="h-1/2 flex-1 rounded-lg bg-[var(--accent)]" />
        <span className="h-1/3 flex-1 rounded-lg bg-[var(--text)]" />
        {selected && (
          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--text)] text-[var(--surface)]">
            <Check className="h-3 w-3" />
          </span>
        )}
      </span>
      <span className="w-full truncate text-center text-[12.5px] font-bold text-[var(--tm-ink-soft)]">{label}</span>
      {note && <span className="-mt-1.5 w-full truncate text-center text-[11px] font-medium text-[var(--tm-ink-muted)]">{note}</span>}
    </button>
    {actions}
  </div>
);

const GroupTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <h3 className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-[var(--tm-ink-muted)]">{children}</h3>
);
const SWATCH_GRID = 'grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6';

export const AppearanceSection: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const update = useSettingsStore((s) => s.update);
  const mine = useCustomThemesStore((s) => s.mine);
  const team = useCustomThemesStore((s) => s.team);
  const max = useCustomThemesStore((s) => s.max);
  const confirm = useConfirm();
  const [builder, setBuilder] = useState<{ editing: CustomTheme | null } | null>(null);

  useEffect(() => {
    void useCustomThemesStore.getState().load();
  }, []);

  const remove = (t: CustomTheme) =>
    confirm({
      title: `Delete "${t.name}"?`,
      message: t.shared ? 'It disappears for everyone using it; they go back to Purple.' : 'This cannot be undone.',
      confirmLabel: 'Delete theme',
      danger: true,
      action: async () => {
        await themeApi.remove(t.id);
        await useCustomThemesStore.getState().load();
        if (settings.palette === `custom:${t.id}`) await update({ palette: 'purple' });
      },
      successTitle: 'Theme deleted'
    });

  const select = (palette: UserSettings['palette']) => void update({ palette });
  const small = 'rounded-full px-2.5 py-1 text-[11.5px] font-bold text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)]';

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Colour theme</CardTitle>
          <CardDescription>Pick a palette, or build your own. It applies at once and is saved on your account, so it follows you to other devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            {PALETTE_GROUPS.map((g) => (
              <div key={g.title}>
                <GroupTitle>{g.title}</GroupTitle>
                <div className={SWATCH_GRID}>
                  {g.items.map((p) => (
                    <PaletteSwatch key={p} themeAttr={p} label={PALETTE_LABELS[p]} selected={settings.palette === p} onClick={() => select(p)} />
                  ))}
                </div>
              </div>
            ))}

            <div>
              <GroupTitle>My themes</GroupTitle>
              <div className={SWATCH_GRID}>
                {mine.map((t) => (
                  <PaletteSwatch
                    key={t.id}
                    themeAttr={`custom-${t.id}`}
                    label={t.name}
                    note={t.shared ? 'Shared with team' : undefined}
                    selected={settings.palette === `custom:${t.id}`}
                    onClick={() => select(`custom:${t.id}`)}
                    actions={
                      <div className="flex items-center gap-0.5">
                        <button type="button" className={small} onClick={() => setBuilder({ editing: t })} aria-label={`Edit ${t.name}`}>
                          Edit
                        </button>
                        <button type="button" className={`${small} hover:!text-[var(--tm-danger)]`} onClick={() => void remove(t)} aria-label={`Delete ${t.name}`}>
                          Delete
                        </button>
                      </div>
                    }
                  />
                ))}
                {mine.length < max ? (
                  <button
                    type="button"
                    onClick={() => setBuilder({ editing: null })}
                    className="flex flex-col items-center gap-2 rounded-[var(--tm-radius-md)] border-2 border-transparent p-3 text-[var(--tm-ink-soft)] transition-colors hover:border-[var(--tm-border-strong)]"
                  >
                    <span className="grid h-14 w-full place-items-center rounded-[var(--tm-radius-sm)] border-2 border-dashed border-[var(--tm-border-strong)] text-[var(--tm-primary-dark)]">
                      <Plus className="h-5 w-5" />
                    </span>
                    <span className="text-[12.5px] font-bold">Create custom</span>
                  </button>
                ) : (
                  <p className="col-span-2 self-center text-[12px] font-medium text-[var(--tm-ink-muted)] sm:col-span-3">
                    You have {max} custom themes, the most you can keep. Delete one to make another.
                  </p>
                )}
              </div>
            </div>

            {team.length > 0 && (
              <div>
                <GroupTitle>Team themes</GroupTitle>
                <div className={SWATCH_GRID}>
                  {team.map((t) => (
                    <PaletteSwatch
                      key={t.id}
                      themeAttr={`custom-${t.id}`}
                      label={t.name}
                      note={`by ${t.owner_name}`}
                      selected={settings.palette === `custom:${t.id}`}
                      onClick={() => select(`custom:${t.id}`)}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {builder && (
        <CustomThemeModal
          editing={builder.editing}
          onClose={() => setBuilder(null)}
          onSaved={(t) => {
            setBuilder(null);
            if (!builder.editing) select(`custom:${t.id}`); // a new theme is applied straight away
          }}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Light or dark</CardTitle>
          <CardDescription>Light, dark, or follow your device. Saved on your account, so it follows you to other devices.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {THEMES.map((t) => (
              <Choice key={t.id} selected={settings.theme === t.id} onClick={() => void update({ theme: t.id })}>
                {t.icon}
                <span className="text-[13px] font-bold">{t.label}</span>
              </Choice>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Density</CardTitle>
          <CardDescription>How tightly the app is spaced.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            {DENSITIES.map((d) => (
              <Choice key={d.id} selected={settings.density === d.id} onClick={() => void update({ density: d.id })}>
                <span className="text-[13px] font-bold">{d.label}</span>
                <span className="text-[12px] font-medium text-[var(--tm-ink-muted)]">{d.note}</span>
              </Choice>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const PasswordSection: React.FC = () => <ChangePasswordCard />;

export const FocusSection: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>Focus mode</CardTitle>
      <CardDescription>Heads-down time. Also in the moon button in the top bar.</CardDescription>
    </CardHeader>
    <CardContent className="max-w-sm">
      <FocusControls />
    </CardContent>
  </Card>
);

export const ShortcutsSection: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>Keyboard shortcuts</CardTitle>
      <CardDescription>Press ? anywhere to see this list. Shortcuts are paused while you type in a field.</CardDescription>
    </CardHeader>
    <CardContent>
      <ShortcutList />
    </CardContent>
  </Card>
);

const HELP: { q: string; a: string }[] = [
  { q: 'Where do my tasks live?', a: 'Open a project in the sidebar, then a subfolder. My Tasks (under More) lists everything assigned to you.' },
  { q: 'How do I ask for changes while work is in progress?', a: 'Open the task and use the Mid-way changes tab in the Activity panel. For something that affects a whole subfolder, use its Mid-way changes tab.' },
  { q: 'How do I turn a chat message into a task?', a: 'Open the message menu in the chat and choose Create task. The task shows a link back to the message.' },
  { q: 'Can I send a message later?', a: 'Yes: type your message, then use the arrow next to Send and pick a time. Scheduled messages can be edited or cancelled from the clock icon in the chat.' },
  { q: 'How do I stop being interrupted?', a: 'Use Focus mode (the moon in the top bar). Notifications still wait in your bell, and colleagues see a moon on your avatar.' },
  { q: 'I deleted something by mistake.', a: 'Ask an admin: deleted tasks, subfolders, projects and chat messages stay in the Trash for 30 days and can be restored.' },
  { q: 'I forgot my password.', a: 'An admin can set a temporary password for you; you will be asked to choose your own when you sign in.' }
];

export const HelpSection: React.FC = () => (
  <Card>
    <CardHeader>
      <CardTitle>Help</CardTitle>
      <CardDescription>Quick answers. For anything else, ask an admin.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-2">
      {HELP.map((h) => (
        <details key={h.q} className="group rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)] px-4 py-3">
          <summary className="cursor-pointer text-[14px] font-bold text-[var(--tm-ink)]">{h.q}</summary>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--tm-ink-soft)]">{h.a}</p>
        </details>
      ))}
    </CardContent>
  </Card>
);
