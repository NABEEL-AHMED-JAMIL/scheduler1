import { describe, it, expect } from 'vitest';
import { answerCell, figureColumns } from './ask-data.model';

/** UX review 2026-10-12: an answer's figures are rounded to sensible places and right-aligned; names and years are not. */
const Q = {
  sql: 'SELECT ...', dataset: { datasetId: 1, name: 'Encounters', connection: 's3', path: 'e.csv' },
  columns: ['primary_diagnosis', 'year', 'encounters', 'readmission_rate_pct'],
  rows: [['Diabetes', '2024', '1250', '36.347245665183365'], ['Heart failure', '2025', '980', '21.5'], ['COPD', '2025', null, '0.00412']],
  rowCount: 3, truncated: false, chart: null,
};

describe('Ask your data: the answer\'s table', () => {
  it('knows its figure columns: numbers, not names and not years', () => {
    expect(figureColumns(Q)).toEqual([false, false, true, true]);
    expect(figureColumns(Q)).toBe(figureColumns(Q));
  });

  it('rounds a figure as the dashboards do and leaves the rest as it came', () => {
    expect(answerCell('36.347245665183365', true)).toBe((36.35).toLocaleString(undefined, { minimumFractionDigits: 2 }));
    expect(answerCell('1250', true)).toBe((1250).toLocaleString());
    expect(answerCell('0.00412', true)).toBe((0.0041).toLocaleString(undefined, { minimumFractionDigits: 4 }));
    expect(answerCell('2024', false)).toBe('2024');
    expect(answerCell(null, true)).toBe('—');
  });
});
