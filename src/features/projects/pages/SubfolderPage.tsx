import { FadeIn } from '../../../components/ui/FadeIn';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { MuteMenu } from '../../../components/ui/MuteMenu';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import { useAuthStore } from '../../../store/authStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { InfoTip } from '../../../components/ui/InfoTip';
import { confirmDeleteSubfolder } from '../deleteConfirm';
import { projectApi, type ProjectDetail, type Subfolder } from '../../../services/http/projectApi';
import { PersonChip } from '../components/PersonChip';
import { SubfolderFormModal } from '../components/SubfolderFormModal';
import { ViewOnlyBadge, VisibilityIcon } from '../components/VisibilityIcon';
import { VisibilityMenu } from '../components/VisibilityMenu';
import { ChecklistTab } from '../components/ChecklistTab';
import { DeliverablesTab } from '../components/DeliverablesTab';
import { ChangesBox } from '../../activity/components/ChangesBox';
import { activityApi } from '../../../services/http/activityApi';
import { SubfolderTasksTab, useSubfolderTasks, type TaskFilter } from '../components/SubfolderTasks';

type Tab = 'overview' | 'tasks' | 'checklist' | 'deliverables' | 'changes';
const TABS: Tab[] = ['overview', 'tasks', 'checklist', 'deliverables', 'changes'];

