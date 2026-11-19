import { afterEach, describe, expect, it } from 'vitest';
import { installStackedTables } from './stackedTables';

afterEach(() => {
  document.body.innerHTML = '';
});

const table = (cls = 'tm-stack') => `
  <table class="${cls}">
    <thead><tr><th>Name</th><th>Role</th><th><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>
      <tr><td>Mia</td><td>Employee</td><td><button>Edit</button></td></tr>
      <tr><td colspan="3">Totals</td></tr>
    </tbody>
  </table>`;

describe('stacked tables', () => {
  it('copies each column name onto its cells, so phones can show them as labels', () => {
    document.body.innerHTML = table();
    const stop = installStackedTables();
    const cells = document.querySelectorAll('tbody tr:first-child td');
    expect(Array.from(cells).map((c) => c.getAttribute('data-label'))).toEqual(['Name', 'Role', 'Actions']);
    expect(document.querySelector('td[colspan]')!.getAttribute('data-label')).toBe('Name'); // a full-width row keeps the first name
    stop();
  });

  it('leaves tables that are not marked alone', () => {
    document.body.innerHTML = table('plain');
    const stop = installStackedTables();
    expect(document.querySelector('td')!.hasAttribute('data-label')).toBe(false);
    stop();
  });

  it('labels rows that appear later', async () => {
    document.body.innerHTML = table();
    const stop = installStackedTables();
    document.querySelector('tbody')!.insertAdjacentHTML('beforeend', '<tr><td>Kai</td><td>Client</td><td></td></tr>');
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(document.querySelector('tbody tr:last-child td')!.getAttribute('data-label')).toBe('Name');
    stop();
  });
});
