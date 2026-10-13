import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  Clock3,
  Play,
  Plus,
  Square,
  FileCheck,
  RefreshCw,
  Trash2,
  ChevronDown,
  ChevronRight,
  Flag
} from 'lucide-react';
import { projectService } from '../../../services';
import type { Project, Task, User } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { PillTabs } from '../../../components/ui/PillTabs';
import { UserAvatar } from '../../../components/ui/UserAvatar';
import { TaskProgressBar } from '../../../components/ui/TaskProgressBar';
import { useTaskStore } from '../../../store/useTaskStore';
import { useUserStore } from '../../../store/useUserStore';
import { Modal } from '../../../components/ui/Modal';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { listItemVariants, fastT } from '../../../components/ui/motion';
import { formatHours } from '../../../utils/format';
import {
  formatDate,
  getTodayDateString,
  getNowISO,
  calculateDurationSeconds,
  isDueThisWeek
} from '../../../utils/time';
import { TaskSubmitModal } from '../components/TaskSubmitModal';
import { ChangeRequestBox, ReviewBadge } from '../components/TaskReview';

/** Task Card component */
const TaskCard: React.FC<{
  task: Task;
  project?: Project;
  assignedUser?: User;
  currentUser?: User | null;
  onNavigate: () => void;
  onStartTimer?: (e: React.MouseEvent) => void;
  onPauseTimer?: (e: React.MouseEvent) => void;
  onSubmitForm?: () => void;
  onDeleteTask?: (task: Task) => void;
}> = ({
  task,
  project,
  assignedUser,
  currentUser,
  onNavigate,
  onStartTimer,
  onPauseTimer,
  onSubmitForm,
  onDeleteTask
}) => {
  const { reduced } = useMotionPrefs();
  const activeSession = task.sessions.find((s) => !s.endTime && s.userId === currentUser?.id);
  const isOverdue = !!task.dueDate && task.dueDate < getTodayDateString();

  const isAssignedToMe = currentUser?.id === task.assignedUserId;
  const isCreatedByMe = currentUser?.id === task.assignedByUserId;
  const canDelete = currentUser?.role === 'admin' || (isAssignedToMe && isCreatedByMe);

  return (
    <motion.article
      variants={listItemVariants}
      initial="hidden"
      animate="show"
      whileHover={reduced ? undefined : { y: -2 }}
      transition={fastT}
      onClick={onNavigate}
      className={`group relative cursor-pointer rounded-[var(--tm-radius-lg)] border bg-[var(--tm-card)] p-4 shadow-soft-xs transition-all hover:shadow-soft ${
        activeSession ? 'border-[var(--tm-primary)] ring-2 ring-[var(--tm-primary-soft)]' : 'border-[var(--tm-border)]'
      }`}
    >
      {/* Project Tag & Priority Flag Icon with Tooltip */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {project && (
            <Badge variant="default" size="sm" className="truncate">
              {project.name}
            </Badge>
          )}
        </div>

        <span title={`${task.priority.toUpperCase()} priority`}>
          <Flag
            className={`w-4 h-4 shrink-0 ${
              task.priority === 'high' || task.priority === 'urgent'
                ? 'text-red-500 fill-red-500/20'
                : task.priority === 'medium'
                ? 'text-amber-500 fill-amber-500/20'
                : 'text-gray-400 fill-gray-400/20'
            }`}
          />
        </span>
      </div>

      {/* Task Title */}
      <h4 className="mt-2.5 text-[14.5px] font-bold leading-snug text-[var(--tm-ink)]">
        {task.title}
      </h4>

      {/* Review state: green Approved / orange Changes Requested / Submitted */}
      {task.reviewStatus && (
        <div className="mt-2">
          <ReviewBadge task={task} />
        </div>
      )}

      {/* Reviewer's message + Resubmit, when changes were requested */}
      {task.reviewStatus === 'changes_requested' && (
        <div className="mt-3 space-y-2" onClick={(e) => e.stopPropagation()}>
          <ChangeRequestBox task={task} compact />
          {isAssignedToMe && onSubmitForm && (
            <Button
              variant="primary"
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                onSubmitForm();
              }}
              leftIcon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Resubmit
            </Button>
          )}
        </div>
      )}

      {/* Live Task Progress Bar */}
      <div className="mt-3.5">
        <TaskProgressBar task={task} userId={currentUser?.id} />
      </div>

      {/* Footer Meta: Start date, End date, Time worked ("2h 15m"), Avatar */}
      <div className="mt-4 flex flex-wrap items-center justify-between border-t border-[var(--tm-border)] pt-3 text-[11.5px] gap-2">
        <div className="flex items-center gap-2.5 font-semibold text-[var(--tm-ink-muted)]">
          {task.startDate && (
            <span>Start: <strong className="text-[var(--tm-ink)]">{formatDate(task.startDate, 'MMM d')}</strong></span>
          )}
          {task.status === 'completed' ? (
            <span>
              Done:{' '}
              <strong className="text-[var(--tm-ink)]">
                {formatDate(task.completedAt || task.dueDate, 'MMM d')}
              </strong>
            </span>
          ) : task.dueDate ? (
            <span>
              Due:{' '}
              <strong className={isOverdue ? 'text-[var(--tm-danger)]' : 'text-[var(--tm-ink)]'}>
                {formatDate(task.dueDate, 'MMM d')}
              </strong>
            </span>
          ) : (
            <span>No due date</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Time worked formatted as e.g. "2h 15m" */}
          <span className="font-extrabold text-[var(--tm-primary)] tabular-nums">
            {formatHours(task.loggedHours || 0)}
          </span>

          {/* Quick action buttons appear ONLY on tasks assigned to the logged-in user */}
          {isAssignedToMe && onStartTimer && onPauseTimer && onSubmitForm && (
            activeSession ? (
              <>
                <button
                  type="button"
                  onClick={onPauseTimer}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[var(--tm-primary-soft)] text-[var(--tm-primary-dark)] hover:bg-[var(--tm-primary)] hover:text-white transition-colors"
                  title="Pause timer"
                >
                  <Square className="h-3 w-3 fill-current" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSubmitForm();
                  }}
                  className="grid h-7 w-7 place-items-center rounded-full bg-[var(--tm-primary-softer)] text-[var(--tm-primary)] hover:bg-[var(--tm-primary)] hover:text-white transition-colors"
                  title="Submit deliverable"
                >
                  <FileCheck className="h-3.5 w-3.5" />
                </button>
              </>
            ) : task.status !== 'completed' ? (
              <button
                type="button"
                onClick={onStartTimer}
                className="grid h-7 w-7 place-items-center rounded-full bg-[var(--tm-bg-sunken)] text-[var(--tm-ink-soft)] hover:bg-[var(--tm-primary)] hover:text-white transition-colors"
                title="Start timer"
              >
                <Play className="h-3 w-3 fill-current ml-0.5" />
              </button>
            ) : null
          )}

          {/* Delete button (if task created by user or admin) */}
          {canDelete && onDeleteTask && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteTask(task);
              }}
              className="grid h-7 w-7 place-items-center rounded-full bg-red-50 text-red-600 hover:bg-red-600 hover:text-white transition-colors"
              title="Delete task"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}

          <UserAvatar userId={assignedUser?.id || task.assignedUserId} name={assignedUser?.name} src={assignedUser?.avatarUrl} size="sm" />
        </div>
      </div>
    </motion.article>
  );
};

