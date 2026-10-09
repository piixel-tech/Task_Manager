import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, CheckSquare, Clock, Users, Share2, UserX, ShieldCheck, X, AlertTriangle } from 'lucide-react';
import { projectService, taskService, userService, chatService } from '../../../services';
import type { Project, Task, User, ChatRoom } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { formatHours } from '../../../utils/format';

export const ProjectDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'todo' | 'completed'>('all');
  
  const [clientRooms, setClientRooms] = useState<ChatRoom[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(user?.id || '');

  // Member management state
  const [isAddMembersModalOpen, setIsAddMembersModalOpen] = useState(false);
  const [selectedNewMemberIds, setSelectedNewMemberIds] = useState<string[]>([]);
  const [memberToRemove, setMemberToRemove] = useState<User | null>(null);
  const [runningTaskForRemove, setRunningTaskForRemove] = useState<Task | null>(null);

  // Add Client Modal states
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientCompany, setClientCompany] = useState<'piixel' | 'unwork'>('piixel');

  const fetchProjectData = async () => {
    if (!id) return;
    const [prj, tskList, uList, rList] = await Promise.all([
      projectService.getProjectById(id),
      taskService.getTasks(id),
      userService.getUsers(),
      chatService.getChatRooms(user?.id || 'usr_1')
    ]);
    setProject(prj);
    setTasks(tskList);
    setAllUsers(uList);
    setClientRooms(rList.filter(r => r.type === 'client' && r.projectId === id));
  };

  useEffect(() => {
    fetchProjectData();
  }, [id]);

  useEffect(() => {
    if (user?.id && !assignedUserId) {
      setAssignedUserId(user.id);
    }
  }, [user]);

  const handleRequestRemoveMember = (member: User) => {
    if (!project) return;
    const runningTask = tasks.find(
      (t) =>
        t.assignedUserId === member.id &&
        (t.status === 'in_progress' || t.sessions.some((s) => !s.endTime))
    );
    if (runningTask) {
      setMemberToRemove(member);
      setRunningTaskForRemove(runningTask);
    } else {
      executeRemoveMember(member.id, member.name);
    }
  };

  const executeRemoveMember = async (memberId: string, memberName: string) => {
    if (!project) return;
    try {
      const updatedMemberIds = (project.memberIds || []).filter((id) => id !== memberId);
      const updatedAssigned = (project.assignedUserIds || []).filter((id) => id !== memberId);
      await projectService.updateProject(project.id, {
        memberIds: updatedMemberIds,
        assignedUserIds: updatedAssigned
      });
      showToast(`Removed ${memberName} from project members.`);
      setMemberToRemove(null);
      setRunningTaskForRemove(null);
      fetchProjectData();
    } catch (err: any) {
      showToast(err.message || 'Failed to remove member');
    }
  };

  const handleAddMembersSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!project || selectedNewMemberIds.length === 0) return;
    try {
      const updatedMemberIds = Array.from(
        new Set([...(project.memberIds || []), ...selectedNewMemberIds])
      );
      const updatedAssigned = Array.from(
        new Set([...(project.assignedUserIds || []), ...selectedNewMemberIds])
      );
      await projectService.updateProject(project.id, {
        memberIds: updatedMemberIds,
        assignedUserIds: updatedAssigned
      });
      showToast('Project members updated!');
      setIsAddMembersModalOpen(false);
      setSelectedNewMemberIds([]);
      fetchProjectData();
    } catch (err: any) {
      showToast(err.message || 'Failed to add members');
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !clientName || !clientPhone) return;

    try {
      const { inviteCode } = await chatService.addClientRoom(id, clientName, clientCompany, clientPhone);
      showToast(`Client Room created! Generated Invite Code: ${inviteCode}`);
      setIsClientModalOpen(false);
      setClientName('');
      setClientPhone('');
      fetchProjectData();
    } catch (err: any) {
      showToast(err.message || 'Failed to add client room');
    }
  };

  const handleRevokeClient = async (roomId: string) => {
    try {
      await chatService.revokeClientAccess(roomId);
      showToast('Client access revoked.');
      fetchProjectData();
    } catch (err: any) {
      showToast(err.message || 'Failed to revoke client');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !title) return;

    try {
      await taskService.createTask({
        projectId: id,
        title,
        description,
        status: 'todo',
        priority,
        startDate: startDate || getTodayDateString(),
        dueDate: dueDate || undefined,
        assignedUserId: assignedUserId || user?.id || 'usr_1',
        assignedByUserId: user?.id,
        estimatedHours: 8
      });
      showToast('New task added to project!');
      setIsTaskModalOpen(false);
      setTitle('');
      setDescription('');
      setStartDate(getTodayDateString());
      setDueDate('');
      fetchProjectData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create task');
    }
  };

  if (!project) {
    return (
      <div className="p-8 text-center text-[var(--tm-ink-muted)] animate-pulse">
        Loading project details...
      </div>
    );
  }

  // Members list & active running task check per member
  const projectMembers = allUsers.filter(u => project.memberIds?.includes(u.id) || project.assignedUserIds?.includes(u.id));
  const availableActiveUsers = allUsers.filter(u => u.active && !project.memberIds?.includes(u.id) && !project.assignedUserIds?.includes(u.id));

  const isMemberRunningTask = (memberId: string) => {
    return tasks.some(t => t.sessions.some(s => !s.endTime && s.userId === memberId));
  };

  // Filter tasks by status (In progress, Upcoming, Done)
  const filteredTasks = tasks.filter(t => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'in_progress') return t.status === 'in_progress';
    if (statusFilter === 'todo') return t.status === 'todo' || t.status === 'review';
    if (statusFilter === 'completed') return t.status === 'completed';
    return true;
  });

  const totalLoggedHours = tasks.reduce((acc, t) => acc + (t.loggedHours || 0), 0);

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(`${prefix}/projects`)}
        className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--tm-ink-muted)] hover:text-[var(--tm-ink)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Projects
      </button>

      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-[var(--tm-border)] shadow-xs">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge variant={project.company === 'piixel' ? 'piixel' : project.company === 'unwork' ? 'unwork' : 'both'}>
              {project.company}
            </Badge>
            {project.clientName && (
              <span className="text-xs font-medium text-[var(--tm-ink-muted)] bg-[var(--tm-bg-sunken)] px-2 py-0.5 rounded-md">
                Client: {project.clientName}
              </span>
            )}
            <Badge variant={project.status === 'active' ? 'success' : 'default'}>
              {project.status.toUpperCase()}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold text-[var(--tm-ink)]">{project.name}</h1>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5 max-w-2xl">{project.description}</p>
          <div className="flex items-center gap-4 mt-3 text-xs text-[var(--tm-ink-muted)]">
            {project.startDate && <span>Start: <strong>{formatDate(project.startDate)}</strong></span>}
            <span>Deadline: <strong>{formatDate(project.deadline)}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClientModalOpen(true)}
              leftIcon={<ShieldCheck className="w-4 h-4 text-[var(--tm-success)]" />}
            >
              Add Client
            </Button>
          )}
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-[var(--tm-ink-muted)] font-semibold uppercase">Tasks</div>
              <div className="text-xl font-bold text-[var(--tm-ink)] mt-0.5">
                {tasks.filter(t => t.status === 'completed').length} / {tasks.length} Done
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--tm-success-bg)] text-[var(--tm-success)] flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-[var(--tm-ink-muted)] font-semibold uppercase">Total Hours</div>
              <div className="text-xl font-bold text-[var(--tm-ink)] mt-0.5">
                {formatHours(totalLoggedHours)}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-[var(--tm-primary-soft)] text-[var(--tm-primary)] flex items-center justify-center">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-[var(--tm-ink-muted)] font-semibold uppercase">Team Size</div>
              <div className="text-xl font-bold text-[var(--tm-ink)] mt-0.5">
                {projectMembers.length} Members
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Project Members Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--tm-primary)]" /> Project Members
          </CardTitle>
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => {
                setSelectedNewMemberIds([]);
                setIsAddMembersModalOpen(true);
              }}
            >
              Add Members
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            {projectMembers.map(member => {
              const hasRunning = isMemberRunningTask(member.id);
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-2.5 bg-[var(--tm-card-muted)] border border-[var(--tm-border)] px-3 py-2 rounded-xl"
                >
                  <div className="relative flex items-center gap-2">
                    <UserAvatar userId={member.id} size="sm" />
                    <div>
                      <div className="text-xs font-bold text-[var(--tm-ink)]">{member.name}</div>
                      <div className="text-[10px] text-[var(--tm-ink-muted)]">{member.jobTitle}</div>
                    </div>
                    {hasRunning && (
                      <span className="w-2.5 h-2.5 bg-[var(--tm-success)] rounded-full animate-pulse" title="Currently running a task in this project" />
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      onClick={() => handleRequestRemoveMember(member)}
                      title={`Remove ${member.name} from project`}
                      aria-label={`Remove ${member.name}`}
                      className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors ml-1"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Project Tasks (In progress, Upcoming, Done like My Tasks) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-semibold">Project Tasks</CardTitle>
          <div className="flex items-center gap-1 bg-[var(--tm-bg-sunken)] p-1 rounded-lg">
            {[
              { id: 'all', label: 'All' },
              { id: 'in_progress', label: 'In progress' },
              { id: 'todo', label: 'Upcoming' },
              { id: 'completed', label: 'Done' }
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setStatusFilter(st.id as any)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === st.id
                    ? 'bg-white text-[var(--tm-primary)] shadow-xs font-bold'
                    : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-[var(--tm-border)]">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-[var(--tm-ink-muted)] text-xs">
              No tasks found for this filter.
            </div>
          ) : (
            filteredTasks.map(task => (
              <div
                key={task.id}
                onClick={() => navigate(`${prefix}/tasks/${task.id}`)}
                className="p-4 hover:bg-[var(--tm-card-muted)] flex items-center justify-between gap-4 cursor-pointer transition-colors"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        task.priority === 'high' || task.priority === 'urgent'
                          ? 'danger'
                          : task.priority === 'medium'
                          ? 'warning'
                          : 'default'
                      }
                      size="sm"
                    >
                      {task.priority.toUpperCase()}
                    </Badge>
                    <Badge variant="primary" size="sm">
                      {task.status === 'in_progress' ? 'IN PROGRESS' : task.status === 'completed' ? 'DONE' : 'UPCOMING'}
                    </Badge>
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--tm-ink)] hover:text-[var(--tm-primary)]">
                    {task.title}
                  </h4>
                </div>

                <div className="flex items-center gap-4">
                  <UserName userId={task.assignedUserId} size="sm" showBadge={false} />
                  <div className="text-xs text-[var(--tm-ink-muted)] font-medium bg-[var(--tm-bg-sunken)] px-2 py-1 rounded-md">
                    {formatHours(task.loggedHours || 0)}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Client Portal Rooms & Invites Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--tm-success)]" /> Client Portal Access &amp; WhatsApp Invites
          </CardTitle>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsClientModalOpen(true)}
              leftIcon={<Plus className="w-4 h-4" />}
            >
              Add Client
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0 divide-y divide-[var(--tm-border)]">
          {clientRooms.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--tm-ink-muted)]">
              No client rooms created for this project yet. Click "Add Client" to generate a WhatsApp invite link.
            </div>
          ) : (
            clientRooms.map((room) => {
              const inviteUrl = `${window.location.origin}/join/${room.inviteCode}`;
              const waText = encodeURIComponent(
                `Hi ${room.clientName || 'Client'}, here is your secure project portal invite link for ${project.name}:\n${inviteUrl}`
              );
              const waUrl = `https://wa.me/${(room.clientPhone || '').replace(/\D/g, '')}?text=${waText}`;

              return (
                <div key={room.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[var(--tm-ink)]">{room.clientName}</h4>
                      <Badge variant={room.revoked ? 'danger' : 'success'} size="sm">
                        {room.revoked ? 'REVOKED' : 'ACTIVE ROOM'}
                      </Badge>
                    </div>
                    <div className="text-xs text-[var(--tm-ink-muted)] font-mono">
                      Phone: {room.clientPhone} • Invite Code: <strong>{room.inviteCode}</strong>
                    </div>
                    <div className="text-xs text-[var(--tm-primary)] bg-[var(--tm-primary-softer)] px-2.5 py-1 rounded-md font-mono inline-block border border-[var(--tm-primary-soft)]">
                      {inviteUrl}
                    </div>
                  </div>

                  {!room.revoked && (
                    <div className="flex items-center gap-2">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[var(--tm-success)] hover:bg-[var(--tm-success)] text-white font-semibold text-xs rounded-lg transition-colors shadow-xs"
                      >
                        <Share2 className="w-3.5 h-3.5" /> Share on WhatsApp
                      </a>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRevokeClient(room.id)}
                        className="text-[var(--tm-danger)] border-[var(--tm-danger-ring)] hover:bg-[var(--tm-danger-bg)]"
                        leftIcon={<UserX className="w-3.5 h-3.5" />}
                      >
                        Revoke
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* Add Client Modal */}
      <Modal
        isOpen={isClientModalOpen}
        onClose={() => setIsClientModalOpen(false)}
        title="Add Client Access Room"
        description={`Generate WhatsApp invite link for project: ${project.name}`}
      >
        <form onSubmit={handleAddClient} className="space-y-4">
          <Input
            label="Client Contact Name"
            placeholder="e.g. Michael Scott"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            required
          />

          <Input
            label="WhatsApp Mobile Number"
            placeholder="e.g. +91 98765 43210"
            value={clientPhone}
            onChange={(e) => setClientPhone(e.target.value)}
            required
          />

          <Select
            label="Company Entity"
            value={clientCompany}
            onChange={(e) => setClientCompany(e.target.value as any)}
            options={[
              { value: 'piixel', label: 'Piixel Studio' },
              { value: 'unwork', label: 'Unwork SaaS' }
            ]}
          />

          <div className="flex justify-end gap-3 pt-4 border-t border-[var(--tm-border)]">
            <Button variant="outline" type="button" onClick={() => setIsClientModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" className="bg-[var(--tm-success)] hover:bg-[var(--tm-success)]">
              Create Client Room &amp; Link
            </Button>
          </div>
        </form>
      </Modal>

      {/* New Task Modal */}
      <Modal
        isOpen={isTaskModalOpen}
        onClose={() => setIsTaskModalOpen(false)}
        title="Create Task for Project"
        description={project.name}
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <Input
            label="Task Name"
            placeholder="e.g. Navigation bar design"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />

          <div className="space-y-1">
            <label className="block text-xs font-semibold text-[var(--tm-ink-soft)] uppercase tracking-wider">
              Description
            </label>
            <textarea
              className="w-full text-sm rounded-lg border border-[var(--tm-border-strong)] p-3 text-[var(--tm-ink)] focus:outline-none focus:ring-2 focus:ring-[var(--tm-primary-soft)] focus:border-[var(--tm-primary)]"
              rows={3}
              placeholder="Task instructions and criteria..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as any)}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Mid' },
                { value: 'high', label: 'High' }
              ]}
            />

            <Input
              label="Start Date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />

            <Input
              label="Due Date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>

          <Select
            label="Assign To"
            value={assignedUserId}
            onChange={(e) => setAssignedUserId(e.target.value)}
            options={projectMembers.map(m => ({
              value: m.id,
              label: m.id === user?.id ? `${m.name} (Self)` : m.name
            }))}
          />

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" type="button" onClick={() => setIsTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save Task
            </Button>
          </div>
        </form>
      </Modal>

      {/* Add Members Modal */}
      <Modal
        isOpen={isAddMembersModalOpen}
        onClose={() => setIsAddMembersModalOpen(false)}
        title="Add Project Members"
        description="Select active employees to add to this project."
      >
        <form onSubmit={handleAddMembersSubmit} className="space-y-4">
          <div className="max-h-64 overflow-y-auto space-y-2 p-2 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)]">
            {availableActiveUsers.length === 0 ? (
              <p className="p-4 text-center text-xs text-[var(--tm-ink-muted)]">
                All active employees are already members of this project.
              </p>
            ) : (
              availableActiveUsers.map((u) => {
                const isSelected = selectedNewMemberIds.includes(u.id);
                return (
                  <label
                    key={u.id}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedNewMemberIds(selectedNewMemberIds.filter((id) => id !== u.id));
                      } else {
                        setSelectedNewMemberIds([...selectedNewMemberIds, u.id]);
                      }
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--tm-primary-softer)] border border-[var(--tm-primary-soft)]'
                        : 'hover:bg-[var(--tm-bg-sunken)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar userId={u.id} size="sm" />
                      <div>
                        <div className="text-xs font-bold text-[var(--tm-ink)]">{u.name}</div>
                        <div className="text-[10px] text-[var(--tm-ink-muted)]">{u.jobTitle}</div>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 text-[var(--tm-primary)] rounded border-[var(--tm-border-strong)]"
                    />
                  </label>
                );
              })
            )}
          </div>

          <div className="flex justify-end gap-3 pt-3 border-t border-[var(--tm-border)]">
            <Button variant="outline" type="button" onClick={() => setIsAddMembersModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              type="submit"
              disabled={selectedNewMemberIds.length === 0}
            >
              Add Selected Members ({selectedNewMemberIds.length})
            </Button>
          </div>
        </form>
      </Modal>

      {/* Remove Member Warning Modal */}
      <Modal
        isOpen={!!memberToRemove}
        onClose={() => {
          setMemberToRemove(null);
          setRunningTaskForRemove(null);
        }}
        title="Warning: Running Task in Progress"
        description="Active task detection warning."
      >
        {memberToRemove && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs leading-relaxed">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>{memberToRemove.name}</strong> currently has an active running task in this project:
                {runningTaskForRemove && (
                  <div className="mt-1 font-bold text-amber-900 bg-amber-100 p-2 rounded border border-amber-300">
                    "{runningTaskForRemove.title}"
                  </div>
                )}
                <p className="mt-1.5">
                  Are you sure you want to remove them from the project team?
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setMemberToRemove(null);
                  setRunningTaskForRemove(null);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                type="button"
                onClick={() => executeRemoveMember(memberToRemove.id, memberToRemove.name)}
              >
                Remove Member Anyway
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
