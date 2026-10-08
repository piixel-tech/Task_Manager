import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Clock3,
  GripVertical,
  Play,
  Plus,
  Square,
  MessageSquare,
  Calendar as CalendarIcon,
  FileCheck
} from 'lucide-react';
import { projectService, taskService, userService } from '../../../services';
import type { Project, Task, User, TaskStatus } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Avatar } from '../../../components/ui/Avatar';
import { Modal } from '../../../components/ui/Modal';
import { Input, Textarea } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { StaggerItem } from '../../../components/ui/Stagger';
import { SkeletonRows } from '../../../components/ui/Skeleton';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { listItemVariants, fastT } from '../../../components/ui/motion';
import { formatHours } from '../../../utils/format';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { TaskSubmitModal } from '../components/TaskSubmitModal';
import { startOfWeek, endOfWeek, parseISO, isWithinInterval } from 'date-fns';

/** Kanban Column Definition */
interface KanbanColumn {
  id: TaskStatus;
  title: string;
  accent: string;
  badgeTone: 'neutral' | 'ok' | 'warn' | 'primary';
}

const ADMIN_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'todo', title: 'Upcoming', accent: 'var(--tm-neutral)', badgeTone: 'neutral' },
  { id: 'in_progress', title: 'In progress', accent: 'var(--tm-primary)', badgeTone: 'primary' },
  { id: 'review', title: 'In review', accent: 'var(--tm-warning)', badgeTone: 'warn' },
  { id: 'completed', title: 'Done', accent: 'var(--tm-success)', badgeTone: 'ok' }
];

const EMPLOYEE_KANBAN_COLUMNS: KanbanColumn[] = [
  { id: 'in_progress', title: 'In progress', accent: 'var(--tm-primary)', badgeTone: 'primary' },
  { id: 'todo', title: 'Upcoming', accent: 'var(--tm-neutral)', badgeTone: 'neutral' },
  { id: 'completed', title: 'Done', accent: 'var(--tm-success)', badgeTone: 'ok' }
];

/** Draggable Kanban Card component */
const KanbanCard: React.FC<{
  task: Task;
  project?: Project;
  assignedUser?: User;
  currentUser?: User | null;
  onNavigate: () => void;
  onStartTimer: (e: React.MouseEvent) => void;
  onPauseTimer: (e: React.MouseEvent) => void;
  onSubmitForm: () => void;
}> = ({
  task,
  project,
  assignedUser,
  currentUser,
  onNavigate,
  onStartTimer,
  onPauseTimer,
  onSubmitForm
}) => {
  const { reduced } = useMotionPrefs();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    data: { task }
  });

  const activeSession = task.sessions.find((s) => !s.endTime && s.userId === currentUser?.id);
  const logged = task.loggedHours || 0;
  const estimated = task.estimatedHours || 8;
  const progressPct = Math.min(100, (logged / estimated) * 100);
  const isOverdue = !!task.dueDate && task.dueDate < getTodayDateString();

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 30 : 1,
        opacity: isDragging ? 0.75 : 1
      }}
    >
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
        {/* Grip handle */}
        <div
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-3 top-3 cursor-grab p-1 text-[var(--tm-ink-muted)] opacity-40 hover:opacity-100 active:cursor-grabbing"
          title="Drag to move card"
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Project Tag & Priority */}
        <div className="flex flex-wrap items-center gap-1.5 pr-6">
          {project && (
            <Badge variant="default" size="sm">
              {project.name}
            </Badge>
          )}
          <StatusChip status={task.priority} size="sm" />
        </div>

        {/* Task Title */}
        <h4 className="mt-2.5 text-[14.5px] font-bold leading-snug text-[var(--tm-ink)]">
          {task.title}
        </h4>

        {task.subHeading && (
          <p className="mt-0.5 line-clamp-1 text-[12px] font-semibold text-[var(--tm-ink-muted)]">
            {task.subHeading}
          </p>
        )}

        {/* Progress Bar */}
        <div className="mt-3.5 space-y-1">
          <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--tm-ink-muted)]">
            <span>{formatHours(logged)}</span>
            <span>{estimated}h est</span>
          </div>
          <ProgressBar value={progressPct} tone={task.status === 'completed' ? 'ok' : 'primary'} height={6} />
        </div>

        {/* Footer Meta: Due date, comment count, avatar */}
        <div className="mt-4 flex items-center justify-between border-t border-[var(--tm-border)] pt-3 text-[11.5px] text-[var(--tm-ink-muted)]">
          <div className="flex items-center gap-3">
            {task.dueDate && (
              <span className={`inline-flex items-center gap-1 font-semibold ${isOverdue ? 'text-[var(--tm-danger)]' : ''}`}>
                <CalendarIcon className="h-3.5 w-3.5" />
                {formatDate(task.dueDate, 'MMM d')}
              </span>
            )}

            <span className="inline-flex items-center gap-1 font-semibold">
              <MessageSquare className="h-3.5 w-3.5" />
              {task.sessions.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Quick Play/Pause Action */}
            {activeSession ? (
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
            ) : null}

            {assignedUser && (
              <Avatar name={assignedUser.name} src={assignedUser.avatarUrl} size="sm" />
            )}
          </div>
        </div>
      </motion.article>
    </div>
  );
};

