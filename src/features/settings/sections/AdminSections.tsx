import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Download, ImagePlus, LogOut, Pencil, RotateCcw, Trash2, UserPlus, Users } from 'lucide-react';
import { Avatar } from '../../../components/ui/Avatar';
import { AuthImage } from '../../../components/ui/AuthImage';
import { Button } from '../../../components/ui/Button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Select } from '../../../components/ui/Select';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { useConfirm } from '../../../hooks/useConfirm';
import { toast } from '../../../store/useToastStore';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import {
  companyApi,
  downloadExport,
  securityApi,
  trashApi,
  workspaceApi,
  type CompanyRow,
  type ExportKind,
  type Holiday,
  type SessionRow,
  type TrashKind,
  type TrashRow
} from '../../../services/http/adminApi';
import { assetApi } from '../../../services/http/taskApi';
import { HolidayDatePicker, type DateSel } from '../components/HolidayDatePicker';
import { projectApi, type Project } from '../../../services/http/projectApi';
import { formatTimeAgo } from '../../../utils/time';

const errorOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);
const Alert: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="alert" className="tm-error px-4 py-3 text-xs font-semibold">
    {children}
  </div>
);

// --- People --------------------------------------------------------------------------------------------------------
export const PeopleSection: React.FC = () => {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader>
        <CardTitle>People</CardTitle>
        <CardDescription>Everyone with an account: their role, company and whether they are active. New people get a temporary password and choose their own when they first sign in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button leftIcon={<UserPlus className="h-4 w-4" />} onClick={() => navigate('/admin/users?invite=1')}>
          Invite someone
        </Button>
        <Button variant="outline" leftIcon={<Users className="h-4 w-4" />} onClick={() => navigate('/admin/users')}>
          See everyone
        </Button>
      </CardContent>
    </Card>
  );
};

