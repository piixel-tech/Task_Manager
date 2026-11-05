import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { RichEditor, type RichEditorHandle } from '../../../components/editor/RichEditor';
import { Select } from '../../../components/ui/Select';
import { useConfirm } from '../../../hooks/useConfirm';
import { useAuthStore } from '../../../store/authStore';
import {
  projectApi,
  type Project,
  type ProjectDetail,
  type Subfolder,
  type UserBrief
} from '../../../services/http/projectApi';
import { assetApi, taskApi, type ApiPriority, type ApiTask, type Asset } from '../../../services/http/taskApi';
import { AssetPicker } from './AssetPicker';

/** Starting values when a task is made from something else (a chat message). */
export interface TaskPrefill {
  title: string;
  /** HTML. */
  description: string;
  subfolderId?: string;
  projectId?: string;
  /** The chat message it comes from; its file is attached as a copy. */
  messageId: string;
  fileName?: string;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** An older plain-text description, shown in the editor as paragraphs. */
const toHtml = (t: { description: string; description_html: boolean }) =>
  t.description_html ? t.description : t.description.split(/\n+/).map((l) => `<p>${escapeHtml(l)}</p>`).join('');

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Edit mode when set. */
  task?: ApiTask | null;
  /** Pre-select in create mode. */
  defaultProjectId?: string;
  /** Pre-select in create mode (when started from a subfolder in the sidebar). */
  defaultSubfolderId?: string;
  /** Create mode, from a chat message. */
  prefill?: TaskPrefill | null;
  onSaved: (task: ApiTask) => void;
}

const PRIORITIES: { value: ApiPriority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];

