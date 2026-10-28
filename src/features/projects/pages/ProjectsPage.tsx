import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, FolderKanban, Layers, Plus } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/Card';
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
    (p) => !isAdmin || companyFilter === 'all' || companyName(p.company_id).toLowerCase() === companyFilter
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
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</div>
      )}

      {loading ? (
        <SkeletonGrid count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<FolderKanban className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="No projects yet"
          description={
            isAdmin ? 'Create the first project and appoint a head for its first subfolder.' : 'You have not been added to a project yet.'
          }
          actionLabel={isAdmin ? 'New project' : undefined}
          onAction={isAdmin ? () => setCreating(true) : undefined}
        />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const company = companyName(p.company_id).toLowerCase();
            return (
              <Card key={p.id} interactive animate={false} onClick={() => navigate(`${prefix}/projects/${p.id}`)}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-[16px] font-bold leading-snug text-[var(--tm-ink)]">{p.name}</h3>
                    {company && (
                      <Badge variant={company === 'unwork' ? 'unwork' : 'piixel'} size="sm" className="capitalize">
                        {company}
                      </Badge>
                    )}
                  </div>
                  <div className="mt-5 flex items-center justify-between text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-4 w-4 text-[var(--tm-primary)]" />
                      {p.subfolder_count} subfolder{p.subfolder_count === 1 ? '' : 's'}
                    </span>
                    <ArrowRight className="h-4 w-4 text-[var(--tm-ink-muted)]" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
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
