import { create } from 'zustand';
import { statusApi, type TodayRow } from '../services/http/calendarApi';
import { fetchCompanies } from '../services/http/mappers';
import type { DayStatus } from '../features/status/statusMeta';
import { toast } from './useToastStore';

interface DailyStatusState {
  /** My status for today; `status` is null until I answer the popup. */
  today: { date: string; status: DayStatus | null } | null;
  mineLoaded: boolean;
  overview: TodayRow[];
  overviewLoaded: boolean;
  /** company id -> lowercase company name, for badges and filtering. */
  companyNames: Record<string, string>;
  /** Popup open because the user chose to change today's status. */
  editing: boolean;

  loadMine: () => Promise<void>;
  loadOverview: () => Promise<void>;
  setMine: (status: DayStatus) => Promise<void>;
  openEditor: () => void;
  closeEditor: () => void;
  reset: () => void;
}

export const useDailyStatusStore = create<DailyStatusState>((set, get) => ({
  today: null,
  mineLoaded: false,
  overview: [],
  overviewLoaded: false,
  companyNames: {},
  editing: false,

  loadMine: async () => {
    try {
      set({ today: await statusApi.myToday(), mineLoaded: true });
    } catch (err) {
      console.error(err);
    }
  },

  loadOverview: async () => {
    try {
      const [overview, companies] = await Promise.all([
        statusApi.overview(),
        get().overviewLoaded ? Promise.resolve(null) : fetchCompanies()
      ]);
      set((state) => ({
        overview,
        overviewLoaded: true,
        companyNames: companies
          ? Object.fromEntries(companies.map((c) => [c.id, c.name.toLowerCase()]))
          : state.companyNames
      }));
    } catch (err) {
      console.error(err);
    }
  },

  setMine: async (status) => {
    const saved = await statusApi.setToday(status);
    set((state) => ({
      today: { date: saved.date, status: saved.status },
      editing: false,
      overview: state.overview.map((row) =>
        row.user_id === saved.user_id ? { ...row, status: saved.status } : row
      )
    }));
    toast.success('Status updated');
  },

  openEditor: () => set({ editing: true }),
  closeEditor: () => set({ editing: false }),
  reset: () =>
    set({ today: null, mineLoaded: false, overview: [], overviewLoaded: false, editing: false })
}));
