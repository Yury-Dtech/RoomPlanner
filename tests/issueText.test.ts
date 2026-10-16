import { describe, expect, test } from 'vitest';
import sample from '../src/data/project.json';
import type { CatalogEntry, Project } from '../src/data/schema';
import { issueMessage } from '../src/ui/issueText';

const project = sample as unknown as Project;
const catalog: CatalogEntry[] = [
  {
    id: 'bed-double',
    name: 'Кровать двуспальная',
    category: 'Спальня',
    model: '',
    defaultSize: { w: 1600, h: 450, d: 2000 },
    source: '',
    license: 'CC0',
  },
];

describe('issueMessage', () => {
  test('outside the room', () => {
    expect(issueMessage({ kind: 'outside-room' }, project, catalog)).toBe('Выходит за стены');
  });

  test('overlap names the other item by its catalog name and id', () => {
    expect(issueMessage({ kind: 'overlap', otherId: 'bed-1' }, project, catalog)).toBe(
      'Пересекается с «Кровать двуспальная» (bed-1)',
    );
  });

  test('overlap falls back to the id when the catalog entry is unknown', () => {
    // desk-basic is not in this catalog.
    expect(issueMessage({ kind: 'overlap', otherId: 'desk-1' }, project, catalog)).toBe('Пересекается с desk-1');
    expect(issueMessage({ kind: 'overlap', otherId: 'ghost' }, project, [])).toBe('Пересекается с ghost');
  });

  test('blocking an opening says door or window', () => {
    expect(issueMessage({ kind: 'blocks-opening', otherId: 'door-1' }, project, catalog)).toBe(
      'Перекрывает дверь door-1',
    );
    expect(issueMessage({ kind: 'blocks-opening', otherId: 'window-1' }, project, catalog)).toBe(
      'Перекрывает окно window-1',
    );
  });

  test('an unknown opening is still reported', () => {
    expect(issueMessage({ kind: 'blocks-opening', otherId: 'gone' }, project, catalog)).toBe(
      'Перекрывает проём gone',
    );
  });
});
