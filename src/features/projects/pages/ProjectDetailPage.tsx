import { formatDate } from '../../../utils/time';
import { FadeIn } from '../../../components/ui/FadeIn';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import { FolderCard } from '../../../components/ui/FolderCard';
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
  const [companyNames, setCompanyNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [addingSubfolder, setAddingSubfolder] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, companies] = await Promise.all([projectApi.get(id), fetchCompanies()]);
      setProject(p);
      setCompanyNames(p.company_ids.map((cid) => companies.find((c) => c.id === cid)?.name.toLowerCase() ?? '').filter(Boolean));
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
    <FadeIn>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {project.name}
            {companyNames.map((company) => (
              <Badge key={company} variant={company === 'unwork' ? 'unwork' : 'piixel'} className="capitalize">
                {company}
              </Badge>
            ))}
          </span>
        }
        description={
          [
            project.description,
            project.start_date && `Starts ${formatDate(`${project.start_date}T00:00:00`, 'MMM d, yyyy')}`,
            project.clients.length > 0 && `Clients: ${project.clients.map((c) => c.name).join(', ')}`
          ]
            .filter(Boolean)
            .join(' · ') || 'Subfolders of this project.'
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

      <div className="mt-6">
      <PillTabs
        activeTab={tab}
        onChange={(t) => setParams(t === 'requirements' ? { tab: 'requirements' } : {}, { replace: true })}
        tabs={[
          { id: 'subfolders', label: 'Subfolders', count: project.subfolders.length },
          { id: 'requirements', label: 'Requirements' }
        ]}
      />
      </div>

      {tab === 'requirements' ? (
        <div className="mt-8">
          <RequirementsPanel projectId={project.id} subfolders={project.subfolders.map((s) => ({ id: s.id, name: s.name }))} />
        </div>
      ) : (
        <div className="mt-8 space-y-6 pb-4">
      {editableCount === 0 && user?.role !== 'admin' && (
        <div className="flex items-center gap-2.5 rounded-[var(--tm-radius-md)] bg-[var(--tm-info-bg)] px-4 py-3 text-[13px] text-[var(--tm-info)]">
          <Eye className="h-4 w-4 shrink-0" />
          You can view every subfolder in this project. Only the heads of a subfolder can edit it.
        </div>
      )}

      <div>
        <h2 className="mb-5 text-[20px] font-bold text-[var(--tm-ink)]">Folders</h2>
        <div className="grid grid-cols-2 gap-6 md:grid-cols-3 xl:grid-cols-4">
          {project.subfolders.map((s) => (
            <FolderCard
              key={s.id}
              title={s.name}
              subtitle={`${s.members.length} member${s.members.length === 1 ? '' : 's'}`}
              people={s.members.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatar_url ?? undefined }))}
              badge={
                <span className="flex items-center gap-1.5">
                  {s.viewer_is_head && <HeadBadge />}
                  {!s.can_edit && (
                    <Badge variant="default" size="sm" className="inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" /> Read-only
                    </Badge>
                  )}
                </span>
              }
              footer={s.heads.map((h) => (
                <PersonChip key={h.id} person={h} isHead size="xs" />
              ))}
              onClick={() => navigate(`${prefix}/projects/${project.id}/subfolders/${s.id}`)}
            />
          ))}
        </div>
      </div>
        </div>
      )}

      <ProjectFormModal isOpen={editing} onClose={() => setEditing(false)} project={project} onSaved={load} />
      <SubfolderFormModal
        isOpen={addingSubfolder}
        onClose={() => setAddingSubfolder(false)}
        projectId={project.id}
        onSaved={load}
      />
    </FadeIn>
  );
};
