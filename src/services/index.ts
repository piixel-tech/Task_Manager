import { mockAuthService } from './mock/authService';
import { mockUserService } from './mock/userService';
import { mockAttendanceService } from './mock/attendanceService';
import { mockHolidayService } from './mock/holidayService';
import { mockProjectService } from './mock/projectService';
import { mockTaskService } from './mock/taskService';
import { mockChatService } from './mock/chatService';
import { gamificationService as mockGamificationService } from './mock/gamificationService';
import { initializeStorage } from './mock/storage';

export * from './interfaces';

// Export mock services as active services
export const authService = mockAuthService;
export const userService = mockUserService;
export const attendanceService = mockAttendanceService;
export const holidayService = mockHolidayService;
export const projectService = mockProjectService;
export const taskService = mockTaskService;
export const chatService = mockChatService;
export const gamificationService = mockGamificationService;

export function resetDemoData() {
  initializeStorage(true);
}
