import type { ITaskService, StartTaskResult } from '../interfaces';
import type { Task, TaskSession, Submission, AttachedFile, AttendanceDay, User } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';
import { getTodayDateString, getNowISO, calculateDurationMinutes } from '../../utils/time';
import { gamificationService } from './gamificationService';

export class MockTaskService implements ITaskService {
  async getTasks(projectId?: string, userId?: string): Promise<Task[]> {
    await delay(50);
    let list = getStoredData<Task[]>(KEYS.TASKS);
    if (projectId) list = list.filter(t => t.projectId === projectId);
    if (userId) list = list.filter(t => t.assignedUserId === userId);
    return list;
  }

  async getTaskById(id: string): Promise<Task | null> {
    await delay(50);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    return list.find(t => t.id === id) || null;
  }

  async createTask(data: Omit<Task, 'id' | 'createdAt' | 'sessions' | 'submissions'>): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const newTask: Task = {
      ...data,
      id: generateId('tsk'),
      createdAt: getNowISO(),
      startDate: data.startDate || getTodayDateString(),
      assignmentStatus: data.assignedByUserId && data.assignedByUserId !== data.assignedUserId ? 'pending' : 'accepted',
      sessions: [],
      submissions: [],
      loggedHours: 0
    };
    list.push(newTask);
    setStoredData(KEYS.TASKS, list);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Task not found');

    const updated: Task = {
      ...list[index],
      ...updates
    };
    list[index] = updated;
    setStoredData(KEYS.TASKS, list);
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    await delay(100);
    let list = getStoredData<Task[]>(KEYS.TASKS);
    list = list.filter(t => t.id !== id);
    setStoredData(KEYS.TASKS, list);
  }

  async startTaskSession(taskId: string, userId: string, force = false): Promise<StartTaskResult> {
    await delay(100);

    // Rule: Must be punched in to start task timer
    const todayStr = getTodayDateString();
    const attendance = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    const todayRecord = attendance.find(a => a.userId === userId && a.date === todayStr);

    const activePunch = todayRecord?.punchSessions.find(s => !s.punchOut);
    const activeBreak = activePunch?.breaks.find(b => !b.breakEnd);

    if (!todayRecord || !activePunch || activeBreak) {
      throw new Error('You must be punched in (and not on break) to start a task timer.');
    }

    const list = getStoredData<Task[]>(KEYS.TASKS);
    const targetTask = list.find(t => t.id === taskId);
    if (!targetTask) throw new Error('Task not found');

    // Rule: Only ONE running task per person
    const runningTask = list.find(t => t.sessions.some(s => !s.endTime && s.userId === userId));

    if (runningTask && runningTask.id !== taskId) {
      if (!force) {
        return {
          task: targetTask,
          needConfirm: true,
          runningTaskName: runningTask.title
        };
      } else {
        // Pause running task timer
        const openSess = runningTask.sessions.find(s => !s.endTime && s.userId === userId);
        if (openSess) {
          const now = getNowISO();
          openSess.endTime = now;
          openSess.durationMinutes = calculateDurationMinutes(openSess.startTime, now);
          const totalMins = runningTask.sessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
          runningTask.loggedHours = Number((totalMins / 60).toFixed(2));
        }
      }
    }

    // Start timer on target task
    const nowISO = getNowISO();
    const newSession: TaskSession = {
      id: generateId('ts'),
      taskId,
      userId,
      startTime: nowISO
    };

    targetTask.sessions.push(newSession);
    targetTask.status = 'in_progress';

    setStoredData(KEYS.TASKS, list);
    return { task: targetTask };
  }

  async stopTaskSession(taskId: string, userId: string): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');

    const task = list[index];
    const openSessionIndex = task.sessions.findIndex(s => !s.endTime && s.userId === userId);
    if (openSessionIndex === -1) return task; // Already paused

    const nowISO = getNowISO();
    const session = task.sessions[openSessionIndex];
    session.endTime = nowISO;
    session.durationMinutes = calculateDurationMinutes(session.startTime, nowISO);

    const totalMinutes = task.sessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
    task.loggedHours = Number((totalMinutes / 60).toFixed(2));

    list[index] = task;
    setStoredData(KEYS.TASKS, list);
    return task;
  }

  async submitTaskWork(
    taskId: string,
    userId: string,
    notes: string,
    files?: AttachedFile[],
    fileUrls?: string[]
  ): Promise<Task> {
    await delay(100);

    // Stop active timer session if running
    await this.stopTaskSession(taskId, userId);

    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');

    const task = list[index];
    const submission: Submission = {
      id: generateId('sub'),
      taskId,
      userId,
      notes,
      submittedAt: getNowISO(),
      status: 'pending',
      files: files || [],
      fileUrls: fileUrls || []
    };

    task.submissions.push(submission);
    task.status = 'review';

    list[index] = task;
    setStoredData(KEYS.TASKS, list);
    return task;
  }

  async reviewSubmission(
    taskId: string,
    submissionId: string,
    status: 'approved' | 'needs_changes',
    comment?: string
  ): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');

    const task = list[index];
    const sub = task.submissions.find(s => s.id === submissionId);
    if (!sub) throw new Error('Submission not found');

    sub.status = status;
    sub.adminComment = comment;

    if (status === 'approved') {
      task.status = 'completed';

      // Gamification logic
      const today = getTodayDateString();
      const isOnTime = !task.dueDate || today <= task.dueDate;
      const points = isOnTime ? 10 : 5;
      
      // Award points asynchronously
      gamificationService.addPoints(task.assignedUserId, points).catch(console.error);

      // Award Zero Revisions badge if no revisions occurred
      if ((task.revisions || 0) === 0) {
        gamificationService.awardBadge(task.assignedUserId, 'zero_revisions').catch(console.error);
      }

      // Award Fastest Delivery if finished 2+ days early
      if (task.dueDate && today < task.dueDate) {
        gamificationService.awardBadge(task.assignedUserId, 'fastest_delivery').catch(console.error);
      }
    } else {
      // Needs changes: increment revision counter & move back to in_progress
      task.revisions = (task.revisions || 0) + 1;
      task.status = 'in_progress';
    }

    list[index] = task;
    setStoredData(KEYS.TASKS, list);
    return task;
  }

  async respondToAssignment(taskId: string, action: 'accept' | 'reject', reason?: string): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');

    const task = list[index];
    if (action === 'accept') {
      task.assignmentStatus = 'accepted';
      if (task.assignedByUserId && task.assignedByUserId !== task.assignedUserId) {
        gamificationService.awardBadge(task.assignedUserId, 'helped_teammate', task.assignedByUserId).catch(console.error);
      }
    } else {
      task.assignmentStatus = 'rejected';
      task.rejectionReason = reason;
    }

    list[index] = task;
    setStoredData(KEYS.TASKS, list);
    return task;
  }

  async getSubmissionsFeed(): Promise<{ submission: Submission; task: Task; user?: User }[]> {
    await delay(50);
    const tasks = getStoredData<Task[]>(KEYS.TASKS);
    const users = getStoredData<User[]>(KEYS.USERS);
    const userMap = new Map(users.map(u => [u.id, u]));

    const feed: { submission: Submission; task: Task; user?: User }[] = [];

    for (const t of tasks) {
      for (const sub of t.submissions) {
        feed.push({
          submission: sub,
          task: t,
          user: userMap.get(sub.userId)
        });
      }
    }

    // Sort newest first
    return feed.sort((a, b) => new Date(b.submission.submittedAt).getTime() - new Date(a.submission.submittedAt).getTime());
  }
}

export const mockTaskService = new MockTaskService();
