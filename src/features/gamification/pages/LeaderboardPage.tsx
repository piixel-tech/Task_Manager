import React, { useEffect, useState } from 'react';
import { PageHeader } from '../../../components/ui/PageHeader';
import { userService, taskService } from '../../../services';
import type { User, Task } from '../../../types';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';

import { TeamMonthlyGoalBar } from '../components/TeamMonthlyGoalBar';
import { BadgesGrid } from '../components/BadgesGrid';

export const LeaderboardPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    Promise.all([userService.getUsers(), taskService.getTasks()]).then(([uList, tList]) => {
      setUsers(uList.filter((u) => u.role !== 'admin'));
      setTasks(tList);
    });
  }, []);

  const leaderboard = users
    .map((user) => {
      const userTasks = tasks.filter((t) => t.assignedUserId === user.id);
      const completed = userTasks.filter((t) => t.status === 'completed');
      const hoursLogged = userTasks.reduce((acc, t) => acc + (t.loggedHours || 0), 0);
      const points = completed.length * 100 + Math.round(hoursLogged * 10);
      return {
        user,
        completedCount: completed.length,
        hoursLogged,
        points
      };
    })
    .sort((a, b) => b.points - a.points);

  return (
    <div className="space-y-6">
      <TeamMonthlyGoalBar />

      <PageHeader
        title="Team Productivity Leaderboard"
        description="Gamified task achievement points, output milestones, and streaks for Piixel & Unwork."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        {leaderboard.slice(0, 3).map((item, idx) => {
          const ranks = ['🥇 1st Place', '🥈 2nd Place', '🥉 3rd Place'];
          const borders = [
            'border-[var(--tm-warning-ring)] bg-gradient-to-br from-[var(--tm-warning-bg)] to-[var(--tm-card)] shadow-soft-sm',
            'border-[var(--tm-border-strong)] bg-gradient-to-br from-[var(--tm-card-muted)] to-[var(--tm-card)]',
            'border-[var(--tm-warning-ring)] bg-gradient-to-br from-[var(--tm-warning-bg)] to-[var(--tm-card)]'
          ];

          return (
            <Card key={item.user.id} className={borders[idx]}>
              <CardContent className="p-6 text-center space-y-3">
                <div className="text-xs font-extrabold uppercase tracking-wider text-[var(--tm-warning)]">
                  {ranks[idx]}
                </div>
                <div className="flex justify-center">
                  <UserName user={item.user} size="lg" showBadge={true} />
                </div>
                <div className="text-3xl font-black text-[var(--tm-ink)] mt-2">
                  {item.points}{' '}
                  <span className="text-xs font-semibold text-[var(--tm-ink-muted)]">PTS</span>
                </div>
                <div className="flex justify-center gap-2 text-xs text-[var(--tm-ink-soft)]">
                  <Badge variant="success">{item.completedCount} Tasks Done</Badge>
                  <Badge variant="primary">{item.hoursLogged}h Logged</Badge>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Complete Rankings</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--tm-card-muted)] border-b border-[var(--tm-border)] text-xs font-semibold text-[var(--tm-ink-muted)] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Rank</th>
                  <th className="px-6 py-3">Team Member</th>
                  <th className="px-6 py-3">Completed Tasks</th>
                  <th className="px-6 py-3">Logged Hours</th>
                  <th className="px-6 py-3 text-right">Total Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--tm-border)]">
                {leaderboard.map((item, index) => (
                  <tr key={item.user.id} className="hover:bg-[var(--tm-card-muted)] transition-colors">
                    <td className="px-6 py-4 font-bold text-[var(--tm-ink-muted)]">#{index + 1}</td>
                    <td className="px-6 py-4">
                      <UserName user={item.user} size="sm" showBadge={true} />
                    </td>
                    <td className="px-6 py-4 font-semibold text-[var(--tm-ink-soft)]">
                      {item.completedCount}
                    </td>
                    <td className="px-6 py-4 text-[var(--tm-ink-soft)]">{item.hoursLogged} hours</td>
                    <td className="px-6 py-4 text-right font-black text-[var(--tm-primary-dark)] text-base">
                      {item.points} pts
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <BadgesGrid />
    </div>
  );
};
