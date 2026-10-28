import type { User } from '../../types';
import {
  notificationService,
  taskService,
  userService
} from '../../services';
import { getTodayDateString } from '../../utils/time';

/** How often the date-based checks re-run while the app is open. */
export const NOTIFICATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** 7. Today is [name]'s birthday 🎂 */
async function checkBirthdays(user: User, today: string): Promise<void> {
  const todayMMDD = today.slice(5);
  const users = await userService.getUsers();

  for (const other of users) {
    if (other.id === user.id || !other.active || other.role === 'client') continue;
    if (!other.birthday || !other.birthday.endsWith(todayMMDD)) continue;

    await notificationService.addNotificationOnceToday(user.id, `birthday:${other.id}`, {
      type: 'birthday',
      title: 'Birthday today',
      message: `Today is ${other.name}'s birthday 🎂`,
      link: '/app/calendar'
    });
  }
}

/**
 * 8 + 9. Task due today.
 * The data model has a single `dueDate` per task, so "due today" and
 * "deadline today" are the same event and are sent as one notification.
 */
async function checkTasksDueToday(user: User, today: string): Promise<void> {
  const tasks = await taskService.getTasks(undefined, user.id);

  for (const task of tasks) {
    if (task.status === 'completed' || task.dueDate !== today) continue;

    await notificationService.addNotificationOnceToday(user.id, `task_due:${task.id}`, {
      type: 'task_due',
      title: 'Task due today',
      message: `Task due today: ${task.title}`,
      link: `/app/tasks/${task.id}`
    });
  }
}

/**
 * Date-based checks: birthdays and tasks due today.
 * Runs on app load and every 5 minutes; each notification carries a
 * "sent today" key so re-running never duplicates anything.
 */
export async function runNotificationChecks(user: User | null): Promise<void> {
  if (!user || user.role !== 'employee' || !user.active) return;

  const today = getTodayDateString();

  try {
    await checkBirthdays(user, today);
    await checkTasksDueToday(user, today);
  } catch (err) {
    console.error('Notification checks failed', err);
  }
}
