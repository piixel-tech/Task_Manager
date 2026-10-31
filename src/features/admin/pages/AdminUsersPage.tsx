import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Edit2,
  Eye,
  MessageSquare,
  Plus,
  Users
} from 'lucide-react';
import { userService, taskService } from '../../../services';
import type { User, UserRole, Task } from '../../../types';
import { fetchCompanies, type ApiCompany } from '../../../services/http/mappers';
import { useAppStore } from '../../../store/useAppStore';
import { useUserStore } from '../../../store/useUserStore';
import { useAuthStore } from '../../../store/authStore';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { StatusChip } from '../../../components/ui/StatusChip';
import { Avatar } from '../../../components/ui/Avatar';
import { Modal } from '../../../components/ui/Modal';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog';
import { SuccessDialog } from '../../../components/ui/SuccessDialog';
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { FilterBar, FilterSearch } from '../../../components/ui/FilterBar';
import { PillTabs } from '../../../components/ui/PillTabs';
import { PageHeader } from '../../../components/ui/PageHeader';
import { StaggerItem } from '../../../components/ui/Stagger';
import { EmptyState } from '../../../components/ui/EmptyState';
import { SkeletonGrid } from '../../../components/ui/Skeleton';
import { formatDate } from '../../../utils/time';
import { EmployeeTaskTabs } from '../../tasks/components/EmployeeTaskTabs';

interface UserForm {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  companyId: string;
  /** Job role shown under the person's name everywhere. */
  jobTitle: string;
}

const emptyForm: UserForm = { name: '', email: '', password: '', role: 'employee', companyId: '', jobTitle: '' };

type PendingAction =
  | { kind: 'create' }
  | { kind: 'edit' | 'reset' | 'deactivate' | 'rehire'; user: User };

const nameOf = (a: PendingAction) => ('user' in a ? a.user.name : 'This member');

const CONFIRM_COPY: Record<
  PendingAction['kind'],
  { title: string; action: string; message: (a: PendingAction, form: UserForm) => React.ReactNode }
> = {
  create: {
    title: 'Create this account?',
    action: 'Create account',
    message: (_a, f) => `${f.name.trim()} (${f.email.trim()}) will be added as ${f.role}.`
  },
  edit: {
    title: 'Save changes?',
    action: 'Save',
    message: (a) => `Update the details for ${nameOf(a)}.`
  },
  reset: {
    title: 'Reset password?',
    action: 'Reset password',
    message: (a) => `${nameOf(a)} will need the new password to sign in.`
  },
  deactivate: {
    title: 'Deactivate this member?',
    action: 'Deactivate',
    message: (a) =>
      `${nameOf(a)} will no longer be able to sign in. Their records are kept and you can reactivate them later.`
  },
  rehire: {
    title: 'Reactivate this member?',
    action: 'Reactivate',
    message: (a) => `${nameOf(a)} will be able to sign in again.`
  }
};

type SortKey = 'name' | 'email' | 'role' | 'company' | 'status' | 'joined' | 'tasks';
type SortDir = 'asc' | 'desc';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'role', label: 'Role' },
  { key: 'company', label: 'Company' },
  { key: 'status', label: 'Status' },
  { key: 'joined', label: 'Joined' },
  { key: 'tasks', label: 'Open tasks' }
];

const companyLabel = (u: User) => (u.company === 'piixel' ? 'Piixel Studio' : 'Unwork SaaS');

const compare = (a: string | number, b: string | number) =>
  typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });

const FormError: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div className="tm-error px-4 py-3 text-xs font-semibold">
      {message}
    </div>
  ) : null;

