/**
 * Tables marked `tm-stack` become stacked cards on phones (see index.css). The cards need each cell's column name, so this copies
 * it from the header onto the cell as `data-label`. It watches the page, so tables that load or change later get labelled too.
 */
const label = (table: HTMLTableElement) => {
  const heads = Array.from(table.querySelectorAll('thead th')).map((h) => h.textContent?.trim() ?? '');
  table.querySelectorAll('tbody tr').forEach((row) => {
    let col = 0;
    row.querySelectorAll(':scope > td').forEach((cell) => {
      const td = cell as HTMLTableCellElement;
      const name = heads[col];
      if (name && td.getAttribute('data-label') !== name) td.setAttribute('data-label', name);
      col += td.colSpan || 1;
    });
  });
};

export function installStackedTables(): () => void {
  const run = () => document.querySelectorAll<HTMLTableElement>('table.tm-stack').forEach(label);
  let frame = 0;
  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      run();
    });
  };
  run();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return () => {
    observer.disconnect();
    if (frame) cancelAnimationFrame(frame);
  };
}