// --- Companies ---------------------------------------------------------------------------------------------------------
export const CompaniesSection: React.FC = () => {
  const confirm = useConfirm();
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [renaming, setRenaming] = useState<CompanyRow | null>(null);
  const [newName, setNewName] = useState('');

  const load = useCallback(() => {
    companyApi
      .list()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(errorOf(e, 'Could not load companies')));
  }, []);
  useEffect(load, [load]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    const ok = await confirm({ title: `Add “${clean}”?`, message: 'It becomes available when creating people and projects.', confirmLabel: 'Add company', action: async () => void (await companyApi.create(clean)), successTitle: 'Company added' });
    if (ok) {
      setName('');
      load();
    }
  };

  const rename = async () => {
    const target = renaming;
    const clean = newName.trim();
    if (!target || !clean || clean === target.name) return;
    const ok = await confirm({ title: `Rename to “${clean}”?`, message: 'People and projects keep belonging to it.', confirmLabel: 'Rename', action: async () => void (await companyApi.rename(target.id, clean)), successTitle: 'Company renamed' });
    if (ok) {
      setRenaming(null);
      load();
    }
  };

  const remove = async (c: CompanyRow) => {
    const ok = await confirm({
      title: `Delete “${c.name}”?`,
      message: 'Only possible when no one and no project belongs to it.',
      confirmLabel: 'Delete',
      danger: true,
      action: () => companyApi.remove(c.id),
      successTitle: 'Company deleted'
    });
    if (ok) load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Companies</CardTitle>
        <CardDescription>The companies people and projects belong to.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <Alert>{error}</Alert>}
        <form onSubmit={add} className="flex gap-3">
          <div className="flex-1">
            <Input aria-label="New company name" placeholder="New company name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button type="submit" disabled={!name.trim()}>
            Add
          </Button>
        </form>
        {rows === null ? (
          error ? null : <SkeletonRows count={2} />
        ) : (
          <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
            {rows.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                <Building2 className="h-4 w-4 text-[var(--tm-primary-dark)]" />
                <span className="flex-1 text-[14px] font-bold text-[var(--tm-ink)]">{c.name}</span>
                <Button size="sm" variant="outline" onClick={() => { setRenaming(c); setNewName(c.name); }}>
                  Rename
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${c.name}`} onClick={() => void remove(c)}>
                  <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Modal isOpen={!!renaming} onClose={() => setRenaming(null)} title="Rename company" maxWidth="sm">
        <div className="space-y-4">
          <Input label="Name" value={newName} maxLength={80} autoFocus onChange={(e) => setNewName(e.target.value)} />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setRenaming(null)}>
              Cancel
            </Button>
            <Button disabled={!newName.trim() || newName.trim() === renaming?.name} onClick={rename}>
              Rename
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
};

// --- Workspace ------------------------------------------------------------------------------------------------------------
const HOLIDAY_TYPES: { value: Holiday['type']; label: string }[] = [
  { value: 'company', label: 'Company holiday (office closed)' },
  { value: 'national', label: 'National holiday (office closed)' },
  { value: 'optional', label: 'Optional (office open)' }
];

export const WorkspaceSection: React.FC = () => {
  const confirm = useConfirm();
  const workspace = useWorkspaceStore((s) => s.workspace);
  const setWorkspace = useWorkspaceStore((s) => s.set);
  const [name, setName] = useState('');
  const [start, setStart] = useState('09:00');
  const [end, setEnd] = useState('18:00');
  const [holiday, setHoliday] = useState({ name: '', type: 'company' as Holiday['type'], company: '' }); // company '' = both
  const [picked, setPicked] = useState<DateSel[]>([]); // single dates and ranges for the same holiday
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [weeklyOff, setWeeklyOff] = useState<number[]>([6]);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [edit, setEdit] = useState({ name: '', type: 'company' as Holiday['type'], company: '', start: '', end: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspace) void useWorkspaceStore.getState().load();
  }, [workspace]);
  useEffect(() => {
    companyApi.list().then(setCompanies).catch(() => {});
  }, []);
  useEffect(() => {
    if (workspace) {
      setWeeklyOff(workspace.weekly_off);
      setName(workspace.name);
      setStart(workspace.work_start);
      setEnd(workspace.work_end);
    }
  }, [workspace]);

  if (!workspace) return <SkeletonRows count={3} />;
  const dirty = name.trim() !== workspace.name || start !== workspace.work_start || end !== workspace.work_end;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (start >= end) return setError('Working hours must end after they start.');
    await confirm({
      title: 'Save workspace settings?',
      message: 'The name shows in the sidebar. Working hours decide the free times people can book.',
      confirmLabel: 'Save',
      action: async () => setWorkspace(await workspaceApi.update({ name: name.trim(), work_start: start, work_end: end })),
      successTitle: 'Workspace settings saved'
    });
  };

  const pickLogo = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choose an image file for the logo.');
    if (file.size > 2 * 1024 * 1024) return setError('Pick a logo under 2 MB.');
    setError(null);
    let id = '';
    try {
      id = (await assetApi.upload([file]))[0].id;
    } catch (err) {
      return setError(errorOf(err, 'Could not upload the logo'));
    }
    const ok = await confirm({
      title: 'Use this as the logo?',
      message: 'It replaces the current one in the sidebar for everyone.',
      confirmLabel: 'Use logo',
      action: async () => setWorkspace(await workspaceApi.update({ logo_file_id: id })),
      successTitle: 'Logo updated'
    });
    if (!ok) assetApi.remove(id).catch(() => {});
  };

  const removeLogo = () =>
    confirm({
      title: 'Remove the logo?',
      message: 'The sidebar goes back to the first letter of the workspace name.',
      confirmLabel: 'Remove',
      danger: true,
      action: async () => setWorkspace(await workspaceApi.update({ remove_logo: true })),
      successTitle: 'Logo removed'
    });

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (picked.length === 0 || !holiday.name.trim()) return;
    const count = picked.length;
    const ok = await confirm({
      title: `Add “${holiday.name.trim()}”${count > 1 ? ` (${count} entries)` : ''}?`,
      message: `Applies to ${holiday.company ? (companies.find((c) => c.id === holiday.company)?.name ?? 'one company') : 'both companies'}. ${
        holiday.type === 'optional' ? 'Shown as optional on calendars.' : 'Calendars show it as a holiday.'
      }`,
      confirmLabel: count > 1 ? 'Add holidays' : 'Add holiday',
      action: async () =>
        setWorkspace(
          await workspaceApi.addHoliday({
            dates: picked.filter((s) => s.start === s.end).map((s) => s.start),
            ranges: picked.filter((s) => s.start !== s.end),
            name: holiday.name.trim(),
            type: holiday.type,
            company_ids: holiday.company ? [holiday.company] : []
          })
        ),
      successTitle: count > 1 ? 'Holidays added' : 'Holiday added'
    });
    if (ok) {
      setHoliday({ name: '', type: 'company', company: '' });
      setPicked([]);
    }
  };

  const openEdit = (h: Holiday) => {
    setEditing(h);
    setEdit({ name: h.name, type: h.type, company: h.company_ids.length === 1 ? h.company_ids[0] : '', start: h.date, end: h.end_date ?? '' });
  };

  const saveEdit = async () => {
    if (!editing || !edit.name.trim() || !edit.start) return;
    if (edit.end && edit.end < edit.start) return setError('A range must end on or after its first day.');
    setError(null);
    const target = editing;
    const ok = await confirm({
      title: `Save “${edit.name.trim()}”?`,
      message: 'Every calendar updates right away.',
      confirmLabel: 'Save',
      action: async () =>
        setWorkspace(
          await workspaceApi.editHoliday(target.id, {
            name: edit.name.trim(),
            type: edit.type,
            company_ids: edit.company ? [edit.company] : [],
            date: edit.start,
            end_date: edit.end
          })
        ),
      successTitle: 'Holiday updated'
    });
    if (ok) setEditing(null);
  };

  const saveWeeklyOff = () =>
    confirm({
      title: 'Save the weekly off?',
      message: 'Every matching day shows as a week off on all calendars, and nobody is asked for a daily status on it.',
      confirmLabel: 'Save',
      action: async () => setWorkspace(await workspaceApi.update({ weekly_off: weeklyOff })),
      successTitle: 'Weekly off saved'
    });

  const removeHoliday = (h: Holiday) =>
    confirm({
      title: `Remove “${h.name}”?`,
      message: h.date,
      confirmLabel: 'Remove',
      danger: true,
      action: async () => setWorkspace(await workspaceApi.removeHoliday(h.id)),
      successTitle: 'Holiday removed'
    });

  return (
    <div className="space-y-6">
      {error && <Alert>{error}</Alert>}
      <Card>
        <CardHeader>
          <CardTitle>Workspace</CardTitle>
          <CardDescription>The name and logo people see, and the hours meetings can be booked in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-center gap-4">
            {workspace.logo_url ? (
              <AuthImage url={workspace.logo_url} alt="Workspace logo" className="h-16 w-16 rounded-[var(--tm-radius-md)] object-cover" />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-[var(--tm-radius-md)] bg-[var(--tm-solid)] text-2xl font-extrabold text-[var(--tm-solid-ink)]">{workspace.name[0]?.toUpperCase()}</span>
            )}
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[var(--tm-border-strong)] bg-[var(--tm-card)] px-4 py-2 text-[13px] font-bold text-[var(--tm-ink)] hover:bg-[var(--tm-card-muted)]">
                <ImagePlus className="h-4 w-4" />
                {workspace.logo_url ? 'Replace logo' : 'Upload logo'}
                <input type="file" accept="image/*" hidden onChange={(e) => { void pickLogo(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              {workspace.logo_url && (
                <Button size="sm" variant="ghost" onClick={() => void removeLogo()}>
                  Remove
                </Button>
              )}
            </div>
          </div>

          <form onSubmit={save} className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <Input label="Workspace name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} required />
            </div>
            <Input label="Working day starts" type="time" value={start} onChange={(e) => setStart(e.target.value)} required />
            <Input label="Working day ends" type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />
            <div className="flex items-end justify-end">
              <Button type="submit" disabled={!dirty || !name.trim()}>
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Holidays</CardTitle>
          <CardDescription>Days the office is closed. Nobody can book time on them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form onSubmit={addHoliday} className="space-y-4">
            <HolidayDatePicker value={picked} onChange={setPicked} />
            <div className="grid gap-3 sm:grid-cols-[1fr_14rem_12rem_auto] sm:items-end">
              <Input label="Name" value={holiday.name} maxLength={100} onChange={(e) => setHoliday({ ...holiday, name: e.target.value })} required />
              <Select label="Kind" value={holiday.type} onChange={(e) => setHoliday({ ...holiday, type: e.target.value as Holiday['type'] })} options={HOLIDAY_TYPES} />
              <Select
                label="Applies to"
                value={holiday.company}
                onChange={(e) => setHoliday({ ...holiday, company: e.target.value })}
                options={[{ value: '', label: 'Both companies' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <Button type="submit" disabled={picked.length === 0 || !holiday.name.trim()}>
                Add
              </Button>
            </div>
          </form>
          {workspace.holidays.length === 0 ? (
            <p className="py-2 text-center text-[13px] text-[var(--tm-ink-muted)]">No holidays listed.</p>
          ) : (
            <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
              {workspace.holidays.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-40 shrink-0 text-[13px] font-bold tabular-nums text-[var(--tm-ink-soft)]">{h.end_date ? `${h.date} - ${h.end_date}` : h.date}</span>
                  <span className="flex-1 text-[14px] font-semibold text-[var(--tm-ink)]">{h.name}</span>
                  <span className="rounded-full bg-[var(--tm-bg-sunken)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--tm-ink-soft)]">
                    {h.company_ids.length === 0 ? 'Both companies' : h.company_ids.map((id) => companies.find((c) => c.id === id)?.name ?? 'Company').join(', ')}
                  </span>
                  <span className="rounded-full bg-[var(--tm-bg-sunken)] px-2.5 py-0.5 text-[11px] font-bold capitalize text-[var(--tm-ink-soft)]">{h.type}</span>
                  <Button size="sm" variant="ghost" aria-label={`Edit ${h.name}`} onClick={() => openEdit(h)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="sm" variant="ghost" aria-label={`Remove ${h.name}`} onClick={() => void removeHoliday(h)}>
                    <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weekly off</CardTitle>
          <CardDescription>Days off every week. They show as a holiday band on all calendars, and nobody is asked for a daily status on them.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((d, i) => (
            <label key={d} className="inline-flex cursor-pointer items-center gap-2 text-[13.5px] font-semibold text-[var(--tm-ink)]">
              <input
                type="checkbox"
                checked={weeklyOff.includes(i)}
                onChange={(e) => setWeeklyOff((cur) => (e.target.checked ? [...cur, i].sort() : cur.filter((x) => x !== i)))}
                className="h-4 w-4 accent-[var(--tm-primary)]"
              />
              {d}
            </label>
          ))}
          <Button
            size="sm"
            className="ml-auto"
            disabled={weeklyOff.length === workspace.weekly_off.length && weeklyOff.every((d) => workspace.weekly_off.includes(d))}
            onClick={() => void saveWeeklyOff()}
          >
            Save
          </Button>
        </CardContent>
      </Card>

      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title="Edit holiday" maxWidth="md">
        <div className="space-y-4">
          <Input label="Name" value={edit.name} maxLength={100} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="First day" type="date" value={edit.start} onChange={(e) => setEdit({ ...edit, start: e.target.value })} />
            <Input label="Last day (optional)" type="date" value={edit.end} min={edit.start} onChange={(e) => setEdit({ ...edit, end: e.target.value })} />
          </div>
          <Select label="Kind" value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value as Holiday['type'] })} options={HOLIDAY_TYPES} />
          <Select
            label="Applies to"
            value={edit.company}
            onChange={(e) => setEdit({ ...edit, company: e.target.value })}
            options={[{ value: '', label: 'Both companies' }, ...companies.map((c) => ({ value: c.id, label: c.name }))]}
          />
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button disabled={!edit.name.trim() || !edit.start} onClick={() => void saveEdit()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// --- Trash --------------------------------------------------------------------------------------------------------------------
const KIND_LABEL: Record<TrashKind, string> = { task: 'Task', subfolder: 'Subfolder', project: 'Project', message: 'Chat message' };

export const TrashSection: React.FC = () => {
  const confirm = useConfirm();
  const [kind, setKind] = useState<'all' | TrashKind>('all');
  const [rows, setRows] = useState<TrashRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    trashApi
      .list(kind === 'all' ? undefined : kind)
      .then((p) => {
        setRows(p.items);
        setError(null);
      })
      .catch((e) => setError(errorOf(e, 'Could not load the trash')));
  }, [kind]);
  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  const restore = async (r: TrashRow) => {
    const ok = await confirm({
      title: `Restore “${r.title}”?`,
      message: r.kind === 'project' ? 'The project returns with its subfolders, tasks and requirements.' : r.kind === 'subfolder' ? 'The subfolder returns with its tasks, checklist and deliverables.' : r.kind === 'message' ? 'The message reappears in its chat for everyone.' : 'The task returns with its comments and history.',
      confirmLabel: 'Restore',
      action: async () => void (await trashApi.restore(r.id)),
      successTitle: `${KIND_LABEL[r.kind]} restored`
    });
    if (ok) load();
  };

  const forever = async (r: TrashRow) => {
    const ok = await confirm({
      title: `Delete “${r.title}” forever?`,
      message: 'It and its files are removed for good. This cannot be undone.',
      confirmLabel: 'Delete forever',
      danger: true,
      action: () => trashApi.deleteForever(r.id),
      successTitle: 'Deleted forever'
    });
    if (ok) load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Trash</CardTitle>
        <CardDescription>Deleted tasks, subfolders, projects and chat messages stay here for 30 days, then are removed for good.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <PillTabs
          size="sm"
          activeTab={kind}
          onChange={(id) => setKind(id as typeof kind)}
          tabs={[{ id: 'all', label: 'All' }, ...(Object.keys(KIND_LABEL) as TrashKind[]).map((k) => ({ id: k, label: `${KIND_LABEL[k]}s` }))]}
        />
        {error && <Alert>{error}</Alert>}
        {rows === null ? (
          error ? null : <SkeletonRows count={3} />
        ) : rows.length === 0 ? (
          <EmptyState icon={<Trash2 className="h-6 w-6 text-[var(--tm-primary-dark)]" />} title="The trash is empty" description="Nothing has been deleted lately." />
        ) : (
          <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <span className="rounded-full bg-[var(--tm-bg-sunken)] px-2.5 py-0.5 text-[11px] font-bold text-[var(--tm-ink-soft)]">{KIND_LABEL[r.kind]}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-[var(--tm-ink)]">{r.title}</p>
                  <p className="truncate text-[12px] text-[var(--tm-ink-muted)]">
                    {r.context && `${r.context} · `}deleted {formatTimeAgo(r.deleted_at)}
                    {r.deleted_by && ` by ${r.deleted_by.name}`} · {r.days_left === 0 ? 'removed today' : `${r.days_left} day${r.days_left === 1 ? '' : 's'} left`}
                  </p>
                </div>
                <Button size="sm" variant="outline" leftIcon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => void restore(r)}>
                  Restore
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Delete ${r.title} forever`} onClick={() => void forever(r)}>
                  <Trash2 className="h-4 w-4 text-[var(--tm-danger)]" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};

// --- Export ---------------------------------------------------------------------------------------------------------------------
export const ExportSection: React.FC = () => {
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState({ project_id: '', status: '', created_from: '', created_to: '' });
  const [status, setStatus] = useState({ date_from: '', date_to: '' });
  const [deliverables, setDeliverables] = useState({ month: '' });

  useEffect(() => {
    projectApi.list().then(setProjects).catch(() => {});
  }, []);

  const run = async (kind: ExportKind, params: Record<string, string>) => {
    setBusy(kind);
    try {
      await downloadExport(kind, params);
      toast.success('Download started', 'The file opens in a spreadsheet.');
    } catch (err) {
      toast.error('Could not export', errorOf(err, ''));
    } finally {
      setBusy(null);
    }
  };

  const block = ({ kind, title, note, params, children }: { kind: ExportKind; title: string; note: string; params: Record<string, string>; children: React.ReactNode }) => (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{note}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">{children}</div>
        <Button isLoading={busy === kind} leftIcon={<Download className="h-4 w-4" />} onClick={() => void run(kind, params)}>
          Download CSV
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      {block({
        kind: 'tasks',
        title: 'Tasks',
        note: 'Every task with its project, assignee, status, due date, progress and tracked hours.',
        params: tasks,
        children: (
          <>
            <Select label="Project" value={tasks.project_id} onChange={(e) => setTasks({ ...tasks, project_id: e.target.value })} options={[{ value: '', label: 'All projects' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]} />
            <Select
              label="Status"
              value={tasks.status}
              onChange={(e) => setTasks({ ...tasks, status: e.target.value })}
              options={[{ value: '', label: 'Any status' }, ...['todo', 'in_progress', 'submitted', 'changes_requested', 'approved'].map((s) => ({ value: s, label: s.replace('_', ' ') }))]}
            />
            <Input label="Created from" type="date" value={tasks.created_from} onChange={(e) => setTasks({ ...tasks, created_from: e.target.value })} />
            <Input label="Created until" type="date" value={tasks.created_to} onChange={(e) => setTasks({ ...tasks, created_to: e.target.value })} />
          </>
        )
      })}
      {block({
        kind: 'status',
        title: 'Daily status',
        note: 'Who was present, working from home, on a half day or on leave, each day.',
        params: status,
        children: (
          <>
            <Input label="From" type="date" value={status.date_from} onChange={(e) => setStatus({ ...status, date_from: e.target.value })} />
            <Input label="Until" type="date" value={status.date_to} onChange={(e) => setStatus({ ...status, date_to: e.target.value })} />
          </>
        )
      })}
      {block({
        kind: 'deliverables',
        title: 'Deliverables',
        note: 'Every deliverable with its type, number and current stage.',
        params: deliverables,
        children: <Input label="Month" type="month" value={deliverables.month} onChange={(e) => setDeliverables({ month: e.target.value })} helperText="Leave empty for all months." />
      })}
    </div>
  );
};

// --- Security -----------------------------------------------------------------------------------------------------------------------
/** "Chrome on Windows" from a user-agent string, as far as it can be told. */
function deviceOf(ua: string): string {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

export const SecuritySection: React.FC = () => {
  const confirm = useConfirm();
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    securityApi
      .sessions()
      .then((r) => {
        setRows(r);
        setError(null);
      })
      .catch((e) => setError(errorOf(e, 'Could not load sign-ins')));
  }, []);
  useEffect(load, [load]);

  const endOne = async (s: SessionRow) => {
    const ok = await confirm({
      title: `Sign ${s.user?.name ?? 'this person'} out of this device?`,
      message: `${deviceOf(s.user_agent)}. They are signed out straight away.`,
      confirmLabel: 'Sign out',
      danger: true,
      action: async () => void (await securityApi.signOut(s.id)),
      successTitle: 'Signed out'
    });
    if (ok) load();
  };

  const endAll = async (s: SessionRow) => {
    if (!s.user) return;
    const user = s.user;
    const ok = await confirm({
      title: `Sign ${user.name} out everywhere?`,
      message: 'Every device they are signed in on is signed out at once. They can sign in again with their password.',
      confirmLabel: 'Sign out everywhere',
      danger: true,
      action: async () => void (await securityApi.signOutEverywhere(user.id)),
      successTitle: 'Signed out everywhere'
    });
    if (ok) load();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Security</CardTitle>
        <CardDescription>Who is signed in, and on which device. Ending a sign-in logs that device out at once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <Alert>{error}</Alert>}
        {rows === null ? (
          error ? null : <SkeletonRows count={3} />
        ) : rows.length === 0 ? (
          <p className="py-4 text-center text-[13px] text-[var(--tm-ink-muted)]">No one is signed in right now.</p>
        ) : (
          <ul className="divide-y divide-[var(--tm-border)] rounded-[var(--tm-radius-sm)] border border-[var(--tm-border)]">
            {rows.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={s.user?.name ?? '?'} src={s.user?.avatar_url ?? undefined} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-[var(--tm-ink)]">{s.user?.name ?? 'Former member'}</p>
                  <p className="truncate text-[12px] text-[var(--tm-ink-muted)]">
                    {deviceOf(s.user_agent)}
                    {s.ip && ` · ${s.ip}`} · active {formatTimeAgo(s.last_seen_at)} · signed in {formatTimeAgo(s.created_at)}
                  </p>
                </div>
                <Button size="sm" variant="outline" leftIcon={<LogOut className="h-3.5 w-3.5" />} onClick={() => void endOne(s)}>
                  Sign out
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void endAll(s)}>
                  Everywhere
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
};