/** Card component for "Assigned to others" tab with live ticking timer */
const AssignedToOthersCard: React.FC<{
  task: Task;
  project?: Project;
  assignedUser?: User;
  nowISO: string;
  onNavigate: () => void;
}> = ({ task, project, assignedUser, nowISO, onNavigate }) => {
  const activeSession = task.sessions.find((s) => !s.endTime);
  let liveSeconds = (task.loggedHours || 0) * 3600;
  if (activeSession) {
    liveSeconds += calculateDurationSeconds(activeSession.startTime, nowISO);
  }

  const formatHHMMSS = (totalSecs: number) => {
    const s = Math.floor(totalSecs % 60);
    const m = Math.floor((totalSecs / 60) % 60);
    const h = Math.floor(totalSecs / 3600);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const timerString = formatHHMMSS(Math.floor(liveSeconds));

  return (
    <div
      onClick={onNavigate}
      className="group relative cursor-pointer rounded-[var(--tm-radius-lg)] border border-[var(--tm-border)] bg-[var(--tm-card)] p-4 shadow-soft-xs transition-all hover:shadow-soft hover:border-[var(--tm-border-strong)]"
    >
      {/* Assignee Header: Avatar + Name · Job Title & Acceptance Status */}
      <div className="flex items-center justify-between gap-3 border-b border-[var(--tm-border)] pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserAvatar userId={assignedUser?.id || task.assignedUserId} name={assignedUser?.name || 'User'} src={assignedUser?.avatarUrl} size="md" />
          <div className="min-w-0 leading-tight">
            <div className="text-[13.5px] font-extrabold text-[var(--tm-ink)] truncate">
              {assignedUser?.name || 'Assigned User'}
            </div>
            <div className="text-[11.5px] text-[var(--tm-ink-muted)] truncate">
              {assignedUser?.jobTitle || 'Team Member'}
            </div>
          </div>
        </div>

        <Badge
          variant={
            task.assignmentStatus === 'rejected'
              ? 'danger'
              : task.assignmentStatus === 'accepted'
              ? 'success'
              : 'warning'
          }
          size="sm"
          className="shrink-0"
        >
          {task.assignmentStatus === 'rejected'
            ? 'Declined'
            : task.assignmentStatus === 'accepted'
            ? 'Accepted'
            : 'Pending'}
        </Badge>
      </div>

      {/* Task Info */}
      <div className="mt-3.5 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          {project && <Badge variant="default" size="sm">{project.name}</Badge>}
          <span title={`${task.priority.toUpperCase()} priority`}>
            <Flag
              className={`w-3.5 h-3.5 shrink-0 ${
                task.priority === 'high' || task.priority === 'urgent'
                  ? 'text-red-500 fill-red-500/20'
                  : task.priority === 'medium'
                  ? 'text-amber-500 fill-amber-500/20'
                  : 'text-gray-400 fill-gray-400/20'
              }`}
            />
          </span>
          <StatusChip status={task.status} size="sm" />
        </div>

        <h4 className="text-[15px] font-bold text-[var(--tm-ink)] leading-snug">
          {task.title}
        </h4>
      </div>

      {/* Footer: Start Date, Due Date & Live Timer */}
      <div className="mt-4 flex items-center justify-between border-t border-[var(--tm-border)] pt-3 text-[12px] flex-wrap gap-2">
        <div className="text-[var(--tm-ink-muted)] font-semibold flex items-center gap-3">
          {task.startDate && (
            <span>Start: <strong className="text-[var(--tm-ink)]">{formatDate(task.startDate)}</strong></span>
          )}
          {task.dueDate ? (
            <span>Due: <strong className="text-[var(--tm-ink)]">{formatDate(task.dueDate)}</strong></span>
          ) : (
            <span>No due date</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {activeSession ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--tm-success-bg)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--tm-success)]">
              <span className="h-2 w-2 rounded-full bg-[var(--tm-success)] animate-pulse" />
              Working now · {timerString}
            </span>
          ) : (
            <span className="font-extrabold text-[var(--tm-primary)] tabular-nums">
              {formatHours(task.loggedHours || 0)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast, companyFilter } = useAppStore();
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const tasks = useTaskStore((state) => state.tasks);
  const fetchStoreTasks = useTaskStore((state) => state.fetchTasks);

  const usersList = useUserStore((state) => state.usersList);
  const fetchUsers = useUserStore((state) => state.fetchUsers);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter tabs: All, High priority, Due this week, Assigned to me, Assigned to others
  const [filterTab, setFilterTab] = useState<'all' | 'high' | 'this_week' | 'assigned_me' | 'assigned_others'>('all');

  // Done section collapsible state (Closed by default)
  const [isDoneSectionOpen, setIsDoneSectionOpen] = useState(false);
  // Collapsible state for each day group inside Done section
  const [openDoneDaysMap, setOpenDoneDaysMap] = useState<Record<string, boolean>>({});

  // Modal dialog states
  const [confirmTask, setConfirmTask] = useState<{ targetId: string; runningName: string } | null>(null);
  const [taskToSubmit, setTaskToSubmit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  // New task form states
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(user?.id || '');
  const [formSubmitted, setFormSubmitted] = useState(false);

  // Live timer tick for Assigned to others view
  const [nowISO, setNowISO] = useState(getNowISO());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowISO(getNowISO());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const fetchTasksData = async () => {
    const [, prjList] = await Promise.all([
      fetchStoreTasks(),
      projectService.getProjects(),
      fetchUsers()
    ]);
    setProjects(prjList);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasksData();
  }, []);

  const projectsMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const usersMap = useMemo(() => new Map(usersList.map((u) => [u.id, u])), [usersList]);

  // Tab count badges
  const countsMap = useMemo(() => {
    const userTasks = tasks.filter((t) => isAdmin || t.assignedUserId === user?.id || t.assignedByUserId === user?.id);

    return {
      all: userTasks.filter((t) => t.status !== 'completed').length,
      high: userTasks.filter((t) => (t.priority === 'high' || t.priority === 'urgent') && t.status !== 'completed').length,
      this_week: userTasks.filter((t) => isDueThisWeek(t.dueDate) && t.status !== 'completed').length,
      assigned_me: tasks.filter((t) => t.assignedUserId === user?.id && t.assignedByUserId !== user?.id && t.status !== 'completed').length,
      assigned_others: tasks.filter((t) => t.assignedByUserId === user?.id && t.assignedUserId !== user?.id && t.status !== 'completed').length
    };
  }, [tasks, user, isAdmin]);

  // Filter tasks based on company filter & PillTabs filter
  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const prj = projectsMap.get(t.projectId);
      if (companyFilter !== 'all' && prj && prj.company !== companyFilter) return false;

      if (filterTab === 'assigned_others') {
        return t.assignedByUserId === user?.id && t.assignedUserId !== user?.id;
      }

      if (filterTab === 'assigned_me') {
        return t.assignedUserId === user?.id && t.assignedByUserId !== user?.id;
      }

      // Standard tabs: employee sees tasks assigned to them or created by them
      if (!isAdmin && t.assignedUserId !== user?.id && t.assignedByUserId !== user?.id) return false;

      if (filterTab === 'high' && t.priority !== 'high' && t.priority !== 'urgent') return false;
      if (filterTab === 'this_week') {
        if (t.status === 'completed') return false;
        if (!isDueThisWeek(t.dueDate)) return false;
      }
      return true;
    });
  }, [tasks, projectsMap, companyFilter, filterTab, user, isAdmin]);

  // Split tasks into In Progress, Upcoming, and Done sections
  const inProgressTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === 'in_progress' || t.status === 'review' || t.sessions.some((s) => !s.endTime)),
    [filteredTasks]
  );

  const upcomingTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === 'todo' && !t.sessions.some((s) => !s.endTime)),
    [filteredTasks]
  );

  const doneTasks = useMemo(
    () => filteredTasks.filter((t) => t.status === 'completed'),
    [filteredTasks]
  );

  // Group Done tasks by completion date (newest first) with day sub-headings
  const doneDayGroups = useMemo(() => {
    const todayStr = getTodayDateString();
    const groupsMap: Record<string, Task[]> = {};

    doneTasks.forEach((t) => {
      const dateKey = (t.completedAt || t.dueDate || todayStr).slice(0, 10);
      if (!groupsMap[dateKey]) groupsMap[dateKey] = [];
      groupsMap[dateKey].push(t);
    });

    const sortedDates = Object.keys(groupsMap).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((dateKey) => {
      const dayLabel = formatDate(dateKey, 'EEEE, dd MMM yyyy');
      const count = groupsMap[dateKey].length;
      return {
        dateKey,
        dayLabel: `${dayLabel} · ${count} ${count === 1 ? 'task' : 'tasks'}`,
        tasks: groupsMap[dateKey]
      };
    });
  }, [doneTasks]);

  const toggleDoneDayOpen = (dateKey: string) => {
    setOpenDoneDaysMap((prev) => ({ ...prev, [dateKey]: prev[dateKey] === false }));
  };

  const handleStartTimer = async (e: React.MouseEvent, taskId: string, force = false) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const res = await useTaskStore.getState().startTaskSession(taskId, user.id, force);
      if (res.needConfirm && res.runningTaskName) {
        setConfirmTask({ targetId: taskId, runningName: res.runningTaskName });
      } else {
        showToast('Started timer!');
        setConfirmTask(null);
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to start timer');
    }
  };

  const handleStopTimer = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await useTaskStore.getState().stopTaskSession(taskId, user.id);
      showToast('Task timer paused.');
    } catch (err: any) {
      showToast(err.message || 'Failed to pause timer');
    }
  };

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete) return;
    try {
      await useTaskStore.getState().deleteTask(taskToDelete.id);
      showToast(`Task "${taskToDelete.title}" deleted.`);
      setTaskToDelete(null);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete task');
    }
  };

  const userProjects = isAdmin ? projects : projects.filter((p) => p.memberIds.includes(user?.id || ''));

  // Form validation check
  const isFormValid = Boolean(
    selectedProjectId &&
    taskName.trim() &&
    priority &&
    startDate &&
    assignedUserId
  );

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSubmitted(true);
    if (!isFormValid) return;

    try {
      await useTaskStore.getState().createTask({
        projectId: selectedProjectId,
        title: taskName.trim(),
        description,
        status: 'todo',
        priority,
        startDate,
        dueDate: dueDate || undefined,
        assignedUserId,
        assignedByUserId: user?.id,
        assignmentStatus: assignedUserId === user?.id ? 'accepted' : 'pending',
      });
      showToast('Task created successfully!');
      setIsNewTaskModalOpen(false);
      setTaskName('');
      setDescription('');
      setDueDate('');
      setFormSubmitted(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to create task');
    }
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Task Hub' : 'My Tasks'}
        description="Top-to-bottom workflow layout: In progress, Upcoming, and collapsible day-grouped Done tasks."
        actions={
          <Button size="sm" onClick={() => {
            if (userProjects.length > 0) setSelectedProjectId(userProjects[0].id);
            setFormSubmitted(false);
            setIsNewTaskModalOpen(true);
          }} leftIcon={<Plus className="h-4 w-4" />}>
            New Task
          </Button>
        }
      />

      {/* PillTabs Filters: All, High priority, Due this week, Assigned to me, Assigned to others */}
      <StaggerItem>
        <PillTabs
          activeTab={filterTab}
          onChange={(tab) => setFilterTab(tab as typeof filterTab)}
          tabs={[
            { id: 'all', label: 'All', count: countsMap.all },
            { id: 'high', label: 'High priority', count: countsMap.high },
            { id: 'this_week', label: 'Due this week', count: countsMap.this_week },
            { id: 'assigned_me', label: 'Assigned to me', count: countsMap.assigned_me },
            { id: 'assigned_others', label: 'Assigned to others', count: countsMap.assigned_others }
          ]}
        />
      </StaggerItem>

      {/* View Container */}
      {loading ? (
        <SkeletonRows count={4} />
      ) : filterTab === 'assigned_others' ? (
        /* "Assigned to others" Tab View */
        filteredTasks.length === 0 ? (
          <EmptyState
            icon={<Clock3 className="h-6 w-6 text-[var(--tm-primary)]" />}
            title="No tasks assigned to others"
            description="Tasks you create and assign to team members will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredTasks.map((t) => (
              <AssignedToOthersCard
                key={t.id}
                task={t}
                project={projectsMap.get(t.projectId)}
                assignedUser={usersMap.get(t.assignedUserId)}
                nowISO={nowISO}
                onNavigate={() => navigate(`${prefix}/tasks/${t.id}`)}
              />
            ))}
          </div>
        )
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="No tasks found"
          description="Adjust your filters or create a new task to get started."
        />
      ) : (
        /* Top to Bottom Sections Layout: In Progress, Upcoming, then Done */
        <div className="space-y-8">
          {/* 1. IN PROGRESS SECTION */}
          {inProgressTasks.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex items-center gap-2 px-1">
                <span className="h-3 w-3 rounded-full bg-[var(--tm-primary)]" />
                <h3 className="text-base font-extrabold text-[var(--tm-ink)]">In Progress</h3>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--tm-card-muted)] px-2 text-xs font-bold text-[var(--tm-ink-soft)] border border-[var(--tm-border)]">
                  {inProgressTasks.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {inProgressTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    project={projectsMap.get(task.projectId)}
                    assignedUser={usersMap.get(task.assignedUserId)}
                    currentUser={user}
                    onNavigate={() => navigate(`${prefix}/tasks/${task.id}`)}
                    onStartTimer={(e) => handleStartTimer(e, task.id)}
                    onPauseTimer={(e) => handleStopTimer(e, task.id)}
                    onSubmitForm={() => setTaskToSubmit(task)}
                    onDeleteTask={(t) => setTaskToDelete(t)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 2. UPCOMING SECTION */}
          {upcomingTasks.length > 0 && (
            <section className="space-y-3.5">
              <div className="flex items-center gap-2 px-1">
                <span className="h-3 w-3 rounded-full bg-[var(--tm-neutral)]" />
                <h3 className="text-base font-extrabold text-[var(--tm-ink)]">Upcoming</h3>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--tm-card-muted)] px-2 text-xs font-bold text-[var(--tm-ink-soft)] border border-[var(--tm-border)]">
                  {upcomingTasks.length}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {upcomingTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    project={projectsMap.get(task.projectId)}
                    assignedUser={usersMap.get(task.assignedUserId)}
                    currentUser={user}
                    onNavigate={() => navigate(`${prefix}/tasks/${task.id}`)}
                    onStartTimer={(e) => handleStartTimer(e, task.id)}
                    onPauseTimer={(e) => handleStopTimer(e, task.id)}
                    onSubmitForm={() => setTaskToSubmit(task)}
                    onDeleteTask={(t) => setTaskToDelete(t)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* 3. DONE SECTION (Collapsible, closed by default) */}
          <section className="rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)] bg-[var(--tm-card)] overflow-hidden shadow-soft-xs">
            <button
              type="button"
              onClick={() => setIsDoneSectionOpen(!isDoneSectionOpen)}
              className="w-full px-5 py-4 flex items-center justify-between bg-[var(--tm-card-muted)] hover:bg-[var(--tm-bg-sunken)] transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                <span className="h-3 w-3 rounded-full bg-[var(--tm-success)]" />
                <h3 className="text-base font-extrabold text-[var(--tm-ink)]">Done</h3>
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--tm-card)] px-2 text-xs font-bold text-[var(--tm-ink-soft)] border border-[var(--tm-border)]">
                  {doneTasks.length}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-bold text-[var(--tm-ink-muted)]">
                <span>{isDoneSectionOpen ? 'Hide Done Tasks' : 'Show Done Tasks'}</span>
                {isDoneSectionOpen ? <ChevronDown className="w-5 h-5 text-[var(--tm-ink)]" /> : <ChevronRight className="w-5 h-5 text-[var(--tm-ink)]" />}
              </div>
            </button>

            {isDoneSectionOpen && (
              <div className="p-5 space-y-5 border-t border-[var(--tm-border)]">
                {doneDayGroups.length === 0 ? (
                  <div className="text-xs text-[var(--tm-ink-muted)] text-center py-6">
                    No completed tasks found in this view.
                  </div>
                ) : (
                  doneDayGroups.map((group) => {
                    const isGroupOpen = openDoneDaysMap[group.dateKey] !== false; // open by default
                    return (
                      <div key={group.dateKey} className="rounded-xl border border-[var(--tm-border)] bg-[var(--tm-card-muted)] overflow-hidden p-3.5 space-y-3">
                        {/* Collapsible Day Sub-Heading */}
                        <button
                          type="button"
                          onClick={() => toggleDoneDayOpen(group.dateKey)}
                          className="w-full px-3.5 py-2 flex items-center justify-between text-xs font-extrabold text-[var(--tm-ink)] bg-white rounded-lg border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)] transition-colors"
                        >
                          <span>{group.dayLabel}</span>
                          {isGroupOpen ? <ChevronDown className="w-4 h-4 text-[var(--tm-ink-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--tm-ink-muted)]" />}
                        </button>

                        {isGroupOpen && (
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pt-1">
                            {group.tasks.map((task) => (
                              <TaskCard
                                key={task.id}
                                task={task}
                                project={projectsMap.get(task.projectId)}
                                assignedUser={usersMap.get(task.assignedUserId)}
                                currentUser={user}
                                onNavigate={() => navigate(`${prefix}/tasks/${task.id}`)}
                                onSubmitForm={() => setTaskToSubmit(task)}
                                onDeleteTask={(t) => setTaskToDelete(t)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Running Task Confirmation Modal */}
      <Modal
        isOpen={!!confirmTask}
        onClose={() => setConfirmTask(null)}
        title="A timer is already running"
        description={`Pause "${confirmTask?.runningName}" and start this task instead?`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmTask(null)}>
              Cancel
            </Button>
            <Button
              onClick={(e) =>
                confirmTask && handleStartTimer(e as React.MouseEvent, confirmTask.targetId, true)
              }
            >
              Pause &amp; Start This Task
            </Button>
          </>
        }
      >
        <p className="text-[13.5px] leading-relaxed text-[var(--tm-ink-soft)]">
          Only one timer can run at a time. The active task keeps all previously logged hours.
        </p>
      </Modal>

      {/* Delete Task Confirmation Modal */}
      <Modal
        isOpen={!!taskToDelete}
        onClose={() => setTaskToDelete(null)}
        title="Delete Task?"
        description={taskToDelete ? `Are you sure you want to delete "${taskToDelete.title}"? This action cannot be undone.` : ''}
        footer={
          <>
            <Button variant="outline" onClick={() => setTaskToDelete(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={handleConfirmDeleteTask}>
              Delete Task
            </Button>
          </>
        }
      >
        <p className="text-xs text-[var(--tm-ink-muted)]">
          Deleting this task will permanently remove all timer sessions and submissions associated with it.
        </p>
      </Modal>

      {/* Deliverable Submission Modal */}
      <TaskSubmitModal
        isOpen={!!taskToSubmit}
        onClose={() => setTaskToSubmit(null)}
        task={taskToSubmit}
        onSubmitSuccess={fetchTasksData}
      />

      {/* New Task Form Modal */}
      <Modal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        title="Create a new task"
        description="Tasks belong to a project and are assigned to team members."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <Select
              label="Project *"
              value={selectedProjectId}
              onChange={(e) => setSelectedProjectId(e.target.value)}
              options={userProjects.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.company})`
              }))}
              required
            />
            {formSubmitted && !selectedProjectId && (
              <span className="text-[11px] font-semibold text-[var(--tm-danger)] mt-1 block">
                Please select a project.
              </span>
            )}
          </div>

          <div>
            <Input
              label="Task Title *"
              placeholder="e.g. Design user profile component"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              required
            />
            {formSubmitted && !taskName.trim() && (
              <span className="text-[11px] font-semibold text-[var(--tm-danger)] mt-1 block">
                Task title is required.
              </span>
            )}
          </div>

          <Textarea
            label="Description (Optional)"
            rows={3}
            placeholder="Detailed requirements and acceptance criteria…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <Select
                label="Priority *"
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' }
                ]}
                required
              />
            </div>

            <div>
              <Input
                label="Start Date *"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              {formSubmitted && !startDate && (
                <span className="text-[11px] font-semibold text-[var(--tm-danger)] mt-1 block">
                  Start date is required.
                </span>
              )}
            </div>

            <div>
              <Input
                label="Due Date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Select
              label="Assign To *"
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              options={usersList.filter((m: User) => m.active).map((m: User) => ({
                value: m.id,
                label: m.id === user?.id ? `${m.name} (you)` : m.name
              }))}
              required
            />
            {formSubmitted && !assignedUserId && (
              <span className="text-[11px] font-semibold text-[var(--tm-danger)] mt-1 block">
                Please assign this task to someone.
              </span>
            )}
          </div>

          <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
            <Button variant="outline" type="button" onClick={() => setIsNewTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!isFormValid}>
              Create Task
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
