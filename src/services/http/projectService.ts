import type { IProjectService } from '../interfaces';
import type { Project } from '../../types';
import { fetchCompanies } from './mappers';
import { projectApi, type Project as ApiProject } from './projectApi';

const moved = () => {
  throw new Error('Projects are managed on the Projects page.');
};

/**
 * Read-only adapter that feeds real projects to older screens (task pages, chat,
 * dashboards) in the legacy `Project` shape. Create / edit / delete go through
 * `projectApi` on the Projects pages.
 */
export class HttpProjectService implements IProjectService {
  private async toLegacy(list: ApiProject[]): Promise<Project[]> {
    const companies = await fetchCompanies();
    return list.map((p) => {
      const name = companies.find((c) => c.id === p.company_id)?.name.toLowerCase();
      return {
        id: p.id,
        name: p.name,
        description: '',
        company: name === 'unwork' ? 'unwork' : 'piixel',
        status: 'active',
        assignedUserIds: [],
        memberIds: [],
        createdAt: p.created_at
      };
    });
  }

  async getProjects(company?: string): Promise<Project[]> {
    const all = await this.toLegacy(await projectApi.list());
    return company && company !== 'both' ? all.filter((p) => p.company === company) : all;
  }

  async getProjectById(id: string): Promise<Project | null> {
    const all = await this.getProjects();
    return all.find((p) => p.id === id) ?? null;
  }

  async createProject(): Promise<Project> {
    return moved();
  }
  async updateProject(): Promise<Project> {
    return moved();
  }
  async deleteProject(): Promise<void> {
    return moved();
  }
  async closeProject(): Promise<Project> {
    return moved();
  }
}

export const httpProjectService = new HttpProjectService();
