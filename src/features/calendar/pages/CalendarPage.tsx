import React, { useEffect, useState, useMemo } from 'react';
import { Plus, ChevronLeft, ChevronRight, Settings, Calendar as CalendarIcon, Clock } from 'lucide-react';
import { holidayService } from '../../../services';
import type { Holiday } from '../../../types';
import { useAuthStore } from '../../../store/authStore';
import { useAppStore } from '../../../store/useAppStore';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { PageHeader } from '../../../components/ui/PageHeader';
import { getMonthInfo, formatDate, formatTime, getTodayDateString, calculateDurationMinutes } from '../../../utils/time';
import { formatHours } from '../../../utils/format';

import { useAttendanceStore, calculateBreakMinutes } from '../../../store/useAttendanceStore';

export const CalendarPage: React.FC = () => {
  const { user } = useAuthStore();
  const { showToast } = useAppStore();
  const isAdmin = user?.role === 'admin';

  const storeHistory = useAttendanceStore((state) => state.history);
  const fetchAttendanceHistory = useAttendanceStore((state) => state.fetchAttendanceHistory);

  const todayStr = getTodayDateString();
  const todayDateObj = new Date();

  const [currentYear, setCurrentYear] = useState(todayDateObj.getFullYear());
  const [currentMonth, setCurrentMonth] = useState(todayDateObj.getMonth()); // 0-indexed

  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [weekOffs, setWeekOffs] = useState<number[]>([0, 6]);

  const [isHolidayModalOpen, setIsHolidayModalOpen] = useState(false);
  const [isWeekOffModalOpen, setIsWeekOffModalOpen] = useState(false);
  const [selectedDayDetail, setSelectedDayDetail] = useState<{ date: string; dayNum: number } | null>(null);

  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'national' | 'company' | 'optional'>('company');

  const fetchData = async () => {
    const [hList, wOffs] = await Promise.all([
      holidayService.getHolidays(),
      holidayService.getWeekOffs()
    ]);
    setHolidays(hList);
    setWeekOffs(wOffs);

    if (user) {
      fetchAttendanceHistory(isAdmin ? undefined : user.id);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user, currentYear, currentMonth]);

  const attendance = storeHistory;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const { totalDays, startDayOfWeek } = getMonthInfo(currentYear, currentMonth);
  const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  let presentCount = 0;
  let leaveCount = 0;
  let holidayCount = 0;

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${currentMonthStr}-${String(d).padStart(2, '0')}`;
    const hol = holidays.find((h) => h.date === dateStr);
    const att = attendance.find((a) => a.date === dateStr);

    if (hol) {
      holidayCount++;
    } else if (att?.status === 'present') {
      presentCount++;
    } else if (att?.status === 'on_leave') {
      leaveCount++;
    }
  }

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;
    try {
      await holidayService.addHoliday({ title, date, type });
      showToast('Holiday added!');
      setIsHolidayModalOpen(false);
      setTitle('');
      setDate('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to add holiday');
    }
  };

  const handleToggleWeekOff = async (dayNum: number) => {
    const updated = weekOffs.includes(dayNum)
      ? weekOffs.filter((d) => d !== dayNum)
      : [...weekOffs, dayNum];
    setWeekOffs(updated);
    await holidayService.setWeekOffs(updated);
    showToast('Updated week-off settings!');
  };

  const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Today stats for right panel
  const todayRecord = useMemo(() => attendance.find((a) => a.date === todayStr), [attendance, todayStr]);

  // Upcoming holidays / events for right panel
  const upcomingHolidays = useMemo(() => {
    return holidays
      .filter((h) => h.date >= todayStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 5);
  }, [holidays, todayStr]);

  return (
    <>
      <PageHeader
        title="Calendar &amp; Schedule"
        description="Month grid with rounded day cells, status chips, and upcoming events."
        actions={
          isAdmin ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsWeekOffModalOpen(true)}
                leftIcon={<Settings className="h-4 w-4" />}
              >
                Set Week-Offs
              </Button>
              <Button
                size="sm"
                onClick={() => setIsHolidayModalOpen(true)}
                leftIcon={<Plus className="h-4 w-4" />}
              >
                Add Holiday
              </Button>
            </div>
          ) : undefined
        }
      />

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[var(--tm-success-bg)] border border-[var(--tm-success-ring)] p-4 rounded-[var(--tm-radius-lg)] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--tm-success)] uppercase tracking-wider block">Present</span>
            <span className="text-2xl font-black text-[var(--tm-success)] mt-1 block">{presentCount}</span>
          </div>
          <StatusChip status="present" size="sm" />
        </div>

        <div className="bg-[var(--tm-warning-bg)] border border-[var(--tm-warning-ring)] p-4 rounded-[var(--tm-radius-lg)] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--tm-warning)] uppercase tracking-wider block">Leave / Holiday</span>
            <span className="text-2xl font-black text-[var(--tm-warning)] mt-1 block">{leaveCount + holidayCount}</span>
          </div>
          <Badge variant="warning" size="sm">Leave / Holiday</Badge>
        </div>

        <div className="bg-[var(--tm-bg-sunken)] border border-[var(--tm-border)] p-4 rounded-[var(--tm-radius-lg)] flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-[var(--tm-ink-soft)] uppercase tracking-wider block">Week-Offs</span>
            <span className="text-2xl font-black text-[var(--tm-ink-soft)] mt-1 block">{weekOffs.length * 4}</span>
          </div>
          <Badge variant="default" size="sm">Week-Off</Badge>
        </div>
      </div>

      {/* Main Grid + Right Panel Layout */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Month Grid (xl:col-span-2) */}
        <Card className="xl:col-span-2">
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="text-lg font-extrabold">
              {monthNames[currentMonth]} {currentYear}
            </CardTitle>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (currentMonth === 0) {
                    setCurrentMonth(11);
                    setCurrentYear((y) => y - 1);
                  } else {
                    setCurrentMonth((m) => m - 1);
                  }
                }}
                className="p-2 rounded-full border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)] transition-colors"
                title="Previous Month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (currentMonth === 11) {
                    setCurrentMonth(0);
                    setCurrentYear((y) => y + 1);
                  } else {
                    setCurrentMonth((m) => m + 1);
                  }
                }}
                className="p-2 rounded-full border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)] transition-colors"
                title="Next Month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[11px] font-extrabold text-[var(--tm-ink-muted)] uppercase tracking-wider">
              {daysOfWeek.map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {Array.from({ length: startDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="h-24 bg-[var(--tm-card-muted)]/50 rounded-2xl border border-transparent" />
              ))}

              {Array.from({ length: totalDays }).map((_, idx) => {
                const dayNum = idx + 1;
                const dateStr = `${currentMonthStr}-${String(dayNum).padStart(2, '0')}`;
                const dateObj = new Date(currentYear, currentMonth, dayNum);
                const dayOfWeek = dateObj.getDay();
                const isWeekOff = weekOffs.includes(dayOfWeek);
                const hol = holidays.find((h) => h.date === dateStr);
                const att = attendance.find((a) => a.date === dateStr);

                const isToday = dateStr === todayStr;

                let statusBg = 'bg-white border-[var(--tm-border)] hover:border-[var(--tm-primary)]';
                let chipLabel = '';
                let chipStyle = '';

                if (hol || att?.status === 'on_leave') {
                  statusBg = 'bg-[var(--tm-warning-bg)] border-[var(--tm-warning-ring)]';
                  chipLabel = hol ? hol.title : 'Leave / Holiday';
                  chipStyle = 'bg-[var(--tm-warning)] text-white font-bold';
                } else if (att?.status === 'present') {
                  statusBg = 'bg-[var(--tm-success-bg)] border-[var(--tm-success-ring)]';
                  chipLabel = 'Present';
                  chipStyle = 'bg-[var(--tm-success)] text-white font-bold';
                } else if (isWeekOff) {
                  statusBg = 'bg-[var(--tm-bg-sunken)] border-[var(--tm-border)] text-[var(--tm-ink-muted)]';
                  chipLabel = 'Week-off';
                  chipStyle = 'bg-[var(--tm-neutral-ring)] text-[var(--tm-ink-soft)] font-semibold';
                }

                return (
                  <div
                    key={dateStr}
                    onClick={() => setSelectedDayDetail({ date: dateStr, dayNum })}
                    className={`h-24 p-2.5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${statusBg} ${
                      isToday ? 'ring-2 ring-[var(--tm-primary)] ring-offset-2 font-black' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-extrabold">
                      <span className={isToday ? 'grid h-6 w-6 place-items-center rounded-full bg-[var(--tm-primary)] text-white' : 'text-[var(--tm-ink)]'}>
                        {dayNum}
                      </span>
                      {att && att.totalHours > 0 && (
                        <span className="text-[10.5px] font-bold text-[var(--tm-primary)]">
                          {att.totalHours}h
                        </span>
                      )}
                    </div>

                    {chipLabel && (
                      <div className={`text-[10px] px-2 py-0.5 rounded-full truncate text-center shadow-2xs ${chipStyle}`}>
                        {chipLabel}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Right Panel: "Today" & "Coming up" */}
        <div className="space-y-6">
          {/* Right Panel Section 1: Today */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-[var(--tm-primary)]" />
                Today
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-4 border border-[var(--tm-border)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-extrabold text-[var(--tm-ink)]">
                    {formatDate(todayStr, 'EEEE, MMM d')}
                  </span>
                  <StatusChip status={todayRecord?.status || 'not_marked'} size="sm" dot />
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--tm-border)]">
                  <div>
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)] block">First In</span>
                    <span className="text-[14px] font-extrabold text-[var(--tm-ink)] block mt-0.5">
                      {formatTime(todayRecord?.punchSessions[0]?.punchIn)}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)] block">Hours Today</span>
                    <span className="text-[14px] font-extrabold text-[var(--tm-primary)] block mt-0.5">
                      {formatHours(todayRecord?.totalHours || 0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Right Panel Section 2: Coming up */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-extrabold flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--tm-primary)]" />
                Coming Up
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3">
              {upcomingHolidays.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--tm-ink-muted)]">
                  No upcoming holidays scheduled.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {upcomingHolidays.map((h) => (
                    <li
                      key={h.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] p-3 border border-[var(--tm-border)]"
                    >
                      <div>
                        <h4 className="text-[13px] font-bold text-[var(--tm-ink)]">{h.title}</h4>
                        <span className="text-[11px] text-[var(--tm-ink-muted)]">
                          {formatDate(h.date, 'EEEE, MMM d')}
                        </span>
                      </div>
                      <Badge variant="primary" size="sm" className="capitalize">
                        {h.type}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Selected Day Detail Modal */}
      {selectedDayDetail && (
        <Modal
          isOpen={!!selectedDayDetail}
          onClose={() => setSelectedDayDetail(null)}
          title={`Details for ${formatDate(selectedDayDetail.date, 'EEEE, MMMM dd, yyyy')}`}
        >
          <div className="space-y-4">
            {(() => {
              const att = attendance.find((a) => a.date === selectedDayDetail.date);
              const firstPunchIn = att?.punchSessions[0]?.punchIn;
              const lastPunchOut = att?.punchSessions.slice().reverse().find((s) => s.punchOut)?.punchOut;

              const breakSessions: { label: string; start: string; end?: string; duration: number }[] = [];
              const totalBreakMinutes = calculateBreakMinutes(att);

              if (att && att.punchSessions) {
                att.punchSessions.forEach((sess, sIdx) => {
                  sess.breaks?.forEach((b, bIdx) => {
                    if (b.breakStart) {
                      const dur = calculateDurationMinutes(b.breakStart, b.breakEnd || getTodayDateString());
                      breakSessions.push({
                        label: `Break #${bIdx + 1}`,
                        start: b.breakStart,
                        end: b.breakEnd,
                        duration: Math.round(dur)
                      });
                    }
                  });

                  if (sess.punchOut && sIdx < att.punchSessions.length - 1) {
                    const nextSess = att.punchSessions[sIdx + 1];
                    if (nextSess?.punchIn) {
                      const gapDur = calculateDurationMinutes(sess.punchOut, nextSess.punchIn);
                      breakSessions.push({
                        label: `Interval Break`,
                        start: sess.punchOut,
                        end: nextSess.punchIn,
                        duration: Math.round(gapDur)
                      });
                    }
                  }
                });
              }

              return (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-4 border border-[var(--tm-border)]">
                    <div>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)] block">Punch-in Time</span>
                      <span className="text-base font-extrabold text-[var(--tm-ink)] block mt-0.5">
                        {formatTime(firstPunchIn)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10.5px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)] block">Punch-out Time</span>
                      <span className="text-base font-extrabold text-[var(--tm-ink)] block mt-0.5">
                        {formatTime(lastPunchOut)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-4 border border-[var(--tm-border)] space-y-3">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--tm-ink-muted)] flex items-center justify-between">
                      <span>Break Time Breakdown</span>
                      <span className="text-[var(--tm-primary)] font-black text-sm">Total: {totalBreakMinutes} min</span>
                    </div>

                    {breakSessions.length === 0 ? (
                      <p className="text-xs text-[var(--tm-ink-muted)] italic">No break sessions taken.</p>
                    ) : (
                      <ul className="space-y-2 text-xs">
                        {breakSessions.map((b, idx) => (
                          <li key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[var(--tm-card)] border border-[var(--tm-border)] font-semibold text-[var(--tm-ink-soft)]">
                            <span>{b.label}: {formatTime(b.start)} – {formatTime(b.end)}</span>
                            <span className="text-[var(--tm-primary)] font-bold">{b.duration} min</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        </Modal>
      )}

      {/* Week-Off Modal */}
      <Modal
        isOpen={isWeekOffModalOpen}
        onClose={() => setIsWeekOffModalOpen(false)}
        title="Set Company Weekly Off Days"
        description="Select recurring days off for employee calendar views"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {daysOfWeek.map((dayName, idx) => {
              const isSelected = weekOffs.includes(idx);
              return (
                <button
                  key={dayName}
                  type="button"
                  onClick={() => handleToggleWeekOff(idx)}
                  className={`p-3 rounded-xl border text-xs font-bold transition-all ${
                    isSelected
                      ? 'bg-[var(--tm-primary)] text-white border-[var(--tm-primary)] shadow-xs'
                      : 'bg-[var(--tm-card-muted)] text-[var(--tm-ink-soft)] border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)]'
                  }`}
                >
                  {dayName}
                </button>
              );
            })}
          </div>

          <div className="flex justify-end pt-4 border-t border-[var(--tm-border)]">
            <Button variant="primary" onClick={() => setIsWeekOffModalOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Holiday Modal */}
      <Modal
        isOpen={isHolidayModalOpen}
        onClose={() => setIsHolidayModalOpen(false)}
        title="Add Holiday"
      >
        <form onSubmit={handleAddHoliday} className="space-y-4">
          <Input
            label="Holiday Title"
            placeholder="e.g. Festival of Lights"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
          <Select
            label="Type"
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            options={[
              { value: 'company', label: 'Company Holiday' },
              { value: 'national', label: 'National Holiday' },
              { value: 'optional', label: 'Optional Leave' }
            ]}
          />
          <div className="flex justify-end gap-2 pt-4 border-t border-[var(--tm-border)]">
            <Button variant="outline" type="button" onClick={() => setIsHolidayModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit">
              Save Holiday
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};
