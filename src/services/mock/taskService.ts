import type { ITaskService, StartTaskResult } from '../interfaces';
import type {
  Task,
  TaskSession,
  Submission,
  AttachedFile,
  AttendanceDay,
  User,
  TaskReviewAction,
  TaskReviewEvent
} from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';
import { getTodayDateString, getNowISO, calculateDurationMinutes } from '../../utils/time';
import { gamificationService } from './gamificationService';
import { mockNotificationService } from './notificationService';

/** "[name] assigned you a task: [task]" — skipped when someone assigns a task to themselves. */
function notifyTaskAssigned(task: Task): void {
  const assignerId = task.assignedByUserId;
  if (!task.assignedUserId || !assignerId || assignerId === task.assignedUserId) return;

  const users = getStoredData<User[]>(KEYS.USERS);
  const assignerName = users.find(u => u.id === assignerId)?.name || 'Someone';

  mockNotificationService
    .addNotification(task.assignedUserId, {
      type: 'task_assigned',
      title: 'New task assigned',
      message: `${assignerName} assigned you a task: ${task.title}`,
      link: `/app/tasks/${task.id}`
    })
    .catch(console.error);
}

/** Appends one entry to a task's review history, keeping it chronological. */
function appendReviewEvent(
  task: Task,
  event: { action: TaskReviewAction; byUserId: string; at: string; message?: string; submissionId?: string }
): TaskReviewEvent[] {
  const history = task.reviewHistory ? [...task.reviewHistory] : [];
  history.push({ id: generateId('rev'), ...event });
  return history;
}

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
    notifyTaskAssigned(newTask);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === id);
    if (index === -1) throw new Error('Task not found');

    const previousAssignee = list[index].assignedUserId;
    const updated: Task = {
      ...list[index],
      ...updates
    };
    list[index] = updated;
    setStoredData(KEYS.TASKS, list);

    // Reassigning a task is also "someone assigned you a task".
    if (updates.assignedUserId && updates.assignedUserId !== previousAssignee) {
      notifyTaskAssigned(updated);
    }

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
    const now = getNowISO();
    const submission: Submission = {
      id: generateId('sub'),
      taskId,
      userId,
      notes,
      submittedAt: now,
      status: 'pending',
      files: files || [],
      fileUrls: fileUrls || []
    };

    // A resubmission is any submit after the admin asked for changes.
    const isResubmission = task.reviewStatus === 'changes_requested' || task.submissions.length > 0;

    task.submissions.push(submission);
    task.status = 'review';
    task.reviewStatus = 'submitted';
    // The open change request has been addressed.
    task.changeRequest = undefined;
    task.reviewHistory = appendReviewEvent(task, {
      action: isResubmission ? 'resubmitted' : 'submitted',
      byUserId: userId,
      at: now,
      submissionId: submission.id
    });

    list[index] = task;
    setStoredData(KEYS.TASKS, list);
    return task;
  }

  async reviewSubmission(
    taskId: string,
    submissionId: string,
    status: 'approved' | 'needs_changes',
    comment?: string,
    reviewerId?: string
  ): Promise<Task> {
    await delay(100);
    const list = getStoredData<Task[]>(KEYS.TASKS);
    const index = list.findIndex(t => t.id === taskId);
    if (index === -1) throw new Error('Task not found');

    const task = list[index];
    const sub = task.submissions.find(s => s.id === submissionId);
    if (!sub) throw new Error('Submission not found');

    if (status === 'needs_changes' && !comment?.trim()) {
      throw new Error('Please describe what needs to change.');
    }

    const now = getNowISO();
    sub.status = status;
    sub.adminComment = comment;

    if (status === 'approved') {
      task.status = 'completed';
      task.reviewStatus = 'approved';
      task.approvedAt = now;
      task.approvedByUserId = reviewerId;
      task.changeRequest = undefined;
      if (!task.completedAt) task.completedAt = now;
      task.reviewHistory = appendReviewEvent(task, {
        action: 'approved',
        byUserId: reviewerId || '',
        at: now,
        submissionId: sub.id
      });

      mockNotificationService
        .addNotification(task.assignedUserId, {
          type: 'task_approved',
          title: 'Task approved',
          message: `Your task '${task.title}' was approved ✅`,
          link: `/app/tasks/${task.id}`
        })
        .catch(console.error);

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
      // Changes requested: increment revision counter & hand the task back to the employee
      task.revisions = (task.revisions || 0) + 1;
      task.status = 'in_progress';
      task.reviewStatus = 'changes_requested';
      task.changeRequest = {
        message: (comment || '').trim(),
        requestedAt: now,
        requestedByUserId: reviewerId || ''
      };
      task.reviewHistory = appendReviewEvent(task, {
        action: 'changes_requested',
        byUserId: reviewerId || '',
        at: now,
        message: (comment || '').trim(),
        submissionId: sub.id
      });

      mockNotificationService
        .addNotification(task.assignedUserId, {
          type: 'changes_requested',
          title: 'Changes requested',
          message: `Changes requested on '${task.title}'`,
          link: `/app/tasks/${task.id}`
        })
        .catch(console.error);
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
