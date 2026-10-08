import type { IHolidayService } from '../interfaces';
import type { Holiday } from '../../types';
import { getStoredData, setStoredData, KEYS, delay } from './storage';
import { generateId } from '../../utils/ids';

export class MockHolidayService implements IHolidayService {
  async getHolidays(): Promise<Holiday[]> {
    await delay(50);
    return getStoredData<Holiday[]>(KEYS.HOLIDAYS);
  }

  async addHoliday(holidayData: Omit<Holiday, 'id'>): Promise<Holiday> {
    await delay(100);
    const holidays = getStoredData<Holiday[]>(KEYS.HOLIDAYS);
    const newHoliday: Holiday = {
      ...holidayData,
      id: generateId('hol')
    };
    holidays.push(newHoliday);
    setStoredData(KEYS.HOLIDAYS, holidays);
    return newHoliday;
  }

  async deleteHoliday(id: string): Promise<void> {
    await delay(100);
    let holidays = getStoredData<Holiday[]>(KEYS.HOLIDAYS);
    holidays = holidays.filter(h => h.id !== id);
    setStoredData(KEYS.HOLIDAYS, holidays);
  }

  async getWeekOffs(): Promise<number[]> {
    await delay(50);
    const days = getStoredData<number[]>(KEYS.WEEK_OFFS);
    return Array.isArray(days) ? days : [0, 6];
  }

  async setWeekOffs(days: number[]): Promise<number[]> {
    await delay(100);
    setStoredData(KEYS.WEEK_OFFS, days);
    return days;
  }
}

export const mockHolidayService = new MockHolidayService();
