import type { IProjectService } from '../interfaces';
import type { Project, User } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';
import { mockNotificationService } from './notificationService';

export class MockProjectService implements IProjectService {
  async getProjects(company?: string, userId?: string): Promise<Project[]> {
    await delay(50);
    let list = getStoredData<Project[]>(KEYS.PROJECTS);
    if (company && company !== 'both') {
      list = list.filter(p => p.company === company || p.company === 'both');
    }
    if (userId) {
      list = list.filter(p => (p.memberIds && p.memberIds.includes(userId)) || p.assignedUserIds.includes(userId));
    }
    return list;
  }

  async getProjectById(id: string): Promise<Project | null> {
    await delay(50);
    const list = getStoredData<Project[]>(KEYS.PROJECTS);
    return list.find(p => p.id === id) || null;
  }

  async createProject(data: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
    await delay(100);
    const list = getStoredData<Project[]>(KEYS.PROJECTS);
    const newProject: Project = {
      ...data,
      id: generateId('prj'),
      createdAt: new Date().toISOString()
    };
    list.push(newProject);
    setStoredData(KEYS.PROJECTS, list);

    // Notify the employees who were added as members.
    const memberIds = Array.from(
      new Set([...(newProject.memberIds || []), ...(newProject.assignedUserIds || [])])
    );
    const users = getStoredData<User[]>(KEYS.USERS);
    for (const memberId of memberIds) {
      const member = users.find((u) => u.id === memberId);
      if (!member || member.role !== 'employee' || !member.active) continue;
      mockNotificationService
        .addNotification(memberId, {
          type: 'project_added',
          title: 'Added to a project',
          message: `You were added to project: ${newProject.name}`,
          link: `/app/projects/${newProject.id}`
        })
        .catch(console.error);
    }

    return newProject;
  }

  async updateProject(id: string, updates: Partial<Project>): Promise<Project> {
    await delay(100);
    const list = getStoredData<Project[]>(KEYS.PROJECTS);
    const index = list.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Project not found');

    const updated: Project = {
      ...list[index],
      ...updates
    };
    list[index] = updated;
    setStoredData(KEYS.PROJECTS, list);
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    await delay(100);
    let list = getStoredData<Project[]>(KEYS.PROJECTS);
    list = list.filter(p => p.id !== id);
    setStoredData(KEYS.PROJECTS, list);
  }

  async closeProject(id: string): Promise<Project> {
    await delay(100);
    return this.updateProject(id, { status: 'completed' });
  }
}

export const mockProjectService = new MockProjectService();
