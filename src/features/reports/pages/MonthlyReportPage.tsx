import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Download, Eye, FileDown } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { Card } from '../../../components/ui/Card';
import { FilterBar, FilterSearch } from '../../../components/ui/FilterBar';
import { EmptyState } from '../../../components/ui/EmptyState';
import { PageHeader } from '../../../components/ui/PageHeader';
import { PillTabs } from '../../../components/ui/PillTabs';
import { Skeleton } from '../../../components/ui/Skeleton';
import { StatusChip } from '../../../components/ui/StatusChip';
import { fetchCompanies } from '../../../services/http/mappers';
import { reportApi, type MonthlyReport, type ReportListRow } from '../../../services/http/reportApi';
import { socket } from '../../../services/socket';
import { useAuthStore } from '../../../store/authStore';
import { toast } from '../../../store/useToastStore';
import { basePath } from '../../settings/settingsMenu';
import { monthLabel, ReportSkeleton, ReportView } from '../components/ReportView';
import { clock12, niceTime } from '../reportFormat';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const shiftMonth = (month: string, by: number) => {
  const d = new Date(Number(month.slice(0, 4)), Number(month.slice(5)) - 1 + by, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const MonthPicker: React.FC<{ month: string; onChange: (m: string) => void; dark?: boolean }> = ({ month, onChange, dark }) => {
  const now = currentMonth();
  const round = dark
    ? 'grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[var(--tm-solid-ink)]/30 hover:bg-[var(--tm-solid-ink)]/10 disabled:opacity-30'
    : 'grid h-9 w-9 place-items-center rounded-full border border-[var(--tm-border)] hover:bg-[var(--tm-bg-sunken)] disabled:opacity-30';
  return (
    <div className={`flex items-center gap-2 ${dark ? '' : 'flex-wrap'}`}>
      <button type="button" aria-label="Previous month" onClick={() => onChange(shiftMonth(month, -1))} className={round}>
        <ChevronLeft className="h-4 w-4" />
      </button>
      <label
        className={`relative flex h-9 items-center text-[13.5px] font-extrabold ${
          dark ? 'flex-1 justify-center text-[var(--tm-solid-ink)]' : 'rounded-full border border-[var(--tm-border)] px-4 text-[var(--tm-ink)]'
        }`}
      >
        {monthLabel(month)}
        <input
          type="month"
          aria-label="Choose a month"
          value={month}
          max={now}
          min="2020-01"
          onChange={(e) => e.target.value && e.target.value <= now && onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <button type="button" aria-label="Next month" disabled={month >= now} onClick={() => onChange(shiftMonth(month, 1))} className={round}>
        <ChevronRight className="h-4 w-4" />
      </button>
      {!dark && (
        <Button size="sm" variant="outline" disabled={month === now} onClick={() => onChange(now)}>
          This month
        </Button>
      )}
    </div>
  );
};

/** Loads one report; the current month refreshes by itself as attendance, tasks and timers change. */
function useReport(userId: string | null, month: string) {
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    if (!userId) return;
    reportApi
      .get(userId, month)
      .then((r) => (setReport(r), setError(null)))
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the report'));
  }, [userId, month]);

  useEffect(() => {
    setReport(null);
    load();
    if (month !== currentMonth()) return; // a finished month never changes
    const timer = setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    const offs = ['timer', 'daily_status', 'notification'].map((ev) => socket.on(ev, load));
    window.addEventListener('focus', load);
    return () => {
      clearInterval(timer);
      offs.forEach((off) => off());
      window.removeEventListener('focus', load);
    };
  }, [load, month]);
  return { report, error };
}

const pdf = async (userId: string, month: string) => {
  try {
    await reportApi.downloadPdf(userId, month);
  } catch (e) {
    toast.error('Could not download', e instanceof Error ? e.message : undefined);
  }
};

/** Controls card (left column, charcoal): the status badge, the month picker, This month and Download PDF. */
const TopBar: React.FC<{ month: string; onMonth: (m: string) => void; report: MonthlyReport | null; onPdf: () => void; lead?: React.ReactNode }> = ({ month, onMonth, report, onPdf, lead }) => {
  const now = currentMonth();
  return (
    <section aria-label="Report controls" className="space-y-3 rounded-[var(--tm-radius-card)] bg-[var(--tm-solid)] p-4 text-[var(--tm-solid-ink)] shadow-soft-xs">
      <div className="flex min-h-6 items-center justify-between gap-2">
        {lead ?? <span className="text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">Monthly report</span>}
        {report && (
          <StatusChip tone={report.state === 'in_progress' ? 'warn' : 'ok'} size="sm" dot>
            {report.state === 'in_progress' ? 'In progress' : 'Final'}
          </StatusChip>
        )}
      </div>
      <MonthPicker month={month} onChange={onMonth} dark />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={month === now}
          onClick={() => onMonth(now)}
          className="h-10 rounded-full border border-[var(--tm-solid-ink)]/40 px-3 text-[13px] font-semibold transition-colors hover:bg-[var(--tm-solid-ink)]/10 disabled:opacity-40"
        >
          This month
        </button>
        <button
          type="button"
          disabled={!report}
          onClick={onPdf}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[var(--tm-accent)] px-3 text-[13px] font-semibold text-[var(--tm-accent-ink)] transition hover:brightness-95 disabled:opacity-50"
        >
          <Download className="h-4 w-4" /> Download PDF
        </button>
      </div>
    </section>
  );
};

const ReportBody: React.FC<{ report: MonthlyReport | null; error: string | null; controls: React.ReactNode }> = ({ report, error, controls }) => {
  const navigate = useNavigate();
  const role = useAuthStore.getState().user?.role;
  const base = basePath(role);
  return (
    <>
      {error && <div className="tm-error mb-4 px-4 py-3 text-xs font-semibold">{error}</div>}
      {report ? (
        <ReportView report={report} admin={role === 'admin'} controls={controls} onOpenTask={(id) => navigate(`${base}/tasks/${id}`)} />
      ) : (
        !error && <ReportSkeleton controls={controls} />
      )}
    </>
  );
};

const EmployeeView: React.FC = () => {
  const me = useAuthStore((s) => s.user);
  const [month, setMonth] = useState(currentMonth());
  const { report, error } = useReport(me?.id ?? null, month);
  return (
    <ReportBody report={report} error={error} controls={<TopBar month={month} onMonth={setMonth} report={report} onPdf={() => me && void pdf(me.id, month)} />} />
  );
};

const AdminView: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useState(params.get('month') ?? currentMonth());
  const viewing = params.get('user');
  const [rows, setRows] = useState<ReportListRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [company, setCompany] = useState('');
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [query, setQuery] = useState('');
  const [zipping, setZipping] = useState(false);
  const { report, error: reportError } = useReport(viewing, month);

  useEffect(() => {
    fetchCompanies()
      .then((c) => setCompanies(c.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (viewing) return;
    let live = true;
    const t = setTimeout(
      () =>
        reportApi
          .list(month, company, query)
          .then((l) => live && (setRows(l.rows), setError(null)))
          .catch((e) => live && setError(e instanceof Error ? e.message : 'Could not load the reports')),
      query ? 250 : 0
    );
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [month, company, query, viewing]);

  const open = (id: string | null) => setParams(id ? { user: id, month } : {}, { replace: false });
  const zip = async () => {
    setZipping(true);
    try {
      await reportApi.downloadZip(month, company, query);
    } catch (e) {
      toast.error('Could not download', e instanceof Error ? e.message : undefined);
    } finally {
      setZipping(false);
    }
  };

  if (viewing) {
    return (
      <ReportBody
        report={report}
        error={reportError}
        controls={
          <TopBar
            month={month}
            onMonth={(m) => (setMonth(m), setParams({ user: viewing, month: m }, { replace: true }))}
            report={report}
            onPdf={() => void pdf(viewing, month)}
            lead={
              <Button size="sm" variant="outline" onClick={() => open(null)} leftIcon={<ArrowLeft className="h-4 w-4" />}>
                {report?.person.name ?? 'All employees'}
              </Button>
            }
          />
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Monthly Report"
        description="Each employee’s month, live until it is final."
        actions={
          <Button size="sm" variant="outline" isLoading={zipping} disabled={!rows?.length} onClick={() => void zip()} leftIcon={<Download className="h-4 w-4" />}>
            Download all (ZIP)
          </Button>
        }
      />
      <div className="mb-4">
        <MonthPicker month={month} onChange={setMonth} />
      </div>
      <FilterBar activeCount={(company ? 1 : 0) + (query.trim() ? 1 : 0)} onClear={() => (setCompany(''), setQuery(''))}>
        <PillTabs activeTab={company || 'all'} onChange={(c) => setCompany(c === 'all' ? '' : c)} tabs={[{ id: 'all', label: 'All companies' }, ...companies.map((c) => ({ id: c.id, label: c.name }))]} />
        <FilterSearch value={query} onChange={setQuery} placeholder="Search by name" />
      </FilterBar>

      {error && <div className="tm-error mt-4 px-4 py-3 text-xs font-semibold">{error}</div>}
      <div className="mt-4 space-y-2.5">
        {rows === null ? (
          error ? null : Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-[72px] w-full" />)
        ) : rows.length === 0 ? (
          <EmptyState title="No employees match" description="Try another month, company or name." />
        ) : (
          rows.map((r) => (
            <Card key={r.user_id} interactive className="cursor-pointer" onClick={() => open(r.user_id)}>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
                <div className="flex min-w-[12rem] flex-1 items-center gap-3">
                  <Avatar name={r.name} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-extrabold text-[var(--tm-ink)]">
                      {r.name}
                      {r.state === 'in_progress' && (
                        <StatusChip tone="warn" size="sm" className="ml-2">
                          live
                        </StatusChip>
                      )}
                    </p>
                    <p className="truncate text-[12px] text-[var(--tm-ink-muted)]">{r.company || 'No company'}</p>
                  </div>
                </div>
                <dl className="grid grid-cols-4 gap-x-6 text-center">
                  {[
                    ['Days present', r.scheduled_days ? `${r.days_worked ?? r.present} / ${Math.max(r.days_worked ?? 0, r.scheduled_days)}` : String(r.days_worked ?? r.present)],
                    ['Usual login', clock12(r.avg_login)],
                    ['Tasks done', r.assigned ? `${r.completed} / ${r.assigned}` : '-'],
                    ['Time tracked', niceTime(r.total_seconds)]
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dd className="text-[15px] font-extrabold tabular-nums text-[var(--tm-ink)]">{value}</dd>
                      <dt className="text-[11px] font-bold text-[var(--tm-ink-muted)]">{label}</dt>
                    </div>
                  ))}
                </dl>
                {r.summary && <p className="order-last w-full truncate text-[12.5px] text-[var(--tm-ink-muted)]">{r.summary}</p>}
                <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <Button size="sm" variant="outline" aria-label={`View ${r.name}'s report`} onClick={() => open(r.user_id)} leftIcon={<Eye className="h-4 w-4" />}>
                    View
                  </Button>
                  <Button size="sm" variant="outline" aria-label={`Download PDF for ${r.name}`} onClick={() => void pdf(r.user_id, month)} leftIcon={<FileDown className="h-4 w-4" />}>
                    PDF
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </>
  );
};

/** Monthly Report: employees see their own, admins see everyone's. Nobody can edit anything; the only action is the PDF. */
export const MonthlyReportPage: React.FC = () => (useAuthStore.getState().user?.role === 'admin' ? <AdminView /> : <EmployeeView />);
