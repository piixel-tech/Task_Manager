import React, { useEffect, useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { Select } from '../../../components/ui/Select';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { FadeIn } from '../../../components/ui/FadeIn';
import { portalApi, type PortalProject } from '../../../services/http/portalApi';
import { RequirementsPanel } from '../../requirements/components/RequirementsPanel';

/** What the client has asked for: add to it, search it, and see how it has changed. */
export const ClientRequirementsPage: React.FC = () => {
  const [projects, setProjects] = useState<PortalProject[] | null>(null);
  const [projectId, setProjectId] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    portalApi
      .projects()
      .then((p) => {
        setProjects(p);
        setProjectId(p[0]?.id ?? '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load your projects'));
  }, []);

  const project = projects?.find((p) => p.id === projectId);

  return (
    <>
      <PageHeader title="Requirements" description="A running record of what you have asked for. Add to it any time; the team sees it straight away." />
      {error && <div className="tm-error px-4 py-3 text-xs font-semibold">{error}</div>}
      {!projects ? (
        error ? null : <SkeletonGrid count={2} />
      ) : !project ? (
        <EmptyState icon={<ClipboardList className="h-6 w-6 text-[var(--tm-primary-dark)]" />} title="No project yet" description="Once you are added to a project you can record your requirements here." />
      ) : (
        <FadeIn>
          {projects.length > 1 && (
            <div className="sm:w-72">
              <Select label="Project" value={projectId} onChange={(e) => setProjectId(e.target.value)} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
            </div>
          )}
          <RequirementsPanel key={project.id} projectId={project.id} subfolders={project.subfolders} />
        </FadeIn>
      )}
    </>
  );
};
