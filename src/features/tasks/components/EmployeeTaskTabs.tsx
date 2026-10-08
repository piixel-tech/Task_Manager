import React, { useEffect, useState } from 'react';
import { taskService, projectService } from '../../../services';
import type { Task, Project } from '../../../types';
import { Badge } from '../../../components/ui/Badge';
import { Tabs } from '../../../components/ui/Tabs';
import { formatHours } from '../../../utils/format';
import { formatDate, getTodayDateString } from '../../../utils/time';

interface EmployeeTaskTabsProps {
  userId: string;
}

export const EmployeeTaskTabs: React.FC<EmployeeTaskTabsProps> = ({ userId }) => {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'ongoing' | 'upcoming' | 'completed' | 'overdue'>('ongoing');

  useEffect(() => {
    Promise.all([
      taskService.getTasks(undefined, userId),
      projectService.getProjects()
    ]).then(([tskList, prjList]) => {
      setTasks(tskList);
      setProjects(prjList);
    });
  }, [userId]);

  const todayStr = getTodayDateString();
  const projectMap = new Map(projects.map((p) => [p.id, p]));

  const ongoing = tasks.filter(t => 
    t.status === 'in_progress' || t.status === 'review' || (t.status === 'todo' && t.sessions.length > 0)
  );

  const upcoming = tasks.filter(t => 
    t.status === 'todo' && t.sessions.length === 0 && (!t.dueDate || t.dueDate >= todayStr)
  ).sort((a, b) => {
    const priorityWeight = { high: 3, urgent: 3, medium: 2, low: 1 };
    const pDiff = (priorityWeight[b.priority] || 0) - (priorityWeight[a.priority] || 0);
    if (pDiff !== 0) return pDiff;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const completed = tasks.filter(t => t.status === 'completed');

  const overdue = tasks.filter(t => 
    t.status !== 'completed' && t.dueDate && t.dueDate < todayStr
  );

  const currentTabTasks = 
    activeTab === 'ongoing' ? ongoing :
    activeTab === 'upcoming' ? upcoming :
    activeTab === 'completed' ? completed : overdue;

  return (
    <div className="space-y-4 pt-2">
      <div className="text-xs font-bold text-[var(--tm-ink-soft)] uppercase tracking-wider">
        Employee Tasks Breakdown
      </div>

      <Tabs
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as any)}
        tabs={[
          { id: 'ongoing', label: 'Ongoing', count: ongoing.length },
          { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { id: 'completed', label: 'Completed', count: completed.length },
          { id: 'overdue', label: 'Overdue', count: overdue.length }
        ]}
      />

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {currentTabTasks.length === 0 ? (
          <div className="text-xs text-[var(--tm-ink-muted)] text-center py-6 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)]">
            No tasks found in {activeTab} for this employee.
          </div>
        ) : (
          currentTabTasks.map(t => {
            const prj = projectMap.get(t.projectId);
            return (
              <div key={t.id} className="p-3 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)] flex items-center justify-between text-xs gap-3">
                <div className="space-y-1 overflow-hidden">
                  <div className="flex items-center gap-2">
                    {prj && (
                      <Badge variant={prj.company === 'piixel' ? 'piixel' : 'unwork'} size="sm">
                        {prj.name}
                      </Badge>
                    )}
                    <Badge variant={t.priority === 'high' ? 'danger' : 'default'} size="sm">
                      {t.priority.toUpperCase()}
                    </Badge>
                  </div>
                  <div className="font-bold text-[var(--tm-ink)] truncate">{t.title}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[var(--tm-primary)]">{formatHours(t.loggedHours || 0)}</div>
                  {t.dueDate && (
                    <div className="text-[10px] text-[var(--tm-ink-muted)]">Due: {formatDate(t.dueDate)}</div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
