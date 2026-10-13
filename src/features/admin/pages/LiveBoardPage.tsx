import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { userService, attendanceService } from '../../../services';
import type { User, AttendanceDay, LiveEmployeeStatus } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { UserName } from '../../../components/ui/UserName';
import { Button } from '../../../components/ui/Button';
import { getTodayDateString, formatTime, calculateDurationMinutes, getNowISO } from '../../../utils/time';
import { formatHours } from '../../../utils/format';

export const LiveBoardPage: React.FC = () => {
  const { companyFilter } = useAppStore();
  const [employees, setEmployees] = useState<User[]>([]);
  const [attendance, setAttendance] = useState<AttendanceDay[]>([]);
  const [nowISO, setNowISO] = useState(getNowISO());

  const fetchData = async () => {
    const todayStr = getTodayDateString();
    const [uList, attList] = await Promise.all([
      userService.getUsers(),
      attendanceService.getAttendance(undefined, todayStr)
    ]);
    setEmployees(uList.filter((u) => u.role !== 'admin' && u.active));
    setAttendance(attList);
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      setNowISO(getNowISO());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const filteredEmployees = employees.filter((emp, idx, arr) => {
    if (!emp.active) return false;
    if (arr.findIndex((e) => e.id === emp.id) !== idx) return false;
    if (companyFilter === 'all') return true;
    return emp.company === companyFilter;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-[var(--tm-primary)] animate-pulse" />
            <h1 className="text-[27px] font-extrabold leading-tight tracking-[-0.03em] text-[var(--tm-ink)]">
              Live Team Attendance Board
            </h1>
          </div>
          <p className="text-[14px] leading-relaxed text-[var(--tm-ink-muted)] mt-1.5">
            Real-time status monitor across Piixel and Unwork employees.
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchData}
          leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
        >
          Refresh Board
        </Button>
      </div>

      {filteredEmployees.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-sm text-[var(--tm-ink-muted)]">
            No employees on the live board. Add team members in Team Directory.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEmployees.map((emp) => {
            const empAttendance = attendance.find((a) => a.userId === emp.id);

            let status: LiveEmployeeStatus = 'Not marked';
            let punchInTime: string | undefined = undefined;

            if (empAttendance) {
              if (empAttendance.status === 'on_leave') {
                status = 'On leave';
              } else if (empAttendance.punchSessions.length > 0) {
                punchInTime = empAttendance.punchSessions[0].punchIn;
                const activeSession = empAttendance.punchSessions.find((s) => !s.punchOut);
                if (activeSession) {
                  const activeBreak = activeSession.breaks.find((b) => !b.breakEnd);
                  if (activeBreak) {
                    status = 'On break';
                  } else {
                    status = 'Working';
                  }
                } else if (empAttendance.dayEndedAt) {
                  status = 'Done for the day';
                } else {
                  status = 'Punched out';
                }
              } else if (empAttendance.status === 'present') {
                status = 'Not marked';
              }
            }

            let workedMins = 0;
            if (empAttendance) {
              for (const s of empAttendance.punchSessions) {
                if (s.punchIn) {
                  const sessMins = calculateDurationMinutes(s.punchIn, s.punchOut || nowISO);
                  let breakMins = 0;
                  for (const b of s.breaks) {
                    if (b.breakStart) {
                      breakMins += calculateDurationMinutes(b.breakStart, b.breakEnd || (s.punchOut ? s.punchOut : nowISO));
                    }
                  }
                  workedMins += Math.max(0, sessMins - breakMins);
                }
              }
            }
            const hoursWorked = workedMins / 60;

            const badgeVariants: Record<LiveEmployeeStatus, 'success' | 'warning' | 'primary' | 'danger' | 'default'> = {
              Working: 'success',
              'Done for the day': 'default',
              'On break': 'warning',
              'Punched out': 'primary',
              'On leave': 'danger',
              'Not marked': 'default'
            };

            return (
              <Card key={emp.id} className="hover:border-[var(--tm-primary-soft)] transition-all">
                <CardContent className="p-5 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <UserName user={emp} size="md" showBadge={true} />
                    <Badge variant={badgeVariants[status]} size="sm">
                      {status === 'Working' && <span className="w-1.5 h-1.5 rounded-full bg-[var(--tm-success)] animate-ping mr-1" />}
                      {status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[var(--tm-border)] text-xs">
                    <div className="bg-[var(--tm-card-muted)] p-2.5 rounded-lg border border-[var(--tm-border)]">
                      <div className="text-[10px] text-[var(--tm-ink-muted)] font-semibold uppercase">Punch In</div>
                      <div className="font-bold text-[var(--tm-ink)] mt-0.5">
                        {formatTime(punchInTime)}
                      </div>
                    </div>

                    <div className="bg-[var(--tm-primary-softer)] p-2.5 rounded-lg border border-[var(--tm-primary-soft)]">
                      <div className="text-[10px] text-[var(--tm-primary)] font-semibold uppercase">Hours Today</div>
                      <div className="font-bold text-[var(--tm-primary)] mt-0.5">
                        {formatHours(hoursWorked)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
