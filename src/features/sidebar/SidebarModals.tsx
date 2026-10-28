import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { useConfirm } from '../../hooks/useConfirm';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/useChatStore';
import { useSidebarStore } from '../../store/useSidebarStore';
import { projectApi } from '../../services/http/projectApi';
import type { ProjectNode } from '../../services/http/sidebarApi';
import { NewGroupModal } from '../chat/components/NewGroupModal';
import { ProjectFormModal } from '../projects/components/ProjectFormModal';
import { SubfolderFormModal } from '../projects/components/SubfolderFormModal';
import { RequirementFormModal } from '../requirements/components/RequirementFormModal';
import { TaskFormModal } from '../tasks/components/TaskFormModal';

export type SidebarAction =
  | { kind: 'project' }
  | { kind: 'subfolder'; project: ProjectNode }
  | { kind: 'task'; project: ProjectNode; subfolderId?: string }
  | { kind: 'requirement'; project: ProjectNode }
  | { kind: 'group'; subfolderId?: string }
  | { kind: 'rename'; target: { type: 'project' | 'subfolder'; id: string; name: string } };

interface Props {
  action: SidebarAction | null;
  onClose: () => void;
}

/** The forms behind the sidebar's "+" and "⋯" menus. Each one is the normal form for that thing. */
export const SidebarModals: React.FC<Props> = ({ action, onClose }) => {
  const navigate = useNavigate();
  const prefix = useAuthStore((s) => (s.user?.role === 'admin' ? '/admin' : '/app'));
  const { load, expand } = useSidebarStore.getState();
  const done = () => {
    void load();
    onClose();
  };

  return (
    <>
      <ProjectFormModal
        isOpen={action?.kind === 'project'}
        onClose={onClose}
        onSaved={(p) => {
          expand(`p:${p.id}`);
          done();
          navigate(`${prefix}/projects/${p.id}`);
        }}
      />

      {action?.kind === 'subfolder' && (
        <SubfolderFormModal
          isOpen
          onClose={onClose}
          projectId={action.project.id}
          onSaved={(s) => {
            expand(`p:${action.project.id}`);
            done();
            navigate(`${prefix}/projects/${action.project.id}/subfolders/${s.id}`);
          }}
        />
      )}

      <TaskFormModal
        isOpen={action?.kind === 'task'}
        onClose={onClose}
        defaultProjectId={action?.kind === 'task' ? action.project.id : undefined}
        defaultSubfolderId={action?.kind === 'task' ? action.subfolderId : undefined}
        onSaved={(t) => {
          done();
          navigate(`${prefix}/tasks/${t.id}`);
        }}
      />

      {action?.kind === 'requirement' && (
        <RequirementFormModal
          isOpen
          onClose={onClose}
          projectId={action.project.id}
          subfolders={action.project.subfolders.map((s) => ({ id: s.id, name: s.name }))}
          onSaved={() => {
            done();
            navigate(`${prefix}/projects/${action.project.id}?tab=requirements`);
          }}
        />
      )}

      <NewGroupModal
        isOpen={action?.kind === 'group'}
        onClose={onClose}
        defaultSubfolderId={action?.kind === 'group' ? action.subfolderId : undefined}
        onCreated={(g) => {
          useChatStore.getState().upsertGroup(g);
          navigate(`${prefix}/chat?group=${g.id}`);
        }}
      />

      {action?.kind === 'rename' && <RenameModal target={action.target} onClose={onClose} onRenamed={done} />}
    </>
  );
};

const RenameModal: React.FC<{
  target: { type: 'project' | 'subfolder'; id: string; name: string };
  onClose: () => void;
  onRenamed: () => void;
}> = ({ target, onClose, onRenamed }) => {
  const confirm = useConfirm();
  const [name, setName] = useState(target.name);
  useEffect(() => setName(target.name), [target]);
  const clean = name.trim();
  const noun = target.type === 'project' ? 'project' : 'subfolder';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clean || clean === target.name) return;
    const ok = await confirm({
      title: `Rename ${noun} to “${clean}”?`,
      message: target.type === 'project' ? 'Everyone on the project sees the new name.' : 'Its members are notified of the new name.',
      confirmLabel: 'Rename',
      action: async () => {
        if (target.type === 'project') await projectApi.update(target.id, { name: clean });
        else await projectApi.updateSubfolder(target.id, { name: clean });
      },
      successTitle: `${noun[0].toUpperCase()}${noun.slice(1)} renamed`
    });
    if (ok) onRenamed();
  };

  return (
    <Modal isOpen onClose={onClose} title={`Rename ${noun}`} maxWidth="sm">
      <form onSubmit={submit} className="space-y-4">
        <Input label="Name" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!clean || clean === target.name}>
            Rename
          </Button>
        </div>
      </form>
    </Modal>
  );
};
