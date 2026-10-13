import { create } from 'zustand';
import type { AttendanceDay } from '../types';
import { attendanceService } from '../services';
import { getTodayDateString, calculateDurationMinutes } from '../utils/time';

interface AttendanceState {
  todayAttendance: AttendanceDay | null;
  history: AttendanceDay[];
  isLoading: boolean;
  error: string | null;
  fetchTodayAttendance: (userId: string) => Promise<AttendanceDay | null>;
  fetchAttendanceHistory: (userId?: string) => Promise<AttendanceDay[]>;
  punchIn: (userId: string) => Promise<AttendanceDay>;
  punchOut: (userId: string) => Promise<AttendanceDay>;
  startBreak: (userId: string, type: 'lunch' | 'tea' | 'personal') => Promise<AttendanceDay>;
  endBreak: (userId: string) => Promise<AttendanceDay>;
  endMyDay: (userId: string) => Promise<AttendanceDay>;
  resumeMyDay: (userId: string) => Promise<AttendanceDay>;
  setTodayAttendance: (day: AttendanceDay | null) => void;
}

export const useAttendanceStore = create<AttendanceState>((set) => ({
  todayAttendance: null,
  history: [],
  isLoading: false,
  error: null,

  setTodayAttendance: (day) => set({ todayAttendance: day ? { ...day } : null }),

  fetchTodayAttendance: async (userId: string) => {
    try {
      const records = await attendanceService.getAttendance(userId, getTodayDateString());
      const todayRecord = records[0] ? { ...records[0] } : null;
      set({ todayAttendance: todayRecord });
      return todayRecord;
    } catch (err: any) {
      set({ error: err.message });
      return null;
    }
  },

  fetchAttendanceHistory: async (userId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const records = await attendanceService.getAttendance(userId);
      set({ history: records, isLoading: false });
      const todayStr = getTodayDateString();
      const todayRecord = records.find((a) => a.date === todayStr) || null;
      if (todayRecord) {
        set({ todayAttendance: todayRecord });
      }
      return records;
    } catch (err: any) {
      set({ error: err.message || 'Failed to fetch attendance history', isLoading: false });
      return [];
    }
  },

  punchIn: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await attendanceService.punchIn(userId);
      const newObj = { ...updated, punchSessions: [...updated.punchSessions] };
      set((state) => ({
        todayAttendance: newObj,
        history: state.history.map((h) => (h.id === newObj.id ? newObj : h)),
        isLoading: false
      }));
      return newObj;
    } catch (err: any) {
      set({ error: err.message || 'Failed to punch in', isLoading: false });
      throw err;
    }
  },

  punchOut: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await attendanceService.punchOut(userId);
      const newObj = { ...updated, punchSessions: [...updated.punchSessions] };
      set((state) => ({
        todayAttendance: newObj,
        history: state.history.map((h) => (h.id === newObj.id ? newObj : h)),
        isLoading: false
      }));
      return newObj;
    } catch (err: any) {
      set({ error: err.message || 'Failed to punch out', isLoading: false });
      throw err;
    }
  },

  startBreak: async (userId: string, type) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await attendanceService.startBreak(userId, type);
      const newObj = { ...updated, punchSessions: [...updated.punchSessions] };
      set((state) => ({
        todayAttendance: newObj,
        history: state.history.map((h) => (h.id === newObj.id ? newObj : h)),
        isLoading: false
      }));
      return newObj;
    } catch (err: any) {
      set({ error: err.message || 'Failed to start break', isLoading: false });
      throw err;
    }
  },

  endBreak: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await attendanceService.endBreak(userId);
      const newObj = { ...updated, punchSessions: [...updated.punchSessions] };
      set((state) => ({
        todayAttendance: newObj,
        history: state.history.map((h) => (h.id === newObj.id ? newObj : h)),
        isLoading: false
      }));
      return newObj;
    } catch (err: any) {
      set({ error: err.message || 'Failed to end break', isLoading: false });
      throw err;
    }
  },

  endMyDay: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await attendanceService.endMyDay(userId);
      const newObj = { ...updated, punchSessions: [...updated.punchSessions] };
      set((state) => ({
        todayAttendance: newObj,
        history: state.history.map((h) => (h.id === newObj.id ? newObj : h)),
        isLoading: false
      }));
      return newObj;
    } catch (err: any) {
      set({ error: err.message || 'Failed to end day', isLoading: false });
      throw err;
    }
  },

  resumeMyDay: async (userId: string) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await attendanceService.resumeMyDay(userId);
      const newObj = { ...updated, punchSessions: [...updated.punchSessions] };
      set((state) => ({
        todayAttendance: newObj,
        history: state.history.map((h) => (h.id === newObj.id ? newObj : h)),
        isLoading: false
      }));
      return newObj;
    } catch (err: any) {
      set({ error: err.message || 'Failed to resume day', isLoading: false });
      throw err;
    }
  }
}));

/** Helper selector for total break minutes including explicit breaks and gaps between Punch Out and next Punch In */
export const calculateBreakMinutes = (
  day: AttendanceDay | null | undefined,
  nowISO?: string
): number => {
  if (!day || !day.punchSessions || day.punchSessions.length === 0) return 0;
  const now = nowISO || new Date().toISOString();
  let totalMinutes = 0;

  // 1. Explicit break sessions
  for (const session of day.punchSessions) {
    if (session.breaks) {
      for (const b of session.breaks) {
        if (b.breakStart) {
          totalMinutes += calculateDurationMinutes(b.breakStart, b.breakEnd || now);
        }
      }
    }
  }

  // 2. Gaps between Punch Out and next Punch In on the same day
  for (let i = 0; i < day.punchSessions.length; i++) {
    const current = day.punchSessions[i];
    if (current.punchOut) {
      if (i < day.punchSessions.length - 1) {
        const next = day.punchSessions[i + 1];
        if (next.punchIn) {
          totalMinutes += calculateDurationMinutes(current.punchOut, next.punchIn);
        }
      } else if (
        day.date === getTodayDateString() &&
        day.status !== 'absent' &&
        !day.dayEndedAt
      ) {
        totalMinutes += calculateDurationMinutes(current.punchOut, now);
      }
    }
  }

  return Math.round(totalMinutes);
};
