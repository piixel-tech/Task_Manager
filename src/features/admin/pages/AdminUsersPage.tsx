import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Edit2,
  Eye,
  MessageSquare,
  Plus,
  Search,
  Users
} from 'lucide-react';
import { attendanceService, userService, taskService } from '../../../services';
import type { AttendanceDay, Company, User, UserRole, Task } from '../../../types';
import { useAppStore } from '../../../store/useAppStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Avatar } from '../../../components/ui/Avatar';
import { Modal } from '../../../components/ui/Modal';
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { PillTabs } from '../../../components/ui/PillTabs';
import { PageHeader } from '../../../components/ui/PageHeader';
import { ProgressBar } from '../../../components/ui/ProgressRing';
import { StaggerItem } from '../../../components/ui/Stagger';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { useMotionPrefs } from '../../../components/ui/useMotionPrefs';
import { fastT, listItemVariants } from '../../../components/ui/motion';
import { formatHours, formatLoginId } from '../../../utils/format';
import { EmployeeTaskTabs } from '../../tasks/components/EmployeeTaskTabs';

export const AdminUsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyFilter, showToast } = useAppStore();
  const { reduced } = useMotionPrefs();
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);
  const [userAttendance, setUserAttendance] = useState<AttendanceDay[]>([]);

  // Browse controls
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');

  // Form states
  const [name, setName] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [company, setCompany] = useState<Company>('piixel');
  const [role, setRole] = useState<UserRole>('employee');
  const [password, setPassword] = useState('password123');
  const [newJobTitle, setNewJobTitle] = useState('');
  const [newPassword, setNewPassword] = useState('password123');

  const fetchData = async () => {
    const [uList, tList] = await Promise.all([
      userService.getUsers(),
      taskService.getTasks()
    ]);
    setUsers(uList);
    setTasks(tList);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generatedLoginId = name && jobTitle ? formatLoginId(name, company, jobTitle) : '';

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !jobTitle) return;

    try {
      const created = await userService.createUser({
        name,
        jobTitle,
        company,
        role,
        loginId: generatedLoginId,
        password,
        mustChangePassword: true,
        active: true
      });
      showToast(`User ${created.name} created! Login ID: ${created.loginId}`);
      setIsAddModalOpen(false);
      setName('');
      setJobTitle('');
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to create user');
    }
  };

  const handleEditJobTitle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || !newJobTitle) return;

    try {
      await userService.updateUser(editingUser.id, { jobTitle: newJobTitle });
      showToast(`Updated job title for ${editingUser.name}.`);
      setEditingUser(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update job title');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingUser) return;

    try {
      await userService.resetPassword(resettingUser.id, newPassword);
      showToast(`Password reset for ${resettingUser.name}.`);
      setResettingUser(null);
      fetchData();
    } catch (err: any) {
      showToast(err.message || 'Failed to reset password');
    }
  };


  const handleOpenProfile = async (u: User) => {
    setViewingUser(u);
    setUserAttendance([]);
    const att = await attendanceService.getAttendance(u.id);
    setUserAttendance(att);
  };

  const companyUsers = useMemo(
    () => users.filter((u) => companyFilter === 'all' || u.company === companyFilter),
    [users, companyFilter]
  );

  const counts = {
    all: companyUsers.length,
    active: companyUsers.filter((u) => u.active && !u.mustChangePassword).length,
    pending: companyUsers.filter((u) => u.active && u.mustChangePassword).length,
    inactive: companyUsers.filter((u) => !u.active).length
  };

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    return companyUsers.filter((u) => {
      const matchesStatus =
        statusTab === 'all' ||
        (statusTab === 'active' && u.active && !u.mustChangePassword) ||
        (statusTab === 'pending' && u.active && u.mustChangePassword) ||
        (statusTab === 'inactive' && !u.active);

      const matchesQuery =
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.jobTitle.toLowerCase().includes(q) ||
        u.loginId.toLowerCase().includes(q);

      return matchesStatus && matchesQuery;
    });
  }, [companyUsers, statusTab, query]);

  const statusOf = (u: User) =>
    !u.active
      ? { tone: 'bad' as const, label: 'Deactivated' }
      : u.mustChangePassword
        ? { tone: 'warn' as const, label: 'Password pending' }
        : { tone: 'ok' as const, label: 'Active' };

  return (
    <>
      <PageHeader
        title="Team Directory"
        description="Member cards with online status, workload bars, message shortcuts and detailed profiles."
        actions={
          <Button size="sm" onClick={() => setIsAddModalOpen(true)} leftIcon={<Plus className="h-4 w-4" />}>
            Add member
          </Button>
        }
      />

      {/* Filters */}
      <StaggerItem className="flex flex-col gap-3.5 lg:flex-row lg:items-center lg:justify-between">
        <PillTabs
          activeTab={statusTab}
          onChange={(t) => setStatusTab(t as typeof statusTab)}
          tabs={[
            { id: 'all', label: 'Everyone', count: counts.all },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'pending', label: 'Password pending', count: counts.pending },
            { id: 'inactive', label: 'Deactivated', count: counts.inactive }
          ]}
        />

        <div className="lg:w-72">
          <Input
            pill
            placeholder="Search name, title or login ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            leftIcon={<Search className="h-4 w-4" />}
          />
        </div>
      </StaggerItem>

      {/* Member Cards Grid */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-[var(--tm-primary)]" />}
          title="No matching team members"
          description="Try adjusting your search terms or status filter."
        />
      ) : (
        <motion.div
          layout={!reduced}
          className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3"
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {filteredUsers.map((u) => {
              const status = statusOf(u);

              // Calculate user's task stats & workload
              const userTsks = tasks.filter((t) => t.assignedUserId === u.id);
              const openCount = userTsks.filter((t) => t.status !== 'completed').length;
              const completedCount = userTsks.filter((t) => t.status === 'completed').length;

              const openEstHours = userTsks
                .filter((t) => t.status !== 'completed')
                .reduce((acc, t) => acc + (t.estimatedHours || 8), 0);
              const workloadPct = Math.min(100, (openEstHours / 40) * 100);
              const isHighWorkload = workloadPct > 80;

              return (
                <motion.article
                  key={u.id}
                  layout={!reduced}
                  variants={listItemVariants}
                  initial="hidden"
                  animate="show"
                  exit="exit"
                  whileHover={reduced ? undefined : { y: -3 }}
                  transition={fastT}
                  className="rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)]
                    bg-[var(--tm-card)] p-6 shadow-soft-xs transition-shadow hover:shadow-soft flex flex-col justify-between"
                >
                  <div>
                    {/* Header: Avatar with Online Dot, Name · Job Title */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3.5">
                        <div className="relative shrink-0">
                          <Avatar name={u.name} src={u.avatarUrl} size="lg" />
                          <span
                            className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${
                              u.active ? 'bg-[var(--tm-success)]' : 'bg-gray-300'
                            }`}
                            title={u.active ? 'Online / Active' : 'Offline'}
                          />
                        </div>

                        <div className="min-w-0 leading-tight">
                          <h3 className="truncate text-[15.5px] font-bold text-[var(--tm-ink)]">
                            {u.name}
                          </h3>
                          <p className="truncate text-[12.5px] font-medium text-[var(--tm-ink-muted)]">
                            {u.jobTitle}
                          </p>
                        </div>
                      </div>

                      <StatusChip tone={status.tone} size="sm">
                        {status.label}
                      </StatusChip>
                    </div>

                    {/* Company Chip & Role */}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Badge
                        variant={u.company === 'piixel' ? 'piixel' : 'unwork'}
                        size="sm"
                        className="capitalize"
                      >
                        {u.company === 'piixel' ? 'Piixel Studio' : 'Unwork SaaS'}
                      </Badge>
                      <Badge variant={u.role === 'admin' ? 'both' : 'default'} size="sm" className="capitalize">
                        {u.role}
                      </Badge>
                    </div>

                    {/* Open / Completed Counts */}
                    <div className="mt-4 flex items-center justify-between text-[12.5px] font-semibold text-[var(--tm-ink-soft)]">
                      <span>{openCount} open tasks</span>
                      <span>{completedCount} completed</span>
                    </div>

                    {/* Workload Bar (turns amber above 80%) */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-[var(--tm-ink-muted)]">
                        <span>Workload</span>
                        <span className={isHighWorkload ? 'font-bold text-[var(--tm-warning)]' : ''}>
                          {Math.round(workloadPct)}%
                        </span>
                      </div>
                      <ProgressBar
                        value={workloadPct}
                        tone={isHighWorkload ? 'warn' : 'primary'}
                        height={6}
                      />
                    </div>
                  </div>

                  {/* Actions: Message + Profile buttons */}
                  <div className="mt-6 flex items-center gap-2 border-t border-[var(--tm-border)] pt-4">
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex-1"
                      leftIcon={<MessageSquare className="h-4 w-4" />}
                      onClick={() => navigate('/admin/chat')}
                    >
                      Message
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      leftIcon={<Eye className="h-4 w-4" />}
                      onClick={() => handleOpenProfile(u)}
                    >
                      Profile
                    </Button>
                  </div>
                </motion.article>
              );
            })}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Employee profile — right-side drawer */}
      <Drawer
        isOpen={!!viewingUser}
        onClose={() => setViewingUser(null)}
        title="Employee profile"
        description={viewingUser ? viewingUser.loginId : undefined}
        width="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setViewingUser(null)}>
              Close
            </Button>
            {viewingUser && (
              <Button
                onClick={() => {
                  setEditingUser(viewingUser);
                  setNewJobTitle(viewingUser.jobTitle);
                  setViewingUser(null);
                }}
                leftIcon={<Edit2 className="h-4 w-4" />}
              >
                Edit job title
              </Button>
            )}
          </div>
        }
      >
        {viewingUser && (
          <div className="space-y-7">
            {/* Identity */}
            <div className="flex items-center gap-4 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-5">
              <Avatar name={viewingUser.name} src={viewingUser.avatarUrl} size="xl" />
              <div className="min-w-0">
                <h3 className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">
                  {viewingUser.name}
                </h3>
                <p className="text-[13px] text-[var(--tm-ink-muted)]">{viewingUser.jobTitle}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                  <Badge
                    variant={viewingUser.company === 'piixel' ? 'piixel' : 'unwork'}
                    size="sm"
                    className="capitalize"
                  >
                    {viewingUser.company}
                  </Badge>
                  <StatusChip tone={statusOf(viewingUser).tone} size="sm">
                    {statusOf(viewingUser).label}
                  </StatusChip>
                </div>
              </div>
            </div>

            {/* Tasks */}
            <section>
              <EmployeeTaskTabs userId={viewingUser.id} />
            </section>

            {/* Shift logs */}
            <section>
              <h4 className="mb-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">
                Recent shift logs
              </h4>

              {userAttendance.length === 0 ? (
                <p className="rounded-[var(--tm-radius-md)] bg-[var(--tm-card-muted)] px-4 py-6 text-center text-[13px] text-[var(--tm-ink-muted)]">
                  No attendance logs found for this employee.
                </p>
              ) : (
                <ul className="space-y-2">
                  {userAttendance.slice(0, 6).map((att) => (
                    <li
                      key={att.id}
                      className="flex items-center justify-between gap-3 rounded-[var(--tm-radius-md)]
                        bg-[var(--tm-card-muted)] px-4 py-3"
                    >
                      <span className="text-[13px] font-bold text-[var(--tm-ink)]">{att.date}</span>
                      <StatusChip status={att.status} size="sm" />
                      <span className="text-[13px] font-extrabold tabular-nums text-[var(--tm-primary)]">
                        {formatHours(att.totalHours)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add a new team member"
        description="The login ID is generated automatically."
        maxWidth="lg"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <Input
            label="Full name"
            placeholder="e.g. Rahul Verma"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />

          <Input
            label="Job title"
            placeholder="e.g. SEO Executive"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Company"
              value={company}
              onChange={(e) => setCompany(e.target.value as Company)}
              options={[
                { value: 'piixel', label: 'Piixel Studio' },
                { value: 'unwork', label: 'Unwork SaaS' }
              ]}
            />

            <Select
              label="Role"
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              options={[
                { value: 'employee', label: 'Employee' },
                { value: 'admin', label: 'Admin' }
              ]}
            />
          </div>

          {generatedLoginId && (
            <div className="rounded-[var(--tm-radius-md)] bg-[var(--tm-primary-softer)] px-4 py-3.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--tm-ink-muted)]">
                Generated login ID
              </div>
              <div className="mt-1 text-[14px] font-extrabold text-[var(--tm-primary-dark)]">
                {generatedLoginId}
              </div>
            </div>
          )}

          <Input
            label="Starting temporary password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
            <Button variant="outline" type="button" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Create account</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Job Title Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={editingUser ? `Edit job title — ${editingUser.name}` : 'Edit job title'}
        description="The login ID stays unchanged."
      >
        {editingUser && (
          <form onSubmit={handleEditJobTitle} className="space-y-4">
            <Input label="Current login ID" value={editingUser.loginId} disabled />

            <Input
              label="New job title"
              value={newJobTitle}
              onChange={(e) => setNewJobTitle(e.target.value)}
              required
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={() => setEditingUser(null)}>
                Cancel
              </Button>
              <Button type="submit">Save job title</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resettingUser}
        onClose={() => setResettingUser(null)}
        title={resettingUser ? `Reset password — ${resettingUser.name}` : 'Reset password'}
        description="The employee will be asked to set a new password at next sign-in."
      >
        {resettingUser && (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Input
              label="New temporary password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={() => setResettingUser(null)}>
                Cancel
              </Button>
              <Button variant="danger" type="submit">
                Reset password
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </>
  );
};
