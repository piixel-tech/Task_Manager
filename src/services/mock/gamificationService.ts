import type { IGamificationService } from '../interfaces';
import type {
  UserGamification,
  Badge,
  BadgeType,
  Kudos,
  DailyUpdate,
  TaskPauseReason,
  WeeklyReport,
  Task
} from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { getTodayDateString } from '../../utils/time';

const BADGE_TITLES: Record<BadgeType, { title: string; description: string }> = {
  fastest_delivery: {
    title: 'Fastest Delivery 🚀',
    description: 'Delivered a critical task significantly ahead of deadline'
  },
  client_favourite: {
    title: 'Client Favourite ⭐',
    description: 'Awarded by management for exceptional client communication'
  },
  helped_teammate: {
    title: 'Helped a Teammate 🤝',
    description: 'Stepped in and completed a task assigned by a peer'
  },
  zero_revisions: {
    title: 'Zero Revisions ✨',
    description: 'Completed work with perfect quality on first submission'
  }
};

export class MockGamificationService implements IGamificationService {
  private getLevel(points: number): 'Rookie' | 'Pro' | 'Legend' {
    if (points >= 200) return 'Legend';
    if (points >= 50) return 'Pro';
    return 'Rookie';
  }

  async getUserGamification(userId: string): Promise<UserGamification> {
    await delay();
    const all = getStoredData<Record<string, UserGamification>>(KEYS.GAMIFICATION) || {};
    const allKudos = getStoredData<Kudos[]>(KEYS.KUDOS) || [];
    const kudosCount = allKudos.filter((k) => k.toUserId === userId).length;

    if (!all[userId]) {
      const initialStats: UserGamification = {
        userId,
        points: 25,
        streak: 4,
        level: 'Rookie',
        badges: [
          {
            id: 'bdg_initial_1',
            userId,
            badgeType: 'zero_revisions',
            title: BADGE_TITLES.zero_revisions.title,
            description: BADGE_TITLES.zero_revisions.description,
            awardedAt: getTodayDateString()
          }
        ],
        kudosCount
      };
      all[userId] = initialStats;
      setStoredData(KEYS.GAMIFICATION, all);
      return initialStats;
    }

    const stats = all[userId];
    stats.level = this.getLevel(stats.points);
    stats.kudosCount = kudosCount;
    return stats;
  }

  async addPoints(userId: string, points: number): Promise<UserGamification> {
    await delay();
    const all = getStoredData<Record<string, UserGamification>>(KEYS.GAMIFICATION) || {};
    const stats = all[userId] || (await this.getUserGamification(userId));
    stats.points += points;
    stats.level = this.getLevel(stats.points);
    all[userId] = stats;
    setStoredData(KEYS.GAMIFICATION, all);
    return stats;
  }

