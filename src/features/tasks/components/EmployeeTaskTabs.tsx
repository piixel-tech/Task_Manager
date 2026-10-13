import React, { useEffect, useState, useMemo } from 'react';
import { ChevronDown, ChevronRight, Flag } from 'lucide-react';
import { projectService } from '../../../services';
import type { Project, Task } from '../../../types';
import { Badge } from '../../../components/ui/Badge';
import { Tabs } from '../../../components/ui/Tabs';
import { formatHours } from '../../../utils/format';
import { formatDate, getTodayDateString } from '../../../utils/time';
import { useTaskStore } from '../../../store/useTaskStore';

interface EmployeeTaskTabsProps {
  userId: string;
}

export const EmployeeTaskTabs: React.FC<EmployeeTaskTabsProps> = ({ userId }) => {
  const storeTasks = useTaskStore((state) => state.tasks);
  const fetchStoreTasks = useTaskStore((state) => state.fetchTasks);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeTab, setActiveTab] = useState<'ongoing' | 'upcoming' | 'completed' | 'overdue'>('ongoing');

  // Track collapsed state for day groups in completed tab
  const [openDaysMap, setOpenDaysMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([
      fetchStoreTasks(),
      projectService.getProjects()
    ]).then(([, prjList]) => {
      setProjects(prjList);
    });
  }, [userId]);

  const tasks = storeTasks.filter((t) => t.assignedUserId === userId);

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

  // Group completed tasks by completion date (newest first)
  const completedDayGroups = useMemo(() => {
    const groupsMap: Record<string, Task[]> = {};
    completed.forEach((t) => {
      const dateKey = (t.completedAt || t.dueDate || todayStr).slice(0, 10);
      if (!groupsMap[dateKey]) groupsMap[dateKey] = [];
      groupsMap[dateKey].push(t);
    });

    const sortedDates = Object.keys(groupsMap).sort((a, b) => b.localeCompare(a));
    return sortedDates.map((dateKey) => {
      const dayLabel = formatDate(dateKey, 'EEEE, dd MMM yyyy');
      const count = groupsMap[dateKey].length;
      return {
        dateKey,
        dayLabel: `${dayLabel} · ${count} ${count === 1 ? 'task' : 'tasks'}`,
        tasks: groupsMap[dateKey]
      };
    });
  }, [completed, todayStr]);

  const toggleDayOpen = (dateKey: string) => {
    setOpenDaysMap((prev) => ({ ...prev, [dateKey]: prev[dateKey] === false }));
  };

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

      <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
        {activeTab === 'completed' ? (
          completedDayGroups.length === 0 ? (
            <div className="text-xs text-[var(--tm-ink-muted)] text-center py-6 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)]">
              No completed tasks found for this employee.
            </div>
          ) : (
            completedDayGroups.map((group) => {
              const isOpen = openDaysMap[group.dateKey] !== false; // open by default
              return (
                <div key={group.dateKey} className="rounded-xl border border-[var(--tm-border)] overflow-hidden bg-[var(--tm-card-muted)]">
                  {/* Collapsible Day Sub-Heading */}
                  <button
                    type="button"
                    onClick={() => toggleDayOpen(group.dateKey)}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-extrabold text-[var(--tm-ink)] bg-[var(--tm-bg-sunken)] hover:bg-[var(--tm-border-strong)]/20 transition-colors"
                  >
                    <span>{group.dayLabel}</span>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-[var(--tm-ink-muted)]" /> : <ChevronRight className="w-4 h-4 text-[var(--tm-ink-muted)]" />}
                  </button>

                  {isOpen && (
                    <div className="p-2 space-y-2 divide-y divide-[var(--tm-border)]">
                      {group.tasks.map((t) => {
                        const prj = projectMap.get(t.projectId);
                        return (
                          <div key={t.id} className="pt-2 first:pt-0 flex items-center justify-between text-xs gap-3">
                            <div className="space-y-1 overflow-hidden">
                              <div className="flex items-center gap-2">
                                {prj && (
                                  <Badge variant={prj.company === 'piixel' ? 'piixel' : 'unwork'} size="sm">
                                    {prj.name}
                                  </Badge>
                                )}
                                <span title={`${t.priority.toUpperCase()} priority`}>
                                  <Flag
                                    className={`w-3.5 h-3.5 shrink-0 ${
                                      t.priority === 'high' || t.priority === 'urgent'
                                        ? 'text-red-500 fill-red-500/20'
                                        : t.priority === 'medium'
                                        ? 'text-amber-500 fill-amber-500/20'
                                        : 'text-gray-400 fill-gray-400/20'
                                    }`}
                                  />
                                </span>
                              </div>
                              <div className="font-bold text-[var(--tm-ink)] truncate">{t.title}</div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-bold text-[var(--tm-primary)]">{formatHours(t.loggedHours || 0)}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )
        ) : currentTabTasks.length === 0 ? (
          <div className="text-xs text-[var(--tm-ink-muted)] text-center py-6 bg-[var(--tm-card-muted)] rounded-xl border border-[var(--tm-border)]">
            No tasks found in {activeTab} for this employee.
          </div>
        ) : (
          currentTabTasks.map((t) => {
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
                    <span title={`${t.priority.toUpperCase()} priority`}>
                      <Flag
                        className={`w-3.5 h-3.5 shrink-0 ${
                          t.priority === 'high' || t.priority === 'urgent'
                            ? 'text-red-500 fill-red-500/20'
                            : t.priority === 'medium'
                            ? 'text-amber-500 fill-amber-500/20'
                            : 'text-gray-400 fill-gray-400/20'
                        }`}
                      />
                    </span>
                  </div>
                  <div className="font-bold text-[var(--tm-ink)] truncate">{t.title}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-[var(--tm-primary)]">{formatHours(t.loggedHours || 0)}</div>
                  {t.dueDate ? (
                    <div className="text-[10px] text-[var(--tm-ink-muted)]">Due: {formatDate(t.dueDate)}</div>
                  ) : (
                    <div className="text-[10px] text-[var(--tm-ink-muted)]">No due date</div>
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
