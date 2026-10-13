import { describe, it, expect } from 'vitest';
import { daysProblem, daysText, draftDays, holdTarget, keepText, previewLine, readable, stateOf } from './retention.model';

describe('retention.model (MIG-354)', () => {
  it('says how long a class is kept', () => {
    expect(keepText({ configurable: true, keepDays: null })).toBe('Forever');
    expect(keepText({ configurable: true, keepDays: 90 })).toBe('90 days');
    expect(keepText({ configurable: true, keepDays: 1 })).toBe('1 day');
    expect(keepText({ configurable: false, keepDays: null })).toBe('Bounded by the platform');
    expect(daysText(365)).toBe('1 year');
    expect(daysText(2190)).toBe('6 years');
    expect(daysText(2200)).toBe('2,200 days');
  });

  it('checks the days a person types, with the audit floor', () => {
    const runs = { dataClass: 'RUN_LOGS' as const, label: 'Run logs', minDays: null };
    const audit = { dataClass: 'AUDIT' as const, label: 'Audit records', minDays: 2190 };
    expect(daysProblem(runs, '')).toBe('');
    expect(daysProblem(runs, '30')).toBe('');
    expect(daysProblem(runs, '0')).toContain('1 to 36,500');
    expect(daysProblem(runs, '1.5')).toContain('whole number');
    expect(daysProblem(runs, 'ten')).toContain('whole number');
    expect(daysProblem(audit, '400')).toBe('At least 2,190 days (the platform\'s minimum for audit records).');
    expect(daysProblem(audit, '2190')).toBe('');
    expect(daysProblem(audit, '')).toBe('');
    expect(draftDays(' 30 ')).toBe(30);
    expect(draftDays('')).toBeNull();
  });

  it('names states, previews and holds in the console\'s words', () => {
    expect(stateOf('PAUSED')).toEqual({ label: 'Needs confirmation', tone: 'warn' });
    expect(stateOf('FAILED').tone).toBe('crit');
    expect(stateOf(undefined).label).toBe('Not run yet');
    const base = { dataClass: 'FILES' as const, keepDays: 30, cutoff: null, deleted: 0, oldest: null, note: null, finishedAt: null };
    expect(previewLine({ ...base, state: 'READY', eligible: 3, total: 10, bytes: 2048 })).toBe('3 of 10, 2.0 KB');
    expect(previewLine({ ...base, state: 'NOTHING', eligible: 0, total: 10, bytes: 0 })).toBe('Nothing older');
    expect(previewLine({ ...base, state: 'OFF', eligible: 0, total: 0, bytes: null })).toBe('Kept forever');
    expect(previewLine({ ...base, state: 'UNAVAILABLE', eligible: 0, total: 0, bytes: null })).toBe('Its service cannot count it yet');
    expect(holdTarget({ scope: 'WORKSPACE', jobId: null, runId: null })).toBe('The whole workspace');
    expect(holdTarget({ scope: 'PIPELINE', jobId: 7, runId: null }, 'Claims intake')).toBe('Pipeline "Claims intake"');
    expect(holdTarget({ scope: 'RUN', jobId: null, runId: 8209 })).toBe('Run #8209');
    expect(readable('Run logs: forever -> 30 day(s) -- saved.')).toBe('Run logs: forever → 30 day(s) — saved.');
  });
});