/** Create or edit a task: project → subfolder, title, description (required), assignee, due date, priority, assets. */
export const TaskFormModal: React.FC<Props> = ({ isOpen, onClose, task, defaultProjectId, defaultSubfolderId, prefill, onSaved }) => {
  const confirm = useConfirm();
  const me = useAuthStore((s) => s.user);
  const isAdmin = me?.role === 'admin';

  const [projects, setProjects] = useState<Project[]>([]);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [directory, setDirectory] = useState<UserBrief[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [projectId, setProjectId] = useState('');
  const [subfolderId, setSubfolderId] = useState('');
  const [title, setTitle] = useState('');
  const descEditor = useRef<RichEditorHandle>(null);
  const [descEmpty, setDescEmpty] = useState(true);
  const [assigneeId, setAssigneeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<ApiPriority>('medium');
  const [assets, setAssets] = useState<Asset[]>([]);

  // Files/links uploaded while this form is open, so abandoned ones can be cleaned up.
  const uploaded = useRef<Set<string>>(new Set());
  const saved = useRef(false);

  // Reset when opened.
  useEffect(() => {
    if (!isOpen) return;
    saved.current = false;
    uploaded.current = new Set();
    setError(null);
    setTitle(task?.title ?? prefill?.title ?? '');
    setDescEmpty(!task && !prefill?.description);
    setAssigneeId(task?.assignee?.id ?? me?.id ?? '');
    setStartDate(task?.start_date ?? '');
    setDueDate(task?.due_date ?? '');
    setPriority(task?.priority ?? 'medium');
    setAssets(task?.assets ?? []);
    setProjectId(task?.project_id ?? prefill?.projectId ?? defaultProjectId ?? '');
    setSubfolderId(task?.subfolder_id ?? prefill?.subfolderId ?? defaultSubfolderId ?? '');

    projectApi.list().then(setProjects).catch((e) => setError(e.message));
    if (isAdmin) projectApi.directory().then(setDirectory).catch(() => { });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task, prefill, defaultSubfolderId]);

  // Load the chosen project's subfolders.
  useEffect(() => {
    if (!isOpen || !projectId) {
      setDetail(null);
      return;
    }
    projectApi
      .get(projectId)
      .then(setDetail)
      .catch((e) => setError(e.message));
  }, [isOpen, projectId]);

  // Only subfolders the person can work in: their own, and open ones (a view-only subfolder is read only).
  const subfolders = useMemo<Subfolder[]>(
    () => (detail?.subfolders ?? []).filter((s) => isAdmin || s.can_work),
    [detail, isAdmin]
  );
  const subfolder = subfolders.find((s) => s.id === subfolderId) ?? null;

  // Roles table: admin assigns anyone, a head their subfolder's members and heads, an employee only themselves.
  const assignees = useMemo<UserBrief[]>(() => {
    if (isAdmin) return directory;
    if (subfolder?.viewer_is_head) return subfolder.members;
    const self = subfolder?.members.find((m) => m.id === me?.id);
    // In an open subfolder you are not a member of, you can still give yourself a task.
    return self ? [self] : subfolder && me ? [{ id: me.id, name: me.name, avatar_url: me.avatarUrl ?? null, role: me.role, company_id: null }] : [];
  }, [isAdmin, directory, subfolder, me]);

  // Keep the selection valid when the subfolder (and so the allowed assignees) changes.
  useEffect(() => {
    if (assignees.length > 0 && !assignees.some((a) => a.id === assigneeId)) {
      setAssigneeId(assignees.find((a) => a.id === me?.id)?.id ?? assignees[0].id);
    }
  }, [assignees, assigneeId, me?.id]);

  useEffect(() => {
    if (!task && subfolders.length > 0 && !subfolders.some((s) => s.id === subfolderId)) {
      setSubfolderId(subfolders[0].id);
    }
  }, [task, subfolders, subfolderId]);

  const changeAssets = (next: Asset[]) => {
    // Something uploaded in this session and then removed is deleted right away.
    assets
      .filter((a) => uploaded.current.has(a.id) && !next.some((n) => n.id === a.id))
      .forEach((a) => assetApi.remove(a.id).catch(() => { }));
    setAssets(next);
  };

  const close = () => {
    if (!saved.current) uploaded.current.forEach((id) => assetApi.remove(id).catch(() => { }));
    onClose();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('Give the task a title.');
    if (!descEditor.current || descEditor.current.isEmpty()) return setError('Add a description: it is required.');
    if (!subfolderId) return setError('Pick a project and subfolder.');
    if (!assigneeId) return setError('Pick who it is assigned to.');
    setError(null);

    const base = {
      title: title.trim(),
      description: descEditor.current.html(),
      html: true,
      assignee_id: assigneeId,
      start_date: startDate || (task ? '' : null),
      due_date: dueDate || null,
      priority,
      asset_ids: assets.map((a) => a.id)
    };
    let result: ApiTask | undefined;
    const ok = await confirm({
      title: task ? `Save changes to “${task.title}”?` : `Create task “${base.title}”?`,
      message: task ? 'The assignee is notified of the changes.' : 'The assignee is notified.',
      confirmLabel: task ? 'Save' : 'Create task',
      action: async () => {
        result = task
          ? await taskApi.update(task.id, base)
          : await taskApi.create({ ...base, subfolder_id: subfolderId, from_message_id: prefill?.messageId });
      },
      successTitle: task ? 'Task updated' : 'Task created'
    });
    if (ok && result) {
      saved.current = true;
      // Attachments dropped from an existing task: clean them up (best effort, owner/admin only).
      (task?.assets ?? [])
        .filter((a) => !assets.some((x) => x.id === a.id))
        .forEach((a) => assetApi.remove(a.id).catch(() => { }));
      onSaved(result);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} title={task ? 'Edit task' : 'New task'} maxWidth="xl">
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>
        )}

        {task ? (
          <p className="text-[13px] text-[var(--tm-ink-muted)]">
            {task.project_name} › <strong className="text-[var(--tm-ink)]">{task.subfolder_name}</strong>
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Project"
              value={projectId}
              onChange={(e) => {
                setProjectId(e.target.value);
                setSubfolderId('');
              }}
              options={[{ value: '', label: 'Select a project' }, ...projects.map((p) => ({ value: p.id, label: p.name }))]}
            />
            <Select
              label="Subfolder"
              value={subfolderId}
              onChange={(e) => setSubfolderId(e.target.value)}
              disabled={!projectId}
              helperText={projectId && subfolders.length === 0 ? 'You are not a member of any subfolder here.' : undefined}
              options={[{ value: '', label: 'Select a subfolder' }, ...subfolders.map((s) => ({ value: s.id, label: s.name }))]}
            />
          </div>
        )}

        <Input label="Title" placeholder="e.g. Write homepage copy" value={title} onChange={(e) => setTitle(e.target.value)} required />
        <div>
          <span className="mb-1.5 block text-[12.5px] font-bold text-[var(--tm-ink-soft)]">Description</span>
          <RichEditor
            key={`${task?.id ?? 'new'}-${prefill?.messageId ?? ''}-${isOpen}`}
            ref={descEditor}
            initialHtml={task ? toHtml(task) : (prefill?.description ?? '')}
            placeholder="What needs to be done, and what does done look like?"
            onChange={({ empty }) => setDescEmpty(empty)}
            maxHeightClass="max-h-64"
            label="Description"
          />
          {descEmpty && <span className="sr-only">The description is required.</span>}
          {prefill?.fileName && <p className="mt-1.5 text-[12px] text-[var(--tm-ink-muted)]">“{prefill.fileName}” from the message is attached to the task.</p>}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label="Assignee"
            value={assigneeId}
            onChange={(e) => setAssigneeId(e.target.value)}
            options={assignees.length ? assignees.map((a) => ({ value: a.id, label: a.id === me?.id ? `${a.name} (me)` : a.name })) : [{ value: '', label: 'Pick a subfolder first' }]}
          />
          <Input label="Start date" type="date" value={startDate} max={dueDate || undefined} onChange={(e) => setStartDate(e.target.value)} />
          <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          <Select
            label="Priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ApiPriority)}
            options={PRIORITIES}
          />
        </div>

        <AssetPicker
          value={assets}
          onChange={changeAssets}
          onUploaded={(ids) => ids.forEach((id) => uploaded.current.add(id))}
        />

        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={close}>
            Cancel
          </Button>
          <Button type="submit">{task ? 'Save changes' : 'Create task'}</Button>
        </div>
      </form>
    </Modal>
  );
};
