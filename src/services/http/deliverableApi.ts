import { api, getErrorMessage } from '../api';
import type { UserBrief } from './projectApi';

/** A stage's key. Each subfolder has its own list of stages (`Deliverables.stages`, with names in `stage_labels`) that heads can edit. */
export type Stage = string;

/** One stage in a list sent to the server: a `key` keeps an existing stage (rename or move), no key adds a new one. */
export interface StageInput {
  key?: string;
  label: string;
}

export interface DeliverableItem {
  id: string;
  type: string;
  number: number;
  title: string;
  stage: Stage;
  updated_by: UserBrief | null;
  updated_at: string;
}

export interface TypeSummary {
  type: string;
  total: number;
  by_stage: Record<Stage, number>;
  /** Items that reached the last stage (posted). */
  done: number;
  remaining: number;
  /** 0-100: average position of the items along the stages. */
  progress: number;
}

export interface Deliverables {
  subfolder_id: string;
  month: string;
  /** Keys, in order; the last is the finish line. */
  stages: Stage[];
  /** key -> the name people read. */
  stage_labels: Record<Stage, string>;
  total: number;
  done: number;
  remaining: number;
  progress: number;
  by_stage: Record<Stage, number>;
  types: TypeSummary[];
  items: DeliverableItem[];
  can_set_counts: boolean;
  can_set_stage: boolean;
}

async function call<T>(fn: () => Promise<{ data: T }>, fallback: string): Promise<T> {
  try {
    return (await fn()).data;
  } catch (err) {
    throw new Error(getErrorMessage(err, fallback));
  }
}

/** This month as YYYY-MM, in the browser's local time. */
export const currentMonth = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export const deliverableApi = {
  get: (subfolderId: string, month: string) =>
    call<Deliverables>(() => api.get(`/subfolders/${subfolderId}/deliverables`, { params: { month } }), 'Could not load deliverables'),
  setCounts: (subfolderId: string, month: string, counts: Record<string, number>) =>
    call<Deliverables>(() => api.put(`/subfolders/${subfolderId}/deliverables/${month}`, { counts }), 'Could not save the counts'),
  setStage: (subfolderId: string, month: string, itemId: string, stage: Stage) =>
    call<Deliverables>(
      () => api.patch(`/subfolders/${subfolderId}/deliverables/${month}/items/${itemId}`, { stage }),
      'Could not change the stage'
    ),
  addItems: (subfolderId: string, month: string, type: string, count: number) =>
    call<Deliverables>(() => api.post(`/subfolders/${subfolderId}/deliverables/${month}/items`, { type, count }), 'Could not add the items'),
  removeItem: (subfolderId: string, month: string, itemId: string) =>
    call<Deliverables>(() => api.delete(`/subfolders/${subfolderId}/deliverables/${month}/items/${itemId}`), 'Could not delete the item'),
  /** Heads and admins: the whole list of stages, in order. Stages left out are deleted; their items move to the stage before when `moveItems`. */
  setStages: (subfolderId: string, month: string, stages: StageInput[], moveItems: boolean) =>
    call<Deliverables>(
      () => api.put(`/subfolders/${subfolderId}/deliverables/stages`, { stages, move_items: moveItems }, { params: { month } }),
      'Could not save the stages'
    ),
  /** How many deliverables sit on each stage key, over all months. */
  stagesUsage: (subfolderId: string) =>
    call<{ counts: Record<Stage, number> }>(() => api.get(`/subfolders/${subfolderId}/deliverables/stages/usage`), 'Could not check the stages').then(
      (r) => r.counts
    ),
  removeType: (subfolderId: string, month: string, type: string) =>
    call<Deliverables>(
      () => api.delete(`/subfolders/${subfolderId}/deliverables/${month}/types`, { params: { type } }),
      'Could not remove the type'
    )
};
