import { formatDate } from '../../../utils/time';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import { FolderCard } from '../../../components/ui/FolderCard';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { PageHeader } from '../../../components/ui/PageHeader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { fetchCompanies, type ApiCompany } from '../../../services/http/mappers';
import { projectApi, type Project } from '../../../services/http/projectApi';
import { ProjectFormModal } from '../components/ProjectFormModal';

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const companyFilter = useAppStore((s) => s.companyFilter);
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [projects, setProjects] = useState<Project[]>([]);
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [list, cs] = await Promise.all([projectApi.list(), fetchCompanies()]);
      setProjects(list);
      setCompanies(cs);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load projects');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const companyName = (id: string) => companies.find((c) => c.id === id)?.name ?? '';
  const visible = projects.filter(
    (p) => !isAdmin || companyFilter === 'all' || p.company_ids.some((id) => companyName(id).toLowerCase() === companyFilter)
  );

  return (
    <>
      <PageHeader
        title="Projects"
        description={
          isAdmin
            ? 'Every project has subfolders. Each subfolder has its own heads and members.'
            : 'The projects you are part of. You can open every subfolder in them; heads can edit their own.'
        }
        actions={
          isAdmin && (
            <Button size="sm" onClick={() => setCreating(true)} leftIcon={<Plus className="h-4 w-4" />}>
              New project
            </Button>
          )
        }
      />

      {error && (
        <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>
      )}

      {loading ? (
        <SkeletonGrid count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title="No projects yet"
          description={
            isAdmin ? 'Create the first project and appoint a head for its first subfolder.' : 'You have not been added to a project yet.'
          }
          actionLabel={isAdmin ? 'New project' : undefined}
          onAction={isAdmin ? () => setCreating(true) : undefined}
        />
      ) : (
        <div className="animate-fade-in">
          <h2 className="mb-3 text-[20px] font-bold text-[var(--tm-ink)]">Folders</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const companyNames = p.company_ids.map((id) => companyName(id).toLowerCase()).filter(Boolean);
              return (
                <FolderCard
                  key={p.id}
                  title={p.name}
                  subtitle={`${p.subfolder_count} subfolder${p.subfolder_count === 1 ? '' : 's'}`}
                  tooltip={[p.description, p.start_date && `Starts ${formatDate(`${p.start_date}T00:00:00`, 'MMM d, yyyy')}`].filter(Boolean).join(' · ')}
                  badge={
                    companyNames.length > 0 && (
                      <span className="flex flex-wrap justify-end gap-1">
                        {companyNames.map((company) => (
                          <Badge key={company} variant={company === 'unwork' ? 'unwork' : 'piixel'} size="sm" className="capitalize">
                            {company}
                          </Badge>
                        ))}
                      </span>
                    )
                  }
                  onClick={() => navigate(`${prefix}/projects/${p.id}`)}
                />
              );
            })}
          </div>
        </div>
      )}

      <ProjectFormModal
        isOpen={creating}
        onClose={() => setCreating(false)}
        onSaved={(project) => navigate(`${prefix}/projects/${project.id}`)}
      />
    </>
  );
};
