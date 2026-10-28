import React, { useEffect, useState } from 'react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { useConfirm } from '../../../hooks/useConfirm';
import { userService } from '../../../services';
import { fetchCompanies, type ApiCompany } from '../../../services/http/mappers';
import { projectApi, type ProjectDetail, type UserBrief } from '../../../services/http/projectApi';
import { PeoplePicker } from './PeoplePicker';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Edit mode when set; otherwise creates a project with its first subfolder. */
  project?: ProjectDetail | null;
  onSaved: (project: ProjectDetail) => void;
}

/** Admin-only: create a project (with its first subfolder and head) or edit its details. */
export const ProjectFormModal: React.FC<Props> = ({ isOpen, onClose, project, onSaved }) => {
  const confirm = useConfirm();
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [team, setTeam] = useState<UserBrief[]>([]);
  const [clientUsers, setClientUsers] = useState<UserBrief[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [subName, setSubName] = useState('');
  const [heads, setHeads] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setName(project?.name ?? '');
    setClientIds(project?.client_ids ?? []);
    setSubName('');
    setHeads([]);
    setMembers([]);
    Promise.all([fetchCompanies(), projectApi.directory(), userService.getUsers()])
      .then(([cs, dir, users]) => {
        setCompanies(cs);
        setTeam(dir);
        setClientUsers(
          users
            .filter((u) => u.role === 'client' && u.active)
            .map((u) => ({ id: u.id, name: u.name, avatar_url: u.avatarUrl ?? null, role: 'client', company_id: u.companyId ?? null }))
        );
        setCompanyId(project?.company_id ?? cs[0]?.id ?? '');
      })
      .catch((err) => setError(err.message));
  }, [isOpen, project]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setError('Give the project a name.');
    if (!project && !subName.trim()) return setError('Name the first subfolder.');
    if (!project && heads.length === 0) return setError('Appoint at least one head for the first subfolder.');
    setError(null);

    let saved: ProjectDetail | undefined;
    const ok = await confirm({
      title: project ? `Save changes to ${project.name}?` : `Create project “${name.trim()}”?`,
      message: project ? undefined : 'The first subfolder is created with it, and its team is notified.',
      confirmLabel: project ? 'Save' : 'Create project',
      action: async () => {
        saved = project
          ? await projectApi.update(project.id, { name: name.trim(), company_id: companyId, client_ids: clientIds })
          : await projectApi.create({
              name: name.trim(),
              company_id: companyId,
              client_ids: clientIds,
              first_subfolder: { name: subName.trim(), head_ids: heads, member_ids: members }
            });
      },
      successTitle: project ? 'Project updated' : 'Project created'
    });
    if (ok && saved) {
      onSaved(saved);
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={project ? 'Edit project' : 'New project'}
      description={project ? undefined : 'Every project starts with one subfolder and at least one head.'}
      maxWidth="lg"
    >
      <form onSubmit={submit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}
        <Input label="Project name" placeholder="e.g. Acme website" value={name} onChange={(e) => setName(e.target.value)} required />
        <Select
          label="Company"
          value={companyId}
          onChange={(e) => setCompanyId(e.target.value)}
          options={companies.map((c) => ({ value: c.id, label: c.name }))}
        />
        {clientUsers.length > 0 && (
          <PeoplePicker label="Clients (optional)" people={clientUsers} value={clientIds} onChange={setClientIds} />
        )}

        {!project && (
          <div className="space-y-4 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-4">
            <h4 className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
              First subfolder
            </h4>
            <Input label="Name" placeholder="e.g. Design" value={subName} onChange={(e) => setSubName(e.target.value)} />
            <PeoplePicker
              label="Heads"
              hint="At least one. A head is also a member."
              people={team}
              value={heads}
              onChange={(ids) => {
                setHeads(ids);
                setMembers((m) => m.filter((id) => !ids.includes(id)));
              }}
            />
            <PeoplePicker label="Members" people={team} value={members} onChange={setMembers} lockedIds={heads} />
          </div>
        )}

        <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
          <Button variant="outline" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit">{project ? 'Save changes' : 'Create project'}</Button>
        </div>
      </form>
    </Modal>
  );
};
