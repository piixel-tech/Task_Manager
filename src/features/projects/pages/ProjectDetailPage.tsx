import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, Eye, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { HeadBadge } from '../../../components/ui/HeadBadge';
import { useAuthStore } from '../../../store/authStore';
import { useConfirm } from '../../../hooks/useConfirm';
import { fetchCompanies } from '../../../services/http/mappers';
import { projectApi, type ProjectDetail } from '../../../services/http/projectApi';
import { PillTabs } from '../../../components/ui/PillTabs';
import { RequirementsPanel } from '../../requirements/components/RequirementsPanel';
import { PersonChip } from '../components/PersonChip';
import { ProjectFormModal } from '../components/ProjectFormModal';
import { SubfolderFormModal } from '../components/SubfolderFormModal';

export const ProjectDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const user = useAuthStore((s) => s.user);
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'requirements' ? 'requirements' : 'subfolders';
  const prefix = user?.role === 'admin' ? '/admin' : '/app';

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [company, setCompany] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingSubfolder, setAddingSubfolder] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, companies] = await Promise.all([projectApi.get(id), fetchCompanies()]);
      setProject(p);
      setCompany(companies.find((c) => c.id === p.company_id)?.name.toLowerCase() ?? '');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load the project');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  if (loading) return <SkeletonGrid count={3} />;
  if (!project) {
    return (
      <EmptyState
        title="Project unavailable"
        description={error ?? 'This project does not exist or you are not part of it.'}
        actionLabel="Back to projects"
        onAction={() => navigate(`${prefix}/projects`)}
      />
    );
  }

  const deleteProject = () =>
    confirm({
      title: `Delete ${project.name}?`,
      message: 'Its subfolders are deleted too, and everyone on it is notified. This cannot be undone.',
      confirmLabel: 'Delete project',
      danger: true,
      action: () => projectApi.remove(project.id),
      successTitle: 'Project deleted'
    }).then((ok) => ok && navigate(`${prefix}/projects`));

  const editableCount = project.subfolders.filter((s) => s.can_edit).length;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name}
            {company && (
              <Badge variant={company === 'unwork' ? 'unwork' : 'piixel'} className="capitalize">
                {company}
              </Badge>
            )}
          </span>
        }
        description={
          project.clients.length > 0 ? `Clients: ${project.clients.map((c) => c.name).join(', ')}` : 'Subfolders of this project.'
        }
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate(`${prefix}/projects`)}>
              All projects
            </Button>
            {project.can_edit && (
              <>
                <Button variant="outline" size="sm" onClick={() => setEditing(true)} leftIcon={<Pencil className="h-4 w-4" />}>
                  Edit project
                </Button>
                <Button variant="danger" size="sm" onClick={deleteProject} leftIcon={<Trash2 className="h-4 w-4" />}>
                  Delete
                </Button>
              </>
            )}
            {project.can_create_subfolder && (
              <Button size="sm" onClick={() => setAddingSubfolder(true)} leftIcon={<Plus className="h-4 w-4" />}>
                New subfolder
              </Button>
            )}
          </>
        }
      />

      <PillTabs
        activeTab={tab}
        onChange={(t) => setParams(t === 'requirements' ? { tab: 'requirements' } : {}, { replace: true })}
        tabs={[
          { id: 'subfolders', label: 'Subfolders', count: project.subfolders.length },
          { id: 'requirements', label: 'Requirements' }
        ]}
      />

      {tab === 'requirements' ? (
        <RequirementsPanel projectId={project.id} subfolders={project.subfolders.map((s) => ({ id: s.id, name: s.name }))} />
      ) : (
        <>
      {editableCount === 0 && user?.role !== 'admin' && (
        <div className="flex items-center gap-2.5 rounded-[var(--tm-radius-md)] bg-[var(--tm-info-bg)] px-4 py-3 text-[13px] text-[var(--tm-info)]">
          <Eye className="h-4 w-4 shrink-0" />
          You can view every subfolder in this project. Only the heads of a subfolder can edit it.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        {project.subfolders.map((s) => (
          <Card key={s.id} interactive animate={false} onClick={() => navigate(`${prefix}/projects/${project.id}/subfolders/${s.id}`)}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-[16px] font-bold text-[var(--tm-ink)]">{s.name}</h3>
                <div className="flex items-center gap-2">
                  {s.viewer_is_head && <HeadBadge />}
                  {!s.can_edit && (
                    <Badge variant="default" size="sm" className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Read-only
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">Heads</div>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {s.heads.map((h) => (
                    <PersonChip key={h.id} person={h} isHead />
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-[var(--tm-primary)]" />
                  {s.members.length} member{s.members.length === 1 ? '' : 's'}
                </span>
                <ArrowRight className="h-4 w-4 text-[var(--tm-ink-muted)]" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
        </>
      )}

      <ProjectFormModal isOpen={editing} onClose={() => setEditing(false)} project={project} onSaved={load} />
      <SubfolderFormModal
        isOpen={addingSubfolder}
        onClose={() => setAddingSubfolder(false)}
        projectId={project.id}
        onSaved={load}
      />
    </>
  );
};
