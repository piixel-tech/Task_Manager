import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, CheckSquare, Clock, Users, FileText, ExternalLink, Paperclip, Share2, UserX, ShieldCheck } from 'lucide-react';
import { projectService, taskService, userService, chatService } from '../../../services';
import type { Project, Task, User, Submission, ChatRoom } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { formatHours } from '../../../utils/format';
import { WeeklyReportModal } from '../components/WeeklyReportModal';

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
  const [statusFilter, setStatusFilter] = useState<'all' | 'todo' | 'in_progress' | 'review' | 'completed'>('all');
  
  const [clientRooms, setClientRooms] = useState<ChatRoom[]>([]);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [subHeading, setSubHeading] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(user?.id || '');

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
        subHeading,
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
      setSubHeading('');
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
  const projectMembers = allUsers.filter(u => project.memberIds.includes(u.id));
  
  // Member is active running if they have an active session in ANY task within this project
  const isMemberRunningTask = (memberId: string) => {
    return tasks.some(t => t.sessions.some(s => !s.endTime && s.userId === memberId));
  };

  // Filter tasks by status
  const filteredTasks = tasks.filter(t => statusFilter === 'all' ? true : t.status === statusFilter);

  // Hours per person breakdown
  const hoursPerPersonMap: Record<string, number> = {};
  tasks.forEach(t => {
    t.sessions.forEach(s => {
      const hours = (s.durationMinutes || 0) / 60;
      hoursPerPersonMap[s.userId] = (hoursPerPersonMap[s.userId] || 0) + hours;
    });
  });

  const totalLoggedHours = tasks.reduce((acc, t) => acc + (t.loggedHours || 0), 0);

  // All submissions across tasks in this project
  const projectSubmissions: { submission: Submission; taskTitle: string }[] = [];
  tasks.forEach(t => {
    t.submissions.forEach(sub => {
      projectSubmissions.push({ submission: sub, taskTitle: t.title });
    });
  });

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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsReportModalOpen(true)}
            leftIcon={<FileText className="w-4 h-4 text-[var(--tm-primary)]" />}
          >
            Generate Report
          </Button>
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
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsTaskModalOpen(true)}
            leftIcon={<Plus className="w-4 h-4" />}
          >
            New Task
          </Button>
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

      {/* Project Members with Active Running Dot */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-[var(--tm-primary)]" /> Project Members
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            {projectMembers.map(member => {
              const hasRunning = isMemberRunningTask(member.id);
              return (
                <div
                  key={member.id}
                  className="flex items-center gap-2.5 bg-[var(--tm-card-muted)] border border-[var(--tm-border)] px-3 py-2 rounded-xl"
                >
                  <div className="relative flex items-center gap-2">
                    <UserName userId={member.id} size="sm" showBadge={false} />
                    {hasRunning && (
                      <span className="w-2.5 h-2.5 bg-[var(--tm-success)] rounded-full animate-pulse" title="Currently running a task in this project" />
                    )}
                  </div>
                  {hasRunning && (
                    <span className="text-[10px] font-semibold text-[var(--tm-success)] bg-[var(--tm-success-bg)] px-1.5 py-0.5 rounded">
                      Active Task
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Hours Per Person */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--tm-success)]" /> Hours Per Person
          </CardTitle>
        </CardHeader>
        <CardContent>
          {Object.keys(hoursPerPersonMap).length === 0 ? (
            <p className="text-xs text-[var(--tm-ink-muted)] italic">No time logged on this project yet.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(hoursPerPersonMap).map(([uId, hrs]) => (
                <div key={uId} className="flex items-center justify-between p-3 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)]">
                  <UserName userId={uId} size="sm" />
                  <span className="text-xs font-bold text-[var(--tm-ink)]">{formatHours(hrs)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tasks by Status Tabs & List */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-sm font-semibold">Project Tasks</CardTitle>
          <div className="flex items-center gap-1 bg-[var(--tm-bg-sunken)] p-1 rounded-lg">
            {(['all', 'todo', 'in_progress', 'review', 'completed'] as const).map(st => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  statusFilter === st
                    ? 'bg-white text-[var(--tm-primary)] shadow-xs'
                    : 'text-[var(--tm-ink-soft)] hover:text-[var(--tm-ink)]'
                }`}
              >
                {st === 'all' ? 'All' : st.replace('_', ' ').toUpperCase()}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-[var(--tm-border)]">
          {filteredTasks.length === 0 ? (
            <div className="p-8 text-center text-[var(--tm-ink-muted)] text-xs">
              No tasks found for this status.
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
                      {task.status.replace('_', ' ').toUpperCase()}
                    </Badge>
                    {task.subHeading && (
                      <span className="text-xs text-[var(--tm-ink-muted)] font-medium">({task.subHeading})</span>
                    )}
                  </div>
                  <h4 className="text-sm font-semibold text-[var(--tm-ink)] hover:text-[var(--tm-primary)]">
                    {task.title}
                  </h4>
                </div>

                <div className="flex items-center gap-4">
                  <UserName userId={task.assignedUserId} size="sm" showBadge={false} />
                  {(task.revisions || 0) > 0 && (
                    <Badge variant="danger" size="sm">
                      {task.revisions} {task.revisions === 1 ? 'Rev' : 'Revs'}
                    </Badge>
                  )}
                  <div className="text-xs text-[var(--tm-ink-muted)] font-medium bg-[var(--tm-bg-sunken)] px-2 py-1 rounded-md">
                    {formatHours(task.loggedHours || 0)}
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Submissions Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--tm-primary)]" /> Deliverable Submissions
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 divide-y divide-[var(--tm-border)]">
          {projectSubmissions.length === 0 ? (
            <div className="p-6 text-center text-xs text-[var(--tm-ink-muted)]">
              No work submissions recorded for this project yet.
            </div>
          ) : (
            projectSubmissions.map(({ submission, taskTitle }) => (
              <div key={submission.id} className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserName userId={submission.userId} size="sm" />
                    <span className="text-xs text-[var(--tm-ink-muted)]">on</span>
                    <span className="text-xs font-semibold text-[var(--tm-ink-soft)]">{taskTitle}</span>
                  </div>
                  <Badge variant={submission.status === 'approved' ? 'success' : submission.status === 'needs_changes' ? 'danger' : 'warning'}>
                    {submission.status.replace('_', ' ').toUpperCase()}
                  </Badge>
                </div>
                {submission.notes && (
                  <p className="text-xs text-[var(--tm-ink-soft)] bg-[var(--tm-card-muted)] p-2 rounded-lg border border-[var(--tm-border)]">
                    "{submission.notes}"
                  </p>
                )}
                {/* Files attached */}
                {((submission.files?.length || 0) > 0 || (submission.fileUrls?.length || 0) > 0) && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(submission.files || []).map((file, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs text-[var(--tm-primary)] bg-[var(--tm-primary-softer)] px-2 py-1 rounded-md">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{file.name}</span>
                        <span className="text-[10px] text-[var(--tm-primary-light)]">({(file.size / 1024).toFixed(1)} KB)</span>
                      </div>
                    ))}
                    {(submission.fileUrls || []).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-[var(--tm-primary)] bg-[var(--tm-primary-softer)] px-2 py-1 rounded-md hover:underline">
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{url}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Client Portal Rooms & Invites Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-[var(--tm-success)]" /> Client Portal Access & WhatsApp Invites
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
              Create Client Room & Link
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

          <Input
            label="Sub-Heading"
            placeholder="e.g. Header layout & responsiveness"
            value={subHeading}
            onChange={(e) => setSubHeading(e.target.value)}
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
              label="Due Date (Optional)"
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

      {/* Weekly Report Modal */}
      {project && (
        <WeeklyReportModal
          isOpen={isReportModalOpen}
          onClose={() => setIsReportModalOpen(false)}
          projectId={project.id}
          projectName={project.name}
          clientRoom={clientRooms.length > 0 ? clientRooms[0] : null}
        />
      )}
    </div>
  );
};

