import { describe, it, expect } from 'vitest';
import {
  RunParameter, defaultText, initialValues, parameterLabel, parametersOf, valueProblem, valueProblems, valuesBody, valuesText,
} from './run-parameters';

/** MIG-347: a pipeline's run parameters in the console -- read from Core, checked as Core checks them, sent as Core takes them. */
const REGION: RunParameter = { name: 'region', type: 'choice', choices: ['north', 'south'], default: 'north', label: 'Region' };
const SINCE: RunParameter = { name: 'since', type: 'date', required: true };
const LIMIT: RunParameter = { name: 'limit', type: 'number', default: 10 };
const DRY: RunParameter = { name: 'dry_run', type: 'boolean', default: false };
const AT: RunParameter = { name: 'at', type: 'datetime', default: '2026-10-01T09:30:00' };
const NOTE: RunParameter = { name: 'note', type: 'text' };
const ALL = [REGION, SINCE, LIMIT, DRY, AT, NOTE];

describe('run parameters', () => {
  it('reads the declared parameters from an answer and leaves out what is not one', () => {
    expect(parametersOf({ parameters: [REGION, { name: 'Bad Name', type: 'text' }, null, { type: 'text' }] })).toEqual([REGION]);
    expect(parametersOf({ steps: [] })).toEqual([]);
    expect(parametersOf(null)).toEqual([]);
  });

  it('starts each input at its default, as an input holds it', () => {
    expect(initialValues(ALL)).toEqual({ region: 'north', since: '', limit: '10', dry_run: 'false', at: '2026-10-01T09:30', note: '' });
    expect(parameterLabel(REGION)).toBe('Region');
    expect(parameterLabel(SINCE)).toBe('since');
    expect(defaultText(NOTE)).toBe('');
  });

  it('checks each type as the server does', () => {
    expect(valueProblem(SINCE, '')).toBe('Required.');
    expect(valueProblem(SINCE, '2026-10-01')).toBe('');
    expect(valueProblem(SINCE, '1 Oct')).toBe('A date, as 2026-10-01.');
    expect(valueProblem(LIMIT, 'ten')).toBe('A number.');
    expect(valueProblem(LIMIT, '')).toBe('');
    expect(valueProblem(REGION, 'east')).toBe('One of north, south.');
    expect(valueProblem(AT, '2026-10-01 9:30')).toBe('A date and time, as 2026-10-01T09:30.');
    expect(valueProblem(NOTE, 'a {{param.x}}')).toBe("Text without '{{'.");
    expect(valueProblem(NOTE, 'two\nlines')).toBe('One line of text.');
    expect(valueProblem(NOTE, 'x'.repeat(501))).toBe('At most 500 characters.');
    expect(valueProblems(ALL, initialValues(ALL))).toEqual({ since: 'Required.' });
  });

  it('sends only what differs from the default, so a run with the defaults sends none', () => {
    expect(valuesBody(ALL, initialValues(ALL))).toBeNull();
    const values = { ...initialValues(ALL), since: '2026-10-01', region: 'south', at: '2026-10-02T08:00', note: "O'Brien" };
    expect(valuesBody(ALL, values)).toEqual({ since: '2026-10-01', region: 'south', at: '2026-10-02T08:00:00', note: "O'Brien" });
    expect(valuesText({ region: 'south', limit: '5' })).toBe('region = south, limit = 5');
    expect(valuesText(null)).toBe('');
  });
});