/** Droppable Kanban Column Wrapper */
const DroppableKanbanColumn: React.FC<{
  column: KanbanColumn;
  tasks: Task[];
  projectsMap: Map<string, Project>;
  usersMap: Map<string, User>;
  currentUser: User | null;
  onNavigateTask: (id: string) => void;
  onStartTimer: (e: React.MouseEvent, taskId: string) => void;
  onPauseTimer: (e: React.MouseEvent, taskId: string) => void;
  onSubmitForm: (task: Task) => void;
}> = ({
  column,
  tasks,
  projectsMap,
  usersMap,
  currentUser,
  onNavigateTask,
  onStartTimer,
  onPauseTimer,
  onSubmitForm
}) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col rounded-[var(--tm-radius-xl)] bg-[var(--tm-card-muted)] border p-3.5 transition-colors ${
        isOver ? 'border-[var(--tm-primary)] bg-[var(--tm-primary-softer)]' : 'border-[var(--tm-border)]'
      }`}
    >
      {/* Column Header */}
      <div className="mb-3.5 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 rounded-full"
            style={{ background: column.accent }}
          />
          <h3 className="text-[14px] font-extrabold uppercase tracking-wide text-[var(--tm-ink)]">
            {column.title}
          </h3>
        </div>
        <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--tm-card)] px-1.5 text-[11px] font-bold text-[var(--tm-ink-soft)] border border-[var(--tm-border)]">
          {tasks.length}
        </span>
      </div>

      {/* Column Cards Container */}
      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 space-y-3 min-h-[360px]">
          {tasks.length === 0 ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center rounded-[var(--tm-radius-lg)] border border-dashed border-[var(--tm-border)] p-4 text-center">
              <span className="text-[12px] font-semibold text-[var(--tm-ink-muted)]">
                No tasks in {column.title}
              </span>
            </div>
          ) : (
            tasks.map((task) => (
              <KanbanCard
                key={task.id}
                task={task}
                project={projectsMap.get(task.projectId)}
                assignedUser={usersMap.get(task.assignedUserId)}
                currentUser={currentUser}
                onNavigate={() => onNavigateTask(task.id)}
                onStartTimer={(e) => onStartTimer(e, task.id)}
                onPauseTimer={(e) => onPauseTimer(e, task.id)}
                onSubmitForm={() => onSubmitForm(task)}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
};

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { showToast, companyFilter } = useAppStore();
  const isAdmin = user?.role === 'admin';
  const prefix = isAdmin ? '/admin' : '/app';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // PillTabs filter
  const [filterTab, setFilterTab] = useState<'all' | 'my' | 'high' | 'this_week'>('all');

  // Modal dialog states
  const [confirmTask, setConfirmTask] = useState<{ targetId: string; runningName: string } | null>(null);
  const [taskToSubmit, setTaskToSubmit] = useState<Task | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);

  // New task form
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [taskName, setTaskName] = useState('');
  const [subHeading, setSubHeading] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [startDate, setStartDate] = useState(getTodayDateString());
  const [dueDate, setDueDate] = useState('');
  const [assignedUserId, setAssignedUserId] = useState(user?.id || '');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const fetchTasks = async () => {
    const [tskList, prjList, uList] = await Promise.all([
      taskService.getTasks(),
      projectService.getProjects(),
      userService.getUsers()
    ]);
    setTasks(tskList);
    setProjects(prjList);
    setAllUsers(uList);
    setLoading(false);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  const projectsMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const usersMap = useMemo(() => new Map(allUsers.map((u) => [u.id, u])), [allUsers]);

  // Filter tasks based on company filter & PillTabs filter
  const filteredTasks = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 1 });
    const weekEnd = endOfWeek(now, { weekStartsOn: 1 });

    return tasks.filter((t) => {
      // Employee sees only their own tasks
      if (!isAdmin && t.assignedUserId !== user?.id) return false;

      const prj = projectsMap.get(t.projectId);
      if (companyFilter !== 'all' && prj && prj.company !== companyFilter) return false;

      if (filterTab === 'my' && t.assignedUserId !== user?.id) return false;
      if (filterTab === 'high' && t.priority !== 'high' && t.priority !== 'urgent') return false;
      if (filterTab === 'this_week') {
        if (!t.dueDate) return false;
        const d = parseISO(t.dueDate);
        if (!isWithinInterval(d, { start: weekStart, end: weekEnd })) return false;
      }
      return true;
    });
  }, [tasks, projectsMap, companyFilter, filterTab, user, isAdmin]);

  // Group tasks by Kanban column status
  const kanbanTasks = useMemo(() => {
    const map: Record<TaskStatus, Task[]> = {
      todo: [],
      in_progress: [],
      review: [],
      completed: []
    };

    filteredTasks.forEach((t) => {
      if (map[t.status]) {
        map[t.status].push(t);
      } else {
        map.todo.push(t);
      }
    });

    return map;
  }, [filteredTasks]);

  // Drag and Drop Handler
  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const taskId = String(active.id);
    const targetTask = tasks.find((t) => t.id === taskId);
    if (!targetTask) return;

    // Detect target column ID
    let newStatus: TaskStatus | null = null;
    if (over.id in kanbanTasks) {
      newStatus = over.id as TaskStatus;
    } else {
      const overTask = tasks.find((t) => t.id === over.id);
      if (overTask) newStatus = overTask.status;
    }

    if (!newStatus || newStatus === targetTask.status) return;

    // Specific rules when dropping into columns:
    if (newStatus === 'in_progress') {
      // Dropping into In progress starts the timer (keep the one-running-task rule)
      if (user) {
        try {
          const res = await taskService.startTaskSession(taskId, user.id);
          if (res.needConfirm && res.runningTaskName) {
            setConfirmTask({ targetId: taskId, runningName: res.runningTaskName });
          } else {
            showToast(`Moved to In progress & started timer for "${targetTask.title}"!`);
            fetchTasks();
          }
        } catch (err: any) {
          showToast(err.message || 'Failed to start timer');
        }
      }
    } else if (newStatus === 'review') {
      // Dropping into In review opens the Submit form
      setTaskToSubmit(targetTask);
    } else {
      // Moving to Todo or Completed
      try {
        await taskService.updateTask(taskId, { status: newStatus });
        showToast(`Moved "${targetTask.title}" to ${newStatus === 'completed' ? 'Done' : 'Upcoming'}.`);
        fetchTasks();
      } catch (err: any) {
        showToast(err.message || 'Failed to update task status');
      }
    }
  };

  const handleStartTimer = async (e: React.MouseEvent, taskId: string, force = false) => {
    e.stopPropagation();
    if (!user) return;
    try {
      const res = await taskService.startTaskSession(taskId, user.id, force);
      if (res.needConfirm && res.runningTaskName) {
        setConfirmTask({ targetId: taskId, runningName: res.runningTaskName });
      } else {
        showToast('Started timer!');
        setConfirmTask(null);
        fetchTasks();
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to start timer');
    }
  };

  const handleStopTimer = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    if (!user) return;
    try {
      await taskService.stopTaskSession(taskId, user.id);
      showToast('Task timer paused.');
      fetchTasks();
    } catch (err: any) {
      showToast(err.message || 'Failed to pause timer');
    }
  };

  const userProjects = projects.filter((p) => p.memberIds.includes(user?.id || ''));

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !taskName) return;

    try {
      await taskService.createTask({
        projectId: selectedProjectId,
        title: taskName,
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
      showToast('Task created successfully!');
      setIsNewTaskModalOpen(false);
      setTaskName('');
      setSubHeading('');
      setDescription('');
      fetchTasks();
    } catch (err: any) {
      showToast(err.message || 'Failed to create task');
    }
  };

  return (
    <>
      <PageHeader
        title={isAdmin ? 'Task Hub' : 'My Tasks'}
        description="Kanban board with live timers, drag-and-drop workflow, and deliverable submission."
        actions={
          <Button size="sm" onClick={() => {
            if (userProjects.length > 0) setSelectedProjectId(userProjects[0].id);
            setIsNewTaskModalOpen(true);
          }} leftIcon={<Plus className="h-4 w-4" />}>
            New Task
          </Button>
        }
      />

      {/* PillTabs Filters */}
      <StaggerItem>
        <PillTabs
          activeTab={filterTab}
          onChange={(tab) => setFilterTab(tab as typeof filterTab)}
          tabs={[
            { id: 'all', label: 'All Tasks', count: filteredTasks.length },
            ...(isAdmin
              ? [{ id: 'my', label: 'My Tasks', count: tasks.filter((t) => t.assignedUserId === user?.id).length }]
              : []),
            { id: 'high', label: 'High Priority', count: filteredTasks.filter((t) => t.priority === 'high' || t.priority === 'urgent').length },
            { id: 'this_week', label: 'Due This Week' }
          ]}
        />
      </StaggerItem>

      {/* Kanban Board Container */}
      {loading ? (
        <SkeletonRows count={4} />
      ) : filteredTasks.length === 0 ? (
        <EmptyState
          icon={<Clock3 className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="No tasks found"
          description="Adjust your filters or create a new task to get started."
        />
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className={`grid grid-cols-1 gap-5 md:grid-cols-2 ${isAdmin ? 'xl:grid-cols-4' : 'xl:grid-cols-3'}`}>
            {(isAdmin ? ADMIN_KANBAN_COLUMNS : EMPLOYEE_KANBAN_COLUMNS).map((col) => (
              <DroppableKanbanColumn
                key={col.id}
                column={col}
                tasks={kanbanTasks[col.id]}
                projectsMap={projectsMap}
                usersMap={usersMap}
                currentUser={user}
                onNavigateTask={(id) => navigate(`${prefix}/tasks/${id}`)}
                onStartTimer={handleStartTimer}
                onPauseTimer={handleStopTimer}
                onSubmitForm={(t) => setTaskToSubmit(t)}
              />
            ))}
          </div>
        </DndContext>
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

      {/* Deliverable Submission Modal */}
      <TaskSubmitModal
        isOpen={!!taskToSubmit}
        onClose={() => setTaskToSubmit(null)}
        task={taskToSubmit}
        onSubmitSuccess={fetchTasks}
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
          <Select
            label="Project"
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            options={userProjects.map((p) => ({
              value: p.id,
              label: `${p.name} (${p.company})`
            }))}
            required
          />

          <Input
            label="Task Title"
            placeholder="e.g. Design user profile component"
            value={taskName}
            onChange={(e) => setTaskName(e.target.value)}
            required
          />

          <Input
            label="Sub-heading"
            placeholder="e.g. Form layout and responsive drawer"
            value={subHeading}
            onChange={(e) => setSubHeading(e.target.value)}
          />

          <Textarea
            label="Description"
            rows={3}
            placeholder="Detailed requirements and acceptance criteria…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Select
              label="Priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'low' | 'medium' | 'high')}
              options={[
                { value: 'low', label: 'Low' },
                { value: 'medium', label: 'Medium' },
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
            options={allUsers.map((m) => ({
              value: m.id,
              label: m.id === user?.id ? `${m.name} (you)` : m.name
            }))}
          />

          <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
            <Button variant="outline" type="button" onClick={() => setIsNewTaskModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create Task</Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
