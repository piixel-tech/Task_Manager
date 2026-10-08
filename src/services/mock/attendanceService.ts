import type { IAttendanceService } from '../interfaces';
import type { AttendanceDay, PunchSession, BreakSession, Task } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';
import { getTodayDateString, getNowISO, calculateDurationMinutes } from '../../utils/time';

export class MockAttendanceService implements IAttendanceService {
  private autoPauseUserRunningTasks(userId: string) {
    const tasks = getStoredData<Task[]>(KEYS.TASKS);
    let updated = false;

    for (const t of tasks) {
      const activeSess = t.sessions.find(s => !s.endTime && s.userId === userId);
      if (activeSess) {
        const nowISO = getNowISO();
        activeSess.endTime = nowISO;
        activeSess.durationMinutes = calculateDurationMinutes(activeSess.startTime, nowISO);

        const totalMinutes = t.sessions.reduce((acc, s) => acc + (s.durationMinutes || 0), 0);
        t.loggedHours = Number((totalMinutes / 60).toFixed(2));
        updated = true;
      }
    }

    if (updated) {
      setStoredData(KEYS.TASKS, tasks);
    }
  }

  async getAttendance(userId?: string, date?: string): Promise<AttendanceDay[]> {
    await delay(50);
    let list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    if (userId) list = list.filter(a => a.userId === userId);
    if (date) list = list.filter(a => a.date === date);
    return list;
  }

  async markDayStatus(userId: string, status: 'present' | 'on_leave', dateStr?: string): Promise<AttendanceDay> {
    await delay(100);
    const date = dateStr || getTodayDateString();
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    let day = list.find(a => a.userId === userId && a.date === date);

    if (!day) {
      day = {
        id: generateId('att'),
        userId,
        date,
        status,
        punchSessions: [],
        totalHours: 0
      };
      list.push(day);
    } else {
      day.status = status;
    }

    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  async punchIn(userId: string): Promise<AttendanceDay> {
    await delay(100);
    const today = getTodayDateString();
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    let day = list.find(a => a.userId === userId && a.date === today);

    const nowISO = getNowISO();
    const newSession: PunchSession = {
      id: generateId('ps'),
      punchIn: nowISO,
      breaks: []
    };

    if (!day) {
      day = {
        id: generateId('att'),
        userId,
        date: today,
        status: 'present',
        punchSessions: [newSession],
        totalHours: 0
      };
      list.push(day);
    } else {
      day.status = 'present';
      day.punchSessions.push(newSession);
    }

    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  async punchOut(userId: string): Promise<AttendanceDay> {
    await delay(100);
    // Auto-pause running task timers when punching out
    this.autoPauseUserRunningTasks(userId);

    const today = getTodayDateString();
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    const day = list.find(a => a.userId === userId && a.date === today);
    if (!day || day.punchSessions.length === 0) throw new Error('No active punch session found');

    const activeSession = day.punchSessions[day.punchSessions.length - 1];
    if (activeSession.punchOut) throw new Error('Already punched out');

    if (activeSession.breaks.length > 0) {
      const lastBreak = activeSession.breaks[activeSession.breaks.length - 1];
      if (!lastBreak.breakEnd) {
        lastBreak.breakEnd = getNowISO();
      }
    }

    activeSession.punchOut = getNowISO();
    day.totalHours = this.calculateTotalWorkedHours(day);

    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  async startBreak(userId: string, type: 'lunch' | 'tea' | 'personal'): Promise<AttendanceDay> {
    await delay(100);
    // Auto-pause running task timers when going on break
    this.autoPauseUserRunningTasks(userId);

    const today = getTodayDateString();
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    const day = list.find(a => a.userId === userId && a.date === today);
    if (!day || day.punchSessions.length === 0) throw new Error('Must punch in first');

    const activeSession = day.punchSessions[day.punchSessions.length - 1];
    if (activeSession.punchOut) throw new Error('Cannot start break while punched out');

    if (activeSession.breaks.some(b => !b.breakEnd)) {
      throw new Error('Break is already in progress');
    }

    const newBreak: BreakSession = {
      id: generateId('bs'),
      breakStart: getNowISO(),
      type
    };

    activeSession.breaks.push(newBreak);
    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  async endBreak(userId: string): Promise<AttendanceDay> {
    await delay(100);
    const today = getTodayDateString();
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    const day = list.find(a => a.userId === userId && a.date === today);
    if (!day || day.punchSessions.length === 0) throw new Error('No active day found');

    const activeSession = day.punchSessions[day.punchSessions.length - 1];
    const openBreak = activeSession.breaks.find(b => !b.breakEnd);
    if (!openBreak) throw new Error('No active break found');

    openBreak.breakEnd = getNowISO();
    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  async endMyDay(userId: string): Promise<AttendanceDay> {
    await delay(100);
    // Auto-pause running task timers when ending day
    this.autoPauseUserRunningTasks(userId);

    const today = getTodayDateString();
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    const day = list.find(a => a.userId === userId && a.date === today);
    if (!day || day.punchSessions.length === 0) throw new Error('No active shift found to end');

    const activeSession = day.punchSessions[day.punchSessions.length - 1];
    if (!activeSession.punchOut) {
      if (activeSession.breaks.length > 0) {
        const lastBreak = activeSession.breaks[activeSession.breaks.length - 1];
        if (!lastBreak.breakEnd) {
          lastBreak.breakEnd = getNowISO();
        }
      }
      activeSession.punchOut = getNowISO();
    }

    day.totalHours = this.calculateTotalWorkedHours(day);

    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  async correctPunchOutTime(attendanceId: string, correctedTimeISO: string, reason: string): Promise<AttendanceDay> {
    await delay(100);
    const list = getStoredData<AttendanceDay[]>(KEYS.ATTENDANCE);
    const day = list.find(a => a.id === attendanceId);
    if (!day) throw new Error('Attendance record not found');

    if (day.punchSessions.length > 0) {
      const lastSession = day.punchSessions[day.punchSessions.length - 1];
      lastSession.punchOut = correctedTimeISO;
    }

    day.flagged = false;
    day.correctionReason = reason;
    day.totalHours = this.calculateTotalWorkedHours(day);

    setStoredData(KEYS.ATTENDANCE, list);
    return day;
  }

  private calculateTotalWorkedHours(day: AttendanceDay): number {
    let totalMinutes = 0;
    for (const session of day.punchSessions) {
      if (session.punchIn) {
        const sessMins = calculateDurationMinutes(session.punchIn, session.punchOut);
        let breakMins = 0;
        for (const b of session.breaks) {
          if (b.breakStart) {
            breakMins += calculateDurationMinutes(b.breakStart, b.breakEnd);
          }
        }
        totalMinutes += Math.max(0, sessMins - breakMins);
      }
    }
    return Number((totalMinutes / 60).toFixed(2));
  }
}

export const mockAttendanceService = new MockAttendanceService();
