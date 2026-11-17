import { projectApi, type DeleteSummary } from '../../services/http/projectApi';
import type { ConfirmOptions } from '../../store/useConfirmStore';

type Confirm = (options: ConfirmOptions) => Promise<boolean>;

const n = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** What is inside, one line each. Empty parts are left out. */
export const summaryLines = (s: DeleteSummary): string[] =>
  [
    s.subfolders > 0 && n(s.subfolders, 'subfolder'),
    n(s.tasks, 'task'),
    n(s.files, 'file'),
    s.checklist_items > 0 && n(s.checklist_items, 'essentials item', 'essentials items'),
    s.requirements > 0 && n(s.requirements, 'requirement'),
    s.chats > 0 && `${n(s.chats, 'linked chat')} (they stay, but lose the link)`
  ].filter(Boolean) as string[];

/** Admin-only delete of a project: shows what is inside and asks for its name to be typed. Resolves true once it is deleted. */
export async function confirmDeleteProject(confirm: Confirm, project: { id: string; name: string }): Promise<boolean> {
  const summary = await projectApi.projectDeleteSummary(project.id).catch(() => null);
  return confirm({
    title: `Delete “${project.name}”?`,
    message: 'Everything inside it is deleted for everyone and everyone on it is notified. An admin can restore it from the Trash for 30 days.',
    details: summary ? summaryLines(summary) : undefined,
    requireText: project.name,
    confirmLabel: 'Delete project',
    danger: true,
    action: () => projectApi.remove(project.id),
    successTitle: 'Project deleted'
  });
}

/** Admin-only delete of a subfolder: shows what is inside and asks for its name to be typed. Resolves true once it is deleted. */
export async function confirmDeleteSubfolder(confirm: Confirm, subfolder: { id: string; name: string }): Promise<boolean> {
  const summary = await projectApi.subfolderDeleteSummary(subfolder.id).catch(() => null);
  return confirm({
    title: `Delete “${subfolder.name}”?`,
    message: 'Its tasks, essentials, deliverables and mid-way changes are deleted for everyone and its members are notified. Client requirements and chats stay, but lose the link. An admin can restore it from the Trash for 30 days.',
    details: summary ? summaryLines(summary) : undefined,
    requireText: subfolder.name,
    confirmLabel: 'Delete subfolder',
    danger: true,
    action: () => projectApi.deleteSubfolder(subfolder.id),
    successTitle: 'Subfolder deleted'
  });
}
