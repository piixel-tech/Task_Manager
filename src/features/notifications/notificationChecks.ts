import type { User } from '../../types';
import {
  attendanceService,
  holidayService,
  notificationService,
  taskService,
  userService
} from '../../services';
import { getTodayDateString } from '../../utils/time';

/** How often the date-based checks re-run while the app is open. */
export const NOTIFICATION_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/** Minutes past midnight for an "HH:mm" string. */
function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

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

/** 10. Not punched in 1 hour after shift start — once a day, working days only. */
async function checkPunchIn(user: User, today: string): Promise<void> {
  const [weekOffs, holidays, shiftStart] = await Promise.all([
    holidayService.getWeekOffs(),
    holidayService.getHolidays(),
    holidayService.getShiftStart()
  ]);

  // Skip weekly offs and holidays.
  const dayOfWeek = new Date(`${today}T00:00:00`).getDay();
  if (weekOffs.includes(dayOfWeek)) return;
  if (holidays.some((h) => h.date === today)) return;

  // Only once the shift started more than an hour ago.
  const now = new Date();
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  if (minutesNow < toMinutes(shiftStart) + 60) return;

  const records = await attendanceService.getAttendance(user.id, today);
  const todayRecord = records[0];

  // Already punched in at some point today, or on leave: nothing to remind about.
  if (todayRecord?.status === 'on_leave') return;
  if (todayRecord && todayRecord.punchSessions.length > 0) return;

  await notificationService.addNotificationOnceToday(user.id, 'punch_reminder', {
    type: 'punch_reminder',
    title: 'Punch in reminder',
    message: "You haven't punched in yet",
    link: '/app/attendance'
  });
}

/**
 * Date-based checks: birthdays, tasks due today and the punch-in reminder.
 * Runs on app load and every 5 minutes; each notification carries a
 * "sent today" key so re-running never duplicates anything.
 */
export async function runNotificationChecks(user: User | null): Promise<void> {
  if (!user || user.role !== 'employee' || !user.active) return;

  const today = getTodayDateString();

  try {
    await checkBirthdays(user, today);
    await checkTasksDueToday(user, today);
    await checkPunchIn(user, today);
  } catch (err) {
    console.error('Notification checks failed', err);
  }
}
