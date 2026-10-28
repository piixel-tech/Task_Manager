import type { ITaskService } from '../interfaces';
import type { Submission, Task, TaskStatus, User } from '../../types';
import { taskApi, type ApiTask } from './taskApi';

const moved = (): never => {
  throw new Error('Tasks are managed on the Tasks page.');
};

const STATUS: Record<ApiTask['status'], TaskStatus> = {
  todo: 'todo',
  in_progress: 'in_progress',
  submitted: 'review',
  changes_requested: 'in_progress',
  approved: 'completed'
};

/** Map an API task to the legacy `Task` shape older screens still read. */
export function toLegacyTask(t: ApiTask): Task {
  return {
    id: t.id,
    projectId: t.project_id,
    title: t.title,
    description: t.description,
    status: STATUS[t.status],
    priority: t.priority,
    assignedUserId: t.assignee?.id ?? '',
    assignedByUserId: t.created_by?.id,
    dueDate: t.due_date ?? undefined,
    sessions: [],
    submissions: [],
    loggedHours: t.total_seconds / 3600,
    createdAt: t.created_at,
    reviewStatus:
      t.status === 'submitted' || t.status === 'changes_requested' || t.status === 'approved' ? t.status : undefined
  };
}

/**
 * Read-only adapter that feeds real tasks to older screens (dashboards, profile tabs,
 * nav counts) in the legacy shape. Everything that changes a task goes through `taskApi`
 * on the Tasks pages. Submissions and reviews arrive with the review phase.
 */
export class HttpTaskService implements ITaskService {
  async getTasks(projectId?: string, userId?: string): Promise<Task[]> {
    const list = await taskApi.list({ project_id: projectId, assignee_id: userId });
    return list.map(toLegacyTask);
  }
  async getTaskById(id: string): Promise<Task | null> {
    try {
      return toLegacyTask(await taskApi.get(id));
    } catch {
      return null;
    }
  }
  async getSubmissionsFeed(): Promise<{ submission: Submission; task: Task; user?: User }[]> {
    return [];
  }

  async createTask(): Promise<Task> {
    return moved();
  }
  async updateTask(): Promise<Task> {
    return moved();
  }
  async deleteTask(): Promise<void> {
    return moved();
  }
  async startTaskSession(): Promise<never> {
    return moved();
  }
  async stopTaskSession(): Promise<Task> {
    return moved();
  }
  async submitTaskWork(): Promise<Task> {
    return moved();
  }
  async reviewSubmission(): Promise<Task> {
    return moved();
  }
  async respondToAssignment(): Promise<Task> {
    return moved();
  }
}

export const httpTaskService = new HttpTaskService();
