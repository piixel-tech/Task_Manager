import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Modal } from '../../../components/ui/Modal';
import { Button } from '../../../components/ui/Button';
import { Input, Textarea } from '../../../components/ui/Input';
import { useConfirm } from '../../../hooks/useConfirm';
import { useFieldErrors } from '../../../hooks/useFieldErrors';
import { FieldError, FieldGroup } from '../../../components/ui/FieldError';
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
  const f = useFieldErrors<'name' | 'company' | 'subName' | 'heads'>();
  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [team, setTeam] = useState<UserBrief[]>([]);
  const [clientUsers, setClientUsers] = useState<UserBrief[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [startDate, setStartDate] = useState('');
  const [description, setDescription] = useState('');
  const [clientIds, setClientIds] = useState<string[]>([]);
  const [subName, setSubName] = useState('');
  const [heads, setHeads] = useState<string[]>([]);
  const [members, setMembers] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setName(project?.name ?? '');
    setStartDate(project?.start_date ?? '');
    setDescription(project?.description ?? '');
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
        setCompanyIds(project?.company_ids ?? (cs[0] ? [cs[0].id] : []));
      })
      .catch((err) => setError(err.message));
  }, [isOpen, project]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const problems: Parameters<typeof f.fail>[0] = {};
    if (!name.trim()) problems.name = 'Enter a project name';
    if (companyIds.length === 0) problems.company = 'Pick at least one company';
    if (!project && !subName.trim()) problems.subName = 'Enter a name for the first subfolder';
    if (!project && heads.length === 0) problems.heads = 'Appoint at least one head for the first subfolder';
    if (Object.keys(problems).length > 0) return f.fail(problems);
    f.reset();
    setError(null);

    let saved: ProjectDetail | undefined;
    const ok = await confirm({
      title: project ? `Save changes to ${project.name}?` : `Create project “${name.trim()}”?`,
      message: project ? undefined : 'The first subfolder is created with it, and its team is notified.',
      confirmLabel: project ? 'Save' : 'Create project',
      action: async () => {
        saved = project
          ? await projectApi.update(project.id, {
            name: name.trim(),
            company_id: companyIds[0],
            company_ids: companyIds,
            start_date: startDate || null,
            description: description.trim(),
            client_ids: clientIds
          })
          : await projectApi.create({
            name: name.trim(),
            company_id: companyIds[0],
            company_ids: companyIds,
            start_date: startDate || null,
            description: description.trim(),
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
      <form noValidate onSubmit={submit} className="space-y-4">
        {error && (
          <div className="tm-error px-4 py-3 text-xs font-semibold">
            {error}
          </div>
        )}
        <Input
          label="Project name"
          placeholder="e.g. Acme website"
          value={name}
          data-field="name"
          data-label="project name"
          error={f.errors.name}
          onChange={(e) => {
            setName(e.target.value);
            f.clear('name');
          }}
          required
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Start date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <fieldset data-field="company">
            <legend className="mb-1.5 text-[13px] font-semibold text-[var(--tm-ink-soft)]">Company</legend>
            <div className="flex flex-wrap gap-2">
              {companies.map((c) => {
                const on = companyIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCompanyIds((ids) => (on ? ids.filter((i) => i !== c.id) : [...ids, c.id]));
                      f.clear('company');
                    }}
                    className={`inline-flex h-11 items-center gap-1.5 rounded-full border px-4 text-[13px] font-bold transition-colors ${on
                        ? 'border-[var(--tm-primary-light)] bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)]'
                        : 'border-[var(--tm-border)] bg-[var(--tm-card)] text-[var(--tm-ink-soft)] hover:border-[var(--tm-border-strong)]'
                      }`}
                  >
                    {on && <Check className="h-3.5 w-3.5" />}
                    {c.name}
                  </button>
                );
              })}
            </div>
            {f.errors.company ? <FieldError message={f.errors.company} /> : <p className="mt-1.5 text-[12px] text-[var(--tm-ink-muted)]">Pick one, or both for a shared project.</p>}
          </fieldset>
        </div>
        <Textarea
          label="Short description (optional)"
          placeholder="What is this project about?"
          rows={2}
          maxLength={200}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          helperText={`${description.length}/200`}
        />
        {clientUsers.length > 0 && (
          <PeoplePicker label="Clients (optional)" people={clientUsers} value={clientIds} onChange={setClientIds} />
        )}

        {!project && (
          <div className="space-y-4 rounded-[var(--tm-radius-lg)] bg-[var(--tm-subfolder-bg)] p-5">
            <div>
              <h4 className="text-[14px] font-bold text-[var(--tm-ink)]">First subfolder</h4>
              <p className="mt-0.5 text-[12px] text-[var(--tm-ink-muted)]">Where the work starts, and who leads it.</p>
            </div>
            <Input
              label="Name"
              placeholder="e.g. Design"
              value={subName}
              data-field="subName"
              data-label="name for the first subfolder"
              error={f.errors.subName}
              onChange={(e) => {
                setSubName(e.target.value);
                f.clear('subName');
              }}
            />
            <FieldGroup name="heads" error={f.errors.heads}>
              <PeoplePicker
                label="Heads"
                hint="At least one. A head is also a member."
                people={team}
                value={heads}
                onChange={(ids) => {
                  setHeads(ids);
                  setMembers((m) => m.filter((id) => !ids.includes(id)));
                  f.clear('heads');
                }}
              />
            </FieldGroup>
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