export const AdminUsersPage: React.FC = () => {
  const navigate = useNavigate();
  const { companyFilter, showToast } = useAppStore();
  const [users, setUsers] = useState<User[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal controls
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [resettingUser, setResettingUser] = useState<User | null>(null);
  const [viewingUser, setViewingUser] = useState<User | null>(null);

  // Confirm -> run -> success flow
  const [confirm, setConfirm] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ title: string; message: string } | null>(null);

  // Browse controls
  const [query, setQuery] = useState('');
  const [statusTab, setStatusTab] = useState<'all' | 'left'>('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  const [companies, setCompanies] = useState<ApiCompany[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [newPassword, setNewPassword] = useState('');

  const setField = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormError(null);
  };

  const fetchData = async () => {
    try {
      const [uList, tList, cList] = await Promise.all([
        userService.getUsers(),
        taskService.getTasks(),
        fetchCompanies()
      ]);
      setUsers(uList);
      setTasks(tList);
      setCompanies(cList);
    } catch (err: any) {
      showToast(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const companyOptions = companies.map((c) => ({ value: c.id, label: c.name }));

  const openAdd = () => {
    setForm({ ...emptyForm, companyId: companies[0]?.id ?? '' });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  // Settings > People > "Invite someone" lands here with the form open.
  const [params, setParams] = useSearchParams();
  const wantsInvite = params.get('invite') === '1';
  useEffect(() => {
    if (wantsInvite && companies.length > 0) {
      openAdd();
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsInvite, companies.length]);

  const openEdit = (u: User) => {
    setForm({
      name: u.name,
      email: u.loginId,
      password: '',
      role: u.role,
      companyId: u.companyId ?? companies[0]?.id ?? '',
      jobTitle: u.jobTitle === u.role ? '' : u.jobTitle
    });
    setFormError(null);
    setEditingUser(u);
  };

  const closeForms = () => {
    setIsAddModalOpen(false);
    setEditingUser(null);
    setResettingUser(null);
    setFormError(null);
  };

  const syncStores = (updated: User) => {
    useUserStore.getState().setUser(updated);
    const { user: currentUser, setUser: setAuthUser } = useAuthStore.getState();
    if (currentUser?.id === updated.id) setAuthUser(updated);
  };

  // Runs the action the admin just confirmed.
  const runConfirmed = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      let result: { title: string; message: string };
      switch (confirm.kind) {
        case 'create': {
          const created = await userService.createUser({
            name: form.name.trim(),
            loginId: form.email.trim(),
            password: form.password,
            role: form.role,
            company: 'piixel',
            companyId: form.companyId || undefined,
            jobTitle: form.jobTitle.trim() || form.role,
            active: true
          });
          result = {
            title: 'Member added',
            message: `${created.name} can now sign in with ${created.loginId}.`
          };
          break;
        }
        case 'edit': {
          const updated = await userService.updateUser(confirm.user.id, {
            name: form.name.trim(),
            loginId: form.email.trim(),
            role: form.role,
            companyId: form.companyId || undefined,
            jobTitle: form.jobTitle.trim()
          });
          syncStores(updated);
          result = { title: 'Changes saved', message: `Updated details for ${updated.name}.` };
          break;
        }
        case 'reset': {
          await userService.resetPassword(confirm.user.id, newPassword);
          result = {
            title: 'Password reset',
            message: `New password set for ${confirm.user.name}.`
          };
          break;
        }
        case 'deactivate': {
          await userService.deleteUser(confirm.user.id);
          result = {
            title: 'Member deactivated',
            message: `${confirm.user.name} can no longer sign in.`
          };
          break;
        }
        case 'rehire': {
          const updated = await userService.updateUser(confirm.user.id, { active: true });
          syncStores(updated);
          result = { title: 'Member reactivated', message: `${updated.name} can sign in again.` };
          break;
        }
      }
      setConfirm(null);
      closeForms();
      setSuccess(result);
      fetchData();
    } catch (err: any) {
      // Keep the form open so the admin can fix the input (e.g. duplicate email).
      setConfirm(null);
      const message = err.message || 'Something went wrong';
      if (confirm.kind === 'deactivate' || confirm.kind === 'rehire') showToast(message);
      else setFormError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleOpenProfile = (u: User) => setViewingUser(u);

  const companyUsers = useMemo(
    () => users.filter((u) => companyFilter === 'all' || u.company === companyFilter),
    [users, companyFilter]
  );

  const counts = {
    all: companyUsers.filter((u) => u.active).length,
    left: companyUsers.filter((u) => !u.active).length
  };

  const openTasks = useMemo(() => {
    const counts = new Map<string, number>();
    tasks.forEach((t) => {
      if (t.status !== 'completed') counts.set(t.assignedUserId, (counts.get(t.assignedUserId) ?? 0) + 1);
    });
    return counts;
  }, [tasks]);

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    const sortValue = (u: User): string | number => {
      switch (sort.key) {
        case 'name':
          return u.name;
        case 'email':
          return u.loginId;
        case 'role':
          return u.role;
        case 'company':
          return companyLabel(u);
        case 'status':
          return u.active ? 'Active' : 'Inactive';
        case 'joined':
          return u.joiningDate ?? '';
        case 'tasks':
          return openTasks.get(u.id) ?? 0;
      }
    };
    return companyUsers
      .filter((u) => {
        const matchesStatus = statusTab === 'all' ? u.active : !u.active;
        const matchesQuery =
          !q ||
          [u.name, u.loginId, u.role, companyLabel(u), u.active ? 'active' : 'inactive'].some((v) => v.toLowerCase().includes(q));
        return matchesStatus && matchesQuery;
      })
      .sort((a, b) => (sort.dir === 'asc' ? 1 : -1) * compare(sortValue(a), sortValue(b)) || compare(a.name, b.name));
  }, [companyUsers, statusTab, query, sort, openTasks]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const statusOf = (u: User) =>
    u.active
      ? { tone: 'ok' as const, label: 'Active' }
      : { tone: 'bad' as const, label: 'Inactive' };

  return (
    <>
      <PageHeader
        title="Employees"
        description="Everyone on the team. Click a column heading to sort, or search by name, email, role or company."
        actions={
          <Button size="sm" onClick={openAdd} leftIcon={<Plus className="h-4 w-4" />}>
            Invite person
          </Button>
        }
      />

      {/* Filters */}
      <StaggerItem>
        <FilterBar
          activeCount={(query.trim() ? 1 : 0) + (statusTab !== 'all' ? 1 : 0)}
          onClear={() => {
            setQuery('');
            setStatusTab('all');
          }}
        >
          <PillTabs
            activeTab={statusTab}
            onChange={(t) => setStatusTab(t as typeof statusTab)}
            tabs={[
              { id: 'all', label: 'Everyone', count: counts.all },
              { id: 'left', label: 'Inactive', count: counts.left }
            ]}
          />
          <FilterSearch value={query} onChange={setQuery} placeholder="Search name, email, role or company" />
        </FilterBar>
      </StaggerItem>

      {/* Employees table */}
      {loading ? (
        <SkeletonGrid count={6} />
      ) : filteredUsers.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6 text-[var(--tm-primary-dark)]" />}
          title="No matching team members"
          description="Try adjusting your search terms or status filter."
        />
      ) : (
        <div className="animate-fade-in overflow-x-auto rounded-[var(--tm-radius-xl)] border border-[var(--tm-border)] bg-[var(--tm-card)] shadow-soft-xs">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="border-b border-[var(--tm-border)] bg-[var(--tm-card-muted)]">
              <tr>
                {COLUMNS.map((c) => {
                  const active = sort.key === c.key;
                  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
                  return (
                    <th
                      key={c.key}
                      scope="col"
                      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                      className="px-4 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`group inline-flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-wide hover:text-[var(--tm-ink)] ${
                          active ? 'text-[var(--tm-ink)]' : 'text-[var(--tm-ink-muted)]'
                        }`}
                      >
                        {c.label}
                        <Icon className={`h-3.5 w-3.5 ${active ? 'text-[var(--tm-primary-dark)]' : 'opacity-50 group-hover:opacity-100'}`} />
                      </button>
                    </th>
                  );
                })}
                <th scope="col" className="px-4 py-3 text-right text-[11.5px] font-bold uppercase tracking-wide text-[var(--tm-ink-muted)]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--tm-border)]">
              {filteredUsers.map((u) => {
                const status = statusOf(u);
                return (
                  <tr key={u.id} className="hover:bg-[var(--tm-card-muted)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={u.name} src={u.avatarUrl} size="sm" />
                        <span className="min-w-0">
                          <span className="block font-bold text-[var(--tm-ink)]">{u.name}</span>
                          {u.jobTitle !== u.role && <span className="block text-[12px] text-[var(--tm-ink-muted)]">{u.jobTitle}</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[var(--tm-ink-soft)]">{u.loginId}</td>
                    <td className="px-4 py-3">
                      <Badge variant={u.role === 'admin' ? 'both' : 'default'} size="sm" className="capitalize">
                        {u.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={u.company === 'piixel' ? 'piixel' : 'unwork'} size="sm">
                        {companyLabel(u)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusChip tone={status.tone} size="sm">
                        {status.label}
                      </StatusChip>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums text-[var(--tm-ink-soft)]">
                      {u.joiningDate ? formatDate(u.joiningDate, 'MMM d, yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-[var(--tm-ink-soft)]">{openTasks.get(u.id) ?? 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        <Button variant="ghost" size="sm" aria-label={`Message ${u.name}`} onClick={() => navigate('/admin/chat')}>
                          <MessageSquare className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`View ${u.name}'s profile`} onClick={() => handleOpenProfile(u)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" aria-label={`Edit ${u.name}`} onClick={() => openEdit(u)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        {u.active ? (
                          <Button variant="danger" size="sm" onClick={() => setConfirm({ kind: 'deactivate', user: u })}>
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-[var(--tm-success-ring)] text-[var(--tm-success)] hover:bg-[var(--tm-success-bg)]"
                            onClick={() => setConfirm({ kind: 'rehire', user: u })}
                          >
                            Reactivate
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Employee profile — right-side drawer */}
      <Drawer
        isOpen={!!viewingUser}
        onClose={() => setViewingUser(null)}
        title="Employee profile"
        description={viewingUser ? (viewingUser.jobTitle !== viewingUser.role ? `${viewingUser.jobTitle} · ${viewingUser.loginId}` : viewingUser.loginId) : undefined}
        width="lg"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setViewingUser(null)}>
              Close
            </Button>
            {viewingUser && (
              <>
                <Button
                  variant="outline"
                  onClick={() => navigate(`/admin/calendar/${viewingUser.id}`)}
                  leftIcon={<CalendarDays className="h-4 w-4" />}
                >
                  Calendar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setResettingUser(viewingUser);
                    setNewPassword('');
                    setFormError(null);
                    setViewingUser(null);
                  }}
                >
                  Reset password
                </Button>
                <Button
                  onClick={() => {
                    openEdit(viewingUser);
                    setViewingUser(null);
                  }}
                  leftIcon={<Edit2 className="h-4 w-4" />}
                >
                  Edit
                </Button>
              </>
            )}
          </div>
        }
      >
        {viewingUser && (
          <div className="space-y-7">
            {/* Identity */}
            <div className="flex items-center gap-4 rounded-[var(--tm-radius-lg)] bg-[var(--tm-card-muted)] p-5">
              <div className="rounded-full bg-[var(--tm-bg-sunken)] p-2">
                <Avatar name={viewingUser.name} src={viewingUser.avatarUrl} size="xl" ring />
              </div>
              <div className="min-w-0">
                <h3 className="truncate text-[19px] font-extrabold tracking-[-0.02em] text-[var(--tm-ink)]">
                  {viewingUser.name}
                </h3>
                <p className="text-[13px] capitalize text-[var(--tm-ink-muted)]">{viewingUser.role}</p>
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

          </div>
        )}
      </Drawer>

      {/* Add / Edit member */}
      <Modal
        isOpen={isAddModalOpen || !!editingUser}
        onClose={closeForms}
        title={editingUser ? `Edit ${editingUser.name}` : 'Add a new team member'}
        description={editingUser ? 'Update member details.' : 'They sign in with their email and password.'}
        maxWidth="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setConfirm(editingUser ? { kind: 'edit', user: editingUser } : { kind: 'create' });
          }}
          className="space-y-4"
        >
          <FormError message={formError} />

          <Input
            label="Full name"
            placeholder="e.g. Rahul Verma"
            value={form.name}
            onChange={(e) => setField('name', e.target.value)}
            required
          />

          <Input
            label="Job role"
            placeholder="e.g. Video editor"
            value={form.jobTitle}
            onChange={(e) => setField('jobTitle', e.target.value)}
            maxLength={80}
          />

          <Input
            label="Email"
            type="email"
            placeholder="rahul@company.com"
            value={form.email}
            onChange={(e) => setField('email', e.target.value)}
            required
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Company"
              value={form.companyId}
              onChange={(e) => setField('companyId', e.target.value)}
              options={companyOptions}
            />

            <Select
              label="Role"
              value={form.role}
              onChange={(e) => setField('role', e.target.value as UserRole)}
              options={[
                { value: 'employee', label: 'Employee' },
                { value: 'client', label: 'Client' },
                { value: 'admin', label: 'Admin' }
              ]}
            />
          </div>

          {!editingUser && (
            <Input
              label="Password"
              type="password"
              autoComplete="new-password"
              helperText="At least 8 characters."
              minLength={8}
              value={form.password}
              onChange={(e) => setField('password', e.target.value)}
              required
            />
          )}

          <div className="flex justify-end gap-3 border-t border-[var(--tm-border)] pt-5">
            <Button variant="outline" type="button" onClick={closeForms}>
              Cancel
            </Button>
            <Button type="submit">{editingUser ? 'Save changes' : 'Create account'}</Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={!!resettingUser}
        onClose={closeForms}
        title={resettingUser ? `Reset password — ${resettingUser.name}` : 'Reset password'}
        description="Set a new password for this member."
      >
        {resettingUser && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setConfirm({ kind: 'reset', user: resettingUser });
            }}
            className="space-y-4"
          >
            <FormError message={formError} />

            <Input
              label="New password"
              type="password"
              autoComplete="new-password"
              helperText="At least 8 characters."
              minLength={8}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value);
                setFormError(null);
              }}
              required
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" type="button" onClick={closeForms}>
                Cancel
              </Button>
              <Button variant="danger" type="submit">
                Reset password
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!confirm}
        danger={confirm?.kind === 'deactivate' || confirm?.kind === 'reset'}
        isLoading={busy}
        title={confirm ? CONFIRM_COPY[confirm.kind].title : ''}
        message={confirm ? CONFIRM_COPY[confirm.kind].message(confirm, form) : undefined}
        confirmLabel={confirm ? CONFIRM_COPY[confirm.kind].action : undefined}
        onConfirm={runConfirmed}
        onCancel={() => setConfirm(null)}
      />

      <SuccessDialog
        isOpen={!!success}
        title={success?.title ?? ''}
        message={success?.message}
        onClose={() => setSuccess(null)}
      />
    </>
  );
};
