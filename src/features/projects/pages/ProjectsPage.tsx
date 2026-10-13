import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Calendar, Layers, ArrowRight, Edit3, CheckCircle } from 'lucide-react';
import { projectService, taskService, userService } from '../../../services';
import type { Project, Task, User } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { AnimatePresence, motion } from 'motion/react';
import { StatusChip } from '../../../components/ui/StatusChip';
import { AvatarStack } from '../../../components/ui/AvatarStack';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { PillTabs } from '../../../components/ui/PillTabs';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { EmptyState } from '../../../components/ui/EmptyState';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { fastT, listItemVariants } from '../../../components/ui/motion';
import { UserName } from '../../../components/ui/UserName';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { formatDate, getTodayDateString } from '../../../utils/time';

export const ProjectsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { companyFilter, showToast } = useAppStore();
  const isAdmin = user?.role === 'admin';
  const { reduced } = useMotionPrefs();
  const todayStr = getTodayDateString();
  const prefix = isAdmin ? '/admin' : '/app';

  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeUsers, setActiveUsers] = useState<User[]>([]);
  const [statusTab, setStatusTab] = useState<'all' | 'open' | 'completed'>('all');

  // Modal Controls
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [description, setDescription] = useState('');
  const [company, setCompany] = useState<'piixel' | 'unwork' | 'both'>('piixel');
  const [startDate, setStartDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  const fetchData = async () => {
    const [prjList, tskList, usrList] = await Promise.all([
      projectService.getProjects(undefined, isAdmin ? undefined : user?.id),
      taskService.getTasks(),
      userService.getUsers()
    ]);
    setProjects(prjList);
    setTasks(tskList);
    setActiveUsers(usrList.filter((u) => u.active));
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  const resetForm = () => {
    setName('');
    setClientName('');
    setDescription('');
    setCompany('piixel');
    setStartDate('');
    setDeadline('');
    setSelectedUserIds(user ? [user.id] : []);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) return;

    try {
      await projectService.createProject({
        name,
        clientName,
        description,
        company,
        status: 'in_progress',
        assignedUserIds: selectedUserIds,
        memberIds: selectedUserIds,
        startDate,
        deadline
      });
      showToast('Project created successfully!');
      setIsCreateModalOpen(false);
      resetForm();
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create project');
    }
  };

  const handleEditProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProject) return;

    try {
      await projectService.updateProject(editingProject.id, {
        name,
        clientName,
        description,
        company,
        startDate,
        deadline,
        assignedUserIds: selectedUserIds
      });
      showToast('Project updated successfully!');
      setEditingProject(null);
      resetForm();
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update project');
    }
  };

  const handleCloseProject = async (e: React.MouseEvent, prjId: string) => {
    e.stopPropagation();
    try {
      await projectService.closeProject(prjId);
      showToast('Project marked as Completed/Closed!');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to close project');
    }
  };

  const openEditModal = (e: React.MouseEvent, prj: Project) => {
    e.stopPropagation();
    setEditingProject(prj);
    setName(prj.name);
    setClientName(prj.clientName || '');
    setDescription(prj.description);
    setCompany(prj.company);
    setStartDate(prj.startDate || '');
    setDeadline(prj.deadline || '');
    setSelectedUserIds(prj.assignedUserIds);
  };

  const toggleMemberSelection = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter((id) => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const companyProjects = projects.filter(
    (p) => companyFilter === 'all' || p.company === companyFilter || p.company === 'both'
  );

  const openCount = companyProjects.filter((p) => p.status !== 'completed').length;
  const completedCount = companyProjects.filter((p) => p.status === 'completed').length;

  const filteredProjects = companyProjects.filter((p) =>
    statusTab === 'all'
      ? true
      : statusTab === 'completed'
        ? p.status === 'completed'
        : p.status !== 'completed'
  );

  return (
    <>
      <PageHeader
        title={isAdmin ? 'All projects' : 'My projects'}
        description={
          isAdmin
            ? 'Manage brand redesigns, SaaS platforms and team allocations.'
            : 'Projects assigned to your profile across Piixel and Unwork.'
        }
        actions={
          isAdmin && (
            <Button
              size="sm"
              onClick={() => {
                resetForm();
                setIsCreateModalOpen(true);
              }}
              leftIcon={<Plus className="h-4 w-4" />}
            >
              New project
            </Button>
          )
        }
      />

      <StaggerItem>
        <PillTabs
          activeTab={statusTab}
          onChange={(t) => setStatusTab(t as typeof statusTab)}
          tabs={[
            { id: 'all', label: 'All', count: companyProjects.length },
            { id: 'open', label: 'In progress', count: openCount },
            { id: 'completed', label: 'Completed', count: completedCount }
          ]}
        />
      </StaggerItem>

      {filteredProjects.length === 0 ? (
        <EmptyState
          icon={<Layers className="h-6 w-6" />}
          title="No projects here"
          description={
            isAdmin
              ? 'Create a project to start assigning tasks to the team.'
              : 'You have not been added to any project in this view yet.'
          }
        />
      ) : (
        <motion.div
          layout={!reduced}
          className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredProjects.map((project) => {
              const prjTasks = tasks.filter((t) => t.projectId === project.id);
              const completedTasks = prjTasks.filter((t) => t.status === 'completed');
              const progressPercent =
                prjTasks.length > 0
                  ? Math.round((completedTasks.length / prjTasks.length) * 100)
                  : 0;

              // Any member currently running a task inside this project
              const activeMemberInProject = project.assignedUserIds.some((uid) =>
                prjTasks.some((t) => t.sessions.some((s) => !s.endTime && s.userId === uid))
              );

              const members = activeUsers
                .filter((u) => project.assignedUserIds.includes(u.id))
                .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl }));

              const overdue =
                !!project.deadline &&
                project.status !== 'completed' &&
                project.deadline < todayStr;

              return (
                <motion.article
                  key={project.id}
                  layout={!reduced}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  whileHover={reduced ? undefined : { y: -3 }}
                  transition={fastT}
                  onClick={() => navigate(`${prefix}/projects/${project.id}`)}
                  className="group flex cursor-pointer flex-col overflow-hidden rounded-[var(--tm-radius-xl)]
                    border border-[var(--tm-border)] bg-[var(--tm-card)] shadow-soft-xs
                    transition-shadow hover:shadow-soft"
                >
                  <div className="flex-1 p-6">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            project.company === 'piixel'
                              ? 'piixel'
                              : project.company === 'unwork'
                                ? 'unwork'
                                : 'both'
                          }
                          size="sm"
                          className="capitalize"
                        >
                          {project.company}
                        </Badge>
                        {activeMemberInProject && (
                          <StatusChip tone="ok" size="sm" dot>
                            Live task
                          </StatusChip>
                        )}
                      </div>

                      <StatusChip status={project.status} size="sm" />
                    </div>

                    <h3 className="mt-3.5 text-[17px] font-bold leading-snug text-[var(--tm-ink)]">
                      {project.name}
                    </h3>

                    {project.clientName && (
                      <p className="mt-1 text-[12.5px] font-semibold text-[var(--tm-primary)]">
                        {project.clientName}
                      </p>
                    )}

                    {project.description && (
                      <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[var(--tm-ink-soft)]">
                        {project.description}
                      </p>
                    )}

                    {/* Progress */}
                    <div className="mt-5">
                      <div className="mb-2 flex items-center justify-between text-[12px] font-semibold">
                        <span className="flex items-center gap-1.5 text-[var(--tm-ink-soft)]">
                          <Layers className="h-3.5 w-3.5 text-[var(--tm-ink-muted)]" />
                          {completedTasks.length}/{prjTasks.length} tasks
                        </span>
                        <span className="text-[var(--tm-primary)] tabular-nums">
                          {progressPercent}%
                        </span>
                      </div>
                      <ProgressBar value={progressPercent} height={8} />
                    </div>

                    {/* Team */}
                    <div className="mt-5 border-t border-[var(--tm-border)] pt-4">
                      <div className="mb-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                        Assigned team
                      </div>
                      <AvatarStack people={members} max={5} size="sm" />
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-[var(--tm-border)] bg-[var(--tm-card-muted)] px-6 py-3.5">
                    <span
                      className={`flex items-center gap-1.5 text-[12px] font-semibold ${
                        overdue ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink-muted)]'
                      }`}
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      Due {formatDate(project.deadline)}
                    </span>

                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {isAdmin && project.status !== 'completed' && (
                        <>
                          <button
                            onClick={(e) => openEditModal(e, project)}
                            title="Edit project"
                            aria-label="Edit project"
                            className="grid h-8 w-8 place-items-center rounded-full text-[var(--tm-ink-muted)]
                              transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-primary)]"
                          >
                            <Edit3 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={(e) => handleCloseProject(e, project.id)}
                            title="Mark project complete"
                            aria-label="Mark project complete"
                            className="grid h-8 w-8 place-items-center rounded-full text-[var(--tm-ink-muted)]
                              transition-colors hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-success)]"
                          >
                            <CheckCircle className="h-4 w-4" />
                          </button>
                        </>
                      )}
                      <span className="ml-1 inline-flex items-center gap-1 text-[12px] font-bold text-[var(--tm-primary)]">
                        Details
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </span>
                    </div>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Create / Edit Project Modal */}
      <Modal
        isOpen={isCreateModalOpen || !!editingProject}
        onClose={() => {
          setIsCreateModalOpen(false);
          setEditingProject(null);
        }}
        title={editingProject ? 'Edit Project' : 'Create New Project'}
        maxWidth="lg"
      >
        <form onSubmit={editingProject ? handleEditProject : handleCreateProject} className="space-y-4">
          <Input
            label="Project Name"
            placeholder="e.g. Piixel Brand Redesign V2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Client Name"
            placeholder="e.g. Acme Corp"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Company Ownership"
              value={company}
              onChange={(e) => setCompany(e.target.value as any)}
              options={[
                { value: 'piixel', label: 'Piixel Studio' },
                { value: 'unwork', label: 'Unwork SaaS' },
                { value: 'both', label: 'Both (Joint)' }
              ]}
            />

            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <Input
            label="Deadline"
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
              Description
            </label>
            <textarea
              className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
              rows={3}
              placeholder="Scope and deliverable objectives..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Member Picker Checkbox List with <UserName> */}
          <div className="space-y-2 pt-2 border-t border-[var(--tm-border)]">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
                Assign Team Members
              </label>
              <span className="text-xs font-bold text-[var(--tm-primary)] bg-[var(--tm-primary-softer)] px-2.5 py-0.5 rounded-full border border-[var(--tm-primary-soft)]">
                {selectedUserIds.length} selected
              </span>
            </div>
            <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)]">
              {activeUsers.map((u) => {
                const isSelected = selectedUserIds.includes(u.id);
                return (
                  <div
                    key={u.id}
                    onClick={() => toggleMemberSelection(u.id)}
                    className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--tm-primary-softer)] border border-[var(--tm-primary-soft)]'
                        : 'hover:bg-[var(--tm-bg-sunken)] border border-transparent'
                    }`}
                  >
                    <UserName user={u} size="sm" showBadge={true} />
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(u.id)}
                      onChange={() => toggleMemberSelection(u.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 text-[var(--tm-primary)] rounded border-[var(--tm-border-strong)] cursor-pointer"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--tm-border)]">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setIsCreateModalOpen(false);
                setEditingProject(null);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              {editingProject ? 'Save Project Changes' : 'Create Project'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
