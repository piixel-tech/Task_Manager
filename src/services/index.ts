import { httpAuthService } from './http/authService';
import { httpUserService } from './http/userService';
import { mockHolidayService } from './mock/holidayService';
import { httpProjectService } from './http/projectService';
import { httpTaskService } from './http/taskService';
import { mockNotificationService } from './mock/notificationService';
import { gamificationService as mockGamificationService } from './mock/gamificationService';
import { initializeStorage } from './mock/storage';

import type { ITaskService } from './interfaces';
export * from './interfaces';

// Auth is real (FastAPI); the remaining services are still mocks
export const authService = httpAuthService;
export const userService = httpUserService;
export const holidayService = mockHolidayService;
export const projectService = httpProjectService;
export const taskService: ITaskService = httpTaskService;
export const notificationService = mockNotificationService;
export const gamificationService = mockGamificationService;

export function resetDemoData() {
  initializeStorage(true);
}
