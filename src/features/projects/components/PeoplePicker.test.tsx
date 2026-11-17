import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PeoplePicker } from './PeoplePicker';
import type { UserBrief } from '../../../services/http/projectApi';

const person = (id: string, name: string): UserBrief => ({ id, name, avatar_url: null, role: 'employee', company_id: null });
const PEOPLE = [person('a', 'Ada Lovelace'), person('b', 'Bo Burnham'), person('c', 'Cy Young')];

const Harness: React.FC<{ start?: string[] }> = ({ start = [] }) => {
  const [value, setValue] = useState<string[]>(start);
  return <PeoplePicker label="People" people={PEOPLE} value={value} onChange={setValue} chips />;
};

afterEach(cleanup);

describe('PeoplePicker with chips', () => {
  it('selects a person by clicking their row and shows a chip', () => {
    render(<Harness />);
    fireEvent.click(screen.getByText('Bo Burnham'));
    const chips = screen.getByRole('list', { name: 'Selected people' });
    expect(within(chips).getByText('Bo Burnham')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: /Bo Burnham/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('removes a person from the chip x and unticks the row', () => {
    render(<Harness start={['a', 'c']} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ada Lovelace' }));
    expect(screen.queryByRole('button', { name: 'Remove Ada Lovelace' })).toBeNull();
    expect((screen.getByRole('checkbox', { name: /Ada Lovelace/ }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('checkbox', { name: /Cy Young/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('filters the list by the search', () => {
    render(<Harness />);
    fireEvent.change(screen.getByPlaceholderText('Search people'), { target: { value: 'cy' } });
    expect(screen.queryByText('Ada Lovelace')).toBeNull();
    expect(screen.getByText('Cy Young')).toBeTruthy();
  });
});