export const SubfolderPage: React.FC = () => {
  const { projectId = '', id = '' } = useParams<{ projectId: string; id: string }>();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const confirm = useConfirm();
  const prefix = user?.role === 'admin' ? '/admin' : '/app';

  const [subfolder, setSubfolder] = useState<Subfolder | null>(null);
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab') as Tab | null;
  // A notification links straight to an entry of the Mid-way changes box.
  const tab: Tab = requested && TABS.includes(requested) ? requested : params.get('entry') ? 'changes' : 'overview';
  const [openChanges, setOpenChanges] = useState(0);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const taskData = useSubfolderTasks(id);

  const load = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([projectApi.getSubfolder(id), projectApi.get(projectId)]);
      setSubfolder(s);
      setProject(p);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the subfolder');
    } finally {
      setLoading(false);
    }
  }, [id, projectId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    activityApi.subfolder(id).then((l) => setOpenChanges(l.unresolved)).catch(() => {});
  }, [id]);

  if (loading) return <SkeletonGrid count={2} />;
  if (!subfolder || !project) {
    return (
      <EmptyState
        title="Subfolder unavailable"
        description={error ?? 'This subfolder does not exist or you are not part of its project.'}
        actionLabel="Back to projects"
        onAction={() => navigate(`${prefix}/projects`)}
      />
    );
  }

  const headIds = new Set(subfolder.heads.map((h) => h.id));
  const others = subfolder.members.filter((m) => !headIds.has(m.id));
  const siblings = project.subfolders.filter((s) => s.id !== subfolder.id);

  return (
    <FadeIn>
      <PageHeader
        backTo={`${prefix}/projects/${project.id}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {subfolder.name}
            <VisibilityMenu subfolder={subfolder} onChanged={setSubfolder} />
            <InfoTip topic="sub-visibility">The eye shows who can see this subfolder: only its members, everyone in the company, or people picked to view only. Viewers can read but not change anything.</InfoTip>
            {subfolder.viewer_is_head && <HeadBadge />}
            {!subfolder.can_work && <ViewOnlyBadge />}
          </span>
        }
        description={
          <button
            type="button"
            className="font-semibold text-[var(--tm-primary-dark)] hover:underline"
            onClick={() => navigate(`${prefix}/projects/${project.id}`)}
          >
            {project.name}
          </button>
        }
        actions={
          <div className="flex items-center gap-2">
            <MuteMenu mutedKey={`subfolder:${subfolder.id}`} />
            {subfolder.can_edit && (
              <Button size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil className="h-4 w-4" />}>
                Edit subfolder
              </Button>
            )}
            {/* Admins only; a project always keeps at least one subfolder. The confirmation lists what is inside and asks for the name. */}
            {user?.role === 'admin' && project.subfolders.length > 1 && (
              <Button
                size="sm"
                variant="danger"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => void confirmDeleteSubfolder(confirm, subfolder).then((ok) => ok && navigate(`${prefix}/projects/${project.id}`))}
              >
                Delete subfolder
              </Button>
            )}
          </div>
        }
      />

      <div className="mt-6">
      <PillTabs
        activeTab={tab}
        onChange={(t) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'tasks', label: 'Tasks' },
          { id: 'checklist', label: 'Essentials' },
          { id: 'deliverables', label: 'Deliverables' },
          { id: 'changes', label: 'Mid-way changes', count: openChanges || undefined }
        ]}
      />
      </div>

      <div className="mt-6 space-y-5">
      {tab === 'tasks' && <SubfolderTasksTab data={taskData} filter={taskFilter} onFilter={setTaskFilter} />}
      {tab === 'checklist' && <ChecklistTab subfolderId={subfolder.id} />}
      {tab === 'deliverables' && <DeliverablesTab key={subfolder.id} subfolderId={subfolder.id} />}
      {tab === 'changes' && <ChangesBox subfolderId={subfolder.id} projectId={project.id} onCount={setOpenChanges} />}

      {!subfolder.can_work && (
        <div className="flex items-center gap-2.5 rounded-[var(--tm-radius-md)] bg-[var(--tm-info-bg)] px-4 py-3 text-[13px] text-[var(--tm-info)]">
          <Eye className="h-4 w-4 shrink-0" />
          View only. You can read this subfolder, but not add tasks, essentials or comments.
        </div>
      )}

      {tab === 'overview' && subfolder.can_work && !subfolder.can_edit && (
        <div className="flex items-center gap-2.5 rounded-[var(--tm-radius-md)] bg-[var(--tm-info-bg)] px-4 py-3 text-[13px] text-[var(--tm-info)]">
          <Eye className="h-4 w-4 shrink-0" />
          Read-only. Only the heads of this subfolder (and admins) can change its name, members or heads.
        </div>
      )}

      {tab === 'overview' && (
        <div className="grid grid-cols-2 gap-5 md:grid-cols-2 xl:grid-cols-3 max-sm:gap-2.5">
          <Card className="min-w-0">
            <CardHeader>
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-1.5 text-base font-extrabold">
                  Heads
                  <InfoTip topic="sub-structure">A head looks after one subfolder: they manage its people and can approve its work. It is a job on a subfolder, not a separate kind of account.</InfoTip>
                </CardTitle>
                <CardDescription>They lead this subfolder and approve its work.</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-x-6 gap-y-3">
              {subfolder.heads.map((h) => (
                <PersonChip key={h.id} person={h} isHead size="md" active={taskData.activeIds.has(h.id)} />
              ))}
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <div className="min-w-0">
<CardTitle className="text-base font-extrabold">Members ({others.length})</CardTitle>
<CardDescription>People who work in this subfolder.</CardDescription>
</div>
            </CardHeader>
            <CardContent>
              {others.length === 0 ? (
                <p className="text-[13px] text-[var(--tm-ink-muted)]">Only the heads so far.</p>
              ) : (
                <ul className="grid gap-3">
                  {others.map((m) => (
                    <li key={m.id} className="min-w-0">
                      <PersonChip person={m} size="md" active={taskData.activeIds.has(m.id)} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card className="min-w-0 md:col-span-2 xl:col-span-1">
            <CardHeader>
              <div className="min-w-0">
<CardTitle className="text-base font-extrabold">Other subfolders</CardTitle>
<CardDescription>Jump to the rest of this project.</CardDescription>
</div>
            </CardHeader>
            <CardContent>
              {siblings.length === 0 ? (
                <p className="text-[13px] text-[var(--tm-ink-muted)]">This is the only subfolder.</p>
              ) : (
                <ul className="space-y-2">
                  {siblings.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`${prefix}/projects/${project.id}/subfolders/${s.id}`)}
                        className="flex w-full items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-3 text-left transition-colors hover:bg-[var(--tm-bg-sunken)]"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <VisibilityIcon visibility={s.visibility} className="h-3.5 w-3.5 text-[var(--tm-ink-soft)]" />
                          <span className="truncate text-[13px] font-bold text-[var(--tm-ink)]">{s.name}</span>
                        </span>
                        {s.viewer_is_head && <HeadBadge />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

        </div>
      )}
      </div>

      <SubfolderFormModal
        isOpen={editing}
        onClose={() => setEditing(false)}
        projectId={project.id}
        subfolder={subfolder}
        onSaved={load}
      />
    </FadeIn>
  );
};