  async awardBadge(userId: string, badgeType: BadgeType, awardedBy?: string, note?: string): Promise<Badge> {
    await delay();
    const all = getStoredData<Record<string, UserGamification>>(KEYS.GAMIFICATION) || {};
    const stats = all[userId] || (await this.getUserGamification(userId));

    const newBadge: Badge = {
      id: `bdg_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      userId,
      badgeType,
      title: BADGE_TITLES[badgeType].title,
      description: BADGE_TITLES[badgeType].description,
      awardedAt: getTodayDateString(),
      awardedBy,
      note
    };

    stats.badges.push(newBadge);
    all[userId] = stats;
    setStoredData(KEYS.GAMIFICATION, all);
    return newBadge;
  }

  async giveKudos(taskId: string, fromUserId: string, toUserId: string): Promise<Kudos> {
    await delay();
    const allKudos = getStoredData<Kudos[]>(KEYS.KUDOS) || [];
    const existing = allKudos.find((k) => k.taskId === taskId && k.fromUserId === fromUserId);
    if (existing) {
      return existing;
    }

    const kudos: Kudos = {
      id: `kudos_${Date.now()}`,
      taskId,
      fromUserId,
      toUserId,
      createdAt: new Date().toISOString()
    };

    allKudos.push(kudos);
    setStoredData(KEYS.KUDOS, allKudos);

    // Give 2 bonus points for receiving kudos
    await this.addPoints(toUserId, 2);

    return kudos;
  }

  async getKudosForUser(userId: string): Promise<Kudos[]> {
    await delay();
    const allKudos = getStoredData<Kudos[]>(KEYS.KUDOS) || [];
    return allKudos.filter((k) => k.toUserId === userId);
  }

  async getKudosForTask(taskId: string): Promise<Kudos[]> {
    await delay();
    const allKudos = getStoredData<Kudos[]>(KEYS.KUDOS) || [];
    return allKudos.filter((k) => k.taskId === taskId);
  }

  async saveDailyUpdate(userId: string, summary: string): Promise<DailyUpdate> {
    await delay();
    const allUpdates = getStoredData<DailyUpdate[]>(KEYS.DAILY_UPDATES) || [];
    const today = getTodayDateString();

    const existingIndex = allUpdates.findIndex((u) => u.userId === userId && u.date === today);

    const updateRecord: DailyUpdate = {
      id: existingIndex >= 0 ? allUpdates[existingIndex].id : `upd_${Date.now()}`,
      userId,
      date: today,
      summary,
      createdAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
      allUpdates[existingIndex] = updateRecord;
    } else {
      allUpdates.push(updateRecord);
    }

    setStoredData(KEYS.DAILY_UPDATES, allUpdates);
    return updateRecord;
  }

  async getDailyUpdates(date?: string): Promise<DailyUpdate[]> {
    await delay();
    const allUpdates = getStoredData<DailyUpdate[]>(KEYS.DAILY_UPDATES) || [];
    const filterDate = date || getTodayDateString();
    return allUpdates.filter((u) => u.date === filterDate);
  }

  async logTaskPauseReason(taskId: string, userId: string, reason: string, note?: string): Promise<TaskPauseReason> {
    await delay();
    const allReasons = getStoredData<TaskPauseReason[]>(KEYS.PAUSE_REASONS) || [];
    const record: TaskPauseReason = {
      id: `pause_${Date.now()}`,
      taskId,
      userId,
      reason,
      note,
      timestamp: new Date().toISOString()
    };
    allReasons.push(record);
    setStoredData(KEYS.PAUSE_REASONS, allReasons);

    // Also sync into task object
    const tasks = getStoredData<Task[]>(KEYS.TASKS) || [];
    const taskIndex = tasks.findIndex((t) => t.id === taskId);
    if (taskIndex >= 0) {
      if (!tasks[taskIndex].pauseReasons) tasks[taskIndex].pauseReasons = [];
      tasks[taskIndex].pauseReasons!.push(record);
      setStoredData(KEYS.TASKS, tasks);
    }

    return record;
  }

  async getTaskPauseReasons(taskId: string): Promise<TaskPauseReason[]> {
    await delay();
    const allReasons = getStoredData<TaskPauseReason[]>(KEYS.PAUSE_REASONS) || [];
    return allReasons.filter((r) => r.taskId === taskId);
  }

  async getTeamMonthlyGoal(): Promise<{ finished: number; goal: number }> {
    await delay();
    const goalData = getStoredData<{ goal: number }>(KEYS.TEAM_GOAL) || { goal: 40 };
    const tasks = getStoredData<Task[]>(KEYS.TASKS) || [];
    const finishedCount = tasks.filter((t) => t.status === 'completed').length;
    return { finished: finishedCount, goal: goalData.goal };
  }

  async setTeamMonthlyGoal(goal: number): Promise<{ finished: number; goal: number }> {
    await delay();
    setStoredData(KEYS.TEAM_GOAL, { goal });
    return this.getTeamMonthlyGoal();
  }

  async generateWeeklyReport(projectId: string, startDate: string, endDate: string): Promise<WeeklyReport> {
    await delay();
    const tasks = getStoredData<Task[]>(KEYS.TASKS) || [];
    const projectTasks = tasks.filter((t) => t.projectId === projectId);

    const completed = projectTasks.filter((t) => t.status === 'completed');
    const pending = projectTasks.filter((t) => t.status !== 'completed');

    const totalHours = projectTasks.reduce((acc, t) => acc + (t.loggedHours || 0), 0);
    const totalRevisions = projectTasks.reduce((acc, t) => acc + (t.revisions || 0), 0);

    const completedList = completed.map((t) => ({
      id: t.id,
      title: t.title,
      hours: t.loggedHours || 0,
      assignedUserId: t.assignedUserId
    }));

    const nextStepsList = pending.map((t) => ({
      id: t.id,
      title: t.title,
      assignedUserId: t.assignedUserId,
      dueDate: t.dueDate
    }));

    const markdown = `📊 **Weekly Project Status Report** (${startDate} to ${endDate})

✅ **Completed Tasks (${completed.length}):**
${completed.length === 0 ? '- None' : completed.map((t) => `- **${t.title}** (${(t.loggedHours || 0).toFixed(1)} hrs)`).join('\n')}

⏱️ **Total Logged Hours:** ${totalHours.toFixed(1)} hrs
🔄 **Total Revisions:** ${totalRevisions}

📌 **Next Steps & Ongoing (${pending.length}):**
${pending.length === 0 ? '- All tasks completed!' : pending.map((t) => `- **${t.title}** (Due: ${t.dueDate || 'TBD'})`).join('\n')}
`;

    return {
      projectId,
      startDate,
      endDate,
      completedTasksCount: completed.length,
      totalHoursLogged: totalHours,
      revisionsCount: totalRevisions,
      completedTasks: completedList,
      nextSteps: nextStepsList,
      summaryMarkdown: markdown
    };
  }
}

export const gamificationService = new MockGamificationService();
