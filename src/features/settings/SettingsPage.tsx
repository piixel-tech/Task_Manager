import React from 'react';
import { NavLink, Navigate, useParams } from 'react-router-dom';
import { PageHeader } from '../../components/ui/PageHeader';
import { useAuthStore } from '../../store/authStore';
import { ProfileSection } from './sections/ProfileSection';
import { basePath, settingsGroupsFor } from './settingsMenu';
import { ConnectedAppsSection } from './sections/ConnectedAppsSection';
import { AppearanceSection, FocusSection, HelpSection, NotificationsSection, PasswordSection, ShortcutsSection } from './sections/PreferenceSections';
import { CompaniesSection, ExportSection, PeopleSection, SecuritySection, TrashSection, WorkspaceSection } from './sections/AdminSections';

const RENDER: Record<string, () => React.ReactNode> = {
  profile: () => <ProfileSection />,
  password: () => <PasswordSection />,
  notifications: () => <NotificationsSection />,
  focus: () => <FocusSection />,
  appearance: () => <AppearanceSection />,
  'connected-apps': () => <ConnectedAppsSection />,
  shortcuts: () => <ShortcutsSection />,
  help: () => <HelpSection />,
  people: () => <PeopleSection />,
  companies: () => <CompaniesSection />,
  workspace: () => <WorkspaceSection />,
  trash: () => <TrashSection />,
  export: () => <ExportSection />,
  security: () => <SecuritySection />
};

/**
 * Everything behind the avatar menu, the same page for every role: "Me" for everyone (shorter for clients), plus "Admin" for admins.
 * A section the person's role doesn't have simply isn't found, so typing its address sends them back to their profile.
 */
export const SettingsPage: React.FC = () => {
  const { section } = useParams<{ section?: string }>();
  const role = useAuthStore((s) => s.user?.role);
  const prefix = basePath(role);
  const groups = settingsGroupsFor(role);
  const current = groups.flatMap((g) => g.items).find((s) => s.id === section);

  if (!section || !current) return <Navigate to={`${prefix}/settings/profile`} replace />;

  return (
    <>
      <PageHeader title="Settings" description={current.label} />
      <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-1.5 px-3 text-[10.5px] font-bold uppercase tracking-[0.14em] text-[var(--tm-ink-muted)]">{g.title}</p>
              <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
                {g.items.map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.id} className="shrink-0">
                      <NavLink
                        to={`${prefix}/settings/${s.id}`}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                            isActive ? 'bg-[var(--tm-primary-soft)] font-bold text-[var(--tm-primary-dark)]' : 'text-[var(--tm-ink-soft)] hover:bg-[var(--tm-bg-sunken)] hover:text-[var(--tm-ink)]'
                          }`
                        }
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {s.label}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="min-w-0 space-y-6">{RENDER[current.id]()}</div>
      </div>
    </>
  );
};
