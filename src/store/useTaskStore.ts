import { create } from 'zustand';
import type { Task, AttachedFile } from '../types';
import { taskService } from '../services';
import type { StartTaskResult } from '../services/interfaces';
import { parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';
import { triggerTaskCelebration } from '../features/tasks/components/TaskCompletionCelebration';

interface TaskState {
  tasks: Task[];
  isLoading: boolean;
  error: string | null;

  fetchTasks: () => Promise<Task[]>;
  setTasks: (tasks: Task[]) => void;
  updateTaskInStore: (task: Task) => void;

  createTask: (data: Omit<Task, 'id' | 'createdAt' | 'sessions' | 'submissions'>) => Promise<Task>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<Task>;
  completeTask: (id: string) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  startTaskSession: (taskId: string, userId: string, force?: boolean) => Promise<StartTaskResult>;
  stopTaskSession: (taskId: string, userId: string) => Promise<Task>;
  submitTaskWork: (taskId: string, userId: string, notes: string, files?: AttachedFile[], fileUrls?: string[]) => Promise<Task>;
  reviewSubmission: (taskId: string, submissionId: string, status: 'approved' | 'needs_changes', comment?: string, reviewerId?: string) => Promise<Task>;
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  isLoading: false,
  error: null,

  fetchTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const list = await taskService.getTasks();
      set({ tasks: list, isLoading: false });
      return list;
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch tasks', isLoading: false });
      return [];
    }
  },

  setTasks: (tasks: Task[]) => set({ tasks }),

  updateTaskInStore: (updatedTask: Task) => {
    set((state) => {
      const exists = state.tasks.some((t) => t.id === updatedTask.id);
      if (exists) {
        return {
          tasks: state.tasks.map((t) => (t.id === updatedTask.id ? { ...updatedTask } : t))
        };
      }
      return { tasks: [...state.tasks, { ...updatedTask }] };
    });
  },

  createTask: async (data) => {
    set({ isLoading: true });
    try {
      const created = await taskService.createTask(data);
      get().updateTaskInStore(created);
      set({ isLoading: false });
      return created;
    } catch (err: any) {
      set({ error: err.message || 'Failed to create task', isLoading: false });
      throw err;
    }
  },

  updateTask: async (id, updates) => {
    set({ isLoading: true });
    try {
      const updated = await taskService.updateTask(id, updates);
      get().updateTaskInStore(updated);
      set({ isLoading: false });

      if (updates.status === 'completed') {
        const allProjectTasks = get().tasks.filter((t) => t.projectId === updated.projectId);
        triggerTaskCelebration(updated, { allProjectTasks });
      }

      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to update task', isLoading: false });
      throw err;
    }
  },

  completeTask: async (id: string) => {
    return get().updateTask(id, { status: 'completed' });
  },

  deleteTask: async (id) => {
    set({ isLoading: true });
    try {
      await taskService.deleteTask(id);
      set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id), isLoading: false }));
    } catch (err: any) {
      set({ error: err.message || 'Failed to delete task', isLoading: false });
      throw err;
    }
  },

  startTaskSession: async (taskId, userId, force) => {
    set({ isLoading: true });
    try {
      const res = await taskService.startTaskSession(taskId, userId, force);
      // Also refresh tasks list since another task might have been stopped if force = true
      const freshTasks = await taskService.getTasks();
      set({ tasks: freshTasks, isLoading: false });
      return res;
    } catch (err: any) {
      set({ error: err.message || 'Failed to start timer', isLoading: false });
      throw err;
    }
  },

  stopTaskSession: async (taskId, userId) => {
    set({ isLoading: true });
    try {
      const updated = await taskService.stopTaskSession(taskId, userId);
      get().updateTaskInStore(updated);
      set({ isLoading: false });
      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to stop timer', isLoading: false });
      throw err;
    }
  },

  submitTaskWork: async (taskId, userId, notes, files, fileUrls) => {
    set({ isLoading: true });
    try {
      const updated = await taskService.submitTaskWork(taskId, userId, notes, files, fileUrls);
      get().updateTaskInStore(updated);
      set({ isLoading: false });
      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to submit task work', isLoading: false });
      throw err;
    }
  },

  reviewSubmission: async (taskId, submissionId, status, comment, reviewerId) => {
    set({ isLoading: true });
    try {
      const updated = await taskService.reviewSubmission(taskId, submissionId, status, comment, reviewerId);
      get().updateTaskInStore(updated);
      set({ isLoading: false });

      if (status === 'approved') {
        const allProjectTasks = get().tasks.filter((t) => t.projectId === updated.projectId);
        triggerTaskCelebration(updated, { allProjectTasks });
      }

      return updated;
    } catch (err: any) {
      set({ error: err.message || 'Failed to review submission', isLoading: false });
      throw err;
    }
  }
}));

/** Helper to calculate tasks done this week for a user */
export const getTasksDoneThisWeekCount = (tasks: Task[], userId: string): number => {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });

  return tasks.filter((t) => {
    if (t.assignedUserId !== userId) return false;
    if (t.status !== 'completed') return false;

    // Check completion date from task completedAt or last session endTime or createdAt
    const compDateStr =
      (t as any).completedAt ||
      t.sessions[t.sessions.length - 1]?.endTime ||
      t.createdAt;

    if (!compDateStr) return true;
    try {
      const dateObj = parseISO(compDateStr);
      return isWithinInterval(dateObj, { start, end });
    } catch {
      return true;
    }
  }).length;
};
