import { expect, it } from 'vitest';
import { employeeColor } from '../src/employee-colors.js';

it('gibt Mitarbeitern feste, individuelle Kalenderfarben im Hexformat', () => {
  const ids = ['employee-mia', 'employee-lea', 'employee-admin'];
  const colors = ids.map(employeeColor);
  expect(new Set(colors).size).toBe(ids.length);
  for (const [index, id] of ids.entries()) {
    expect(colors[index]).toMatch(/^#[0-9a-f]{6}$/);
    expect(employeeColor(id)).toBe(colors[index]);
  }
});
