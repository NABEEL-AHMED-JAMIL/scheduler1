import { describe, it, expect } from 'vitest';
import { columnLabel } from './column-label';

describe('columnLabel (UX review B5: labels, not raw names)', () => {
  it('turns raw column names into headings', () => {
    expect(columnLabel('RISK_LEVEL')).toBe('Risk level');
    expect(columnLabel('patient_id')).toBe('Patient ID');
    expect(columnLabel('lastVisitDate')).toBe('Last visit date');
    expect(columnLabel('HBA1C')).toBe('HbA1c');
    expect(columnLabel('avg_sbp')).toBe('Average SBP');
  });

  it('keeps a name that already reads as words', () => {
    expect(columnLabel('Patients')).toBe('Patients');
    expect(columnLabel('Risk level')).toBe('Risk level');
    expect(columnLabel('age')).toBe('age');
    expect(columnLabel('')).toBe('');
  });
});
