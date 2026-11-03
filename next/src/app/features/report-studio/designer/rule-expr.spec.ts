import { describe, it, expect } from 'vitest';
import {
  ExprError, NotEvaluated, RuleSet, holds, isRuleField, parseExpression, readerFor, rulesOf, rulesOfCondition, toExpression, toRules,
} from './rule-expr';

/**
 * Feature 14: the rule builder writes media-service's expression language and reads back only what it wrote. The cases
 * below are the same as media-service's RuleBuilderExpressionsTest (the same texts, records and answers), so the designer's
 * "shows for N of M" and the server agree.
 */
const records = [
  { patient_id: 'P-1042', wound: { stage: 3, area_cm2: 4.2, site: 'Left heel', infected: true }, hba1c: 8.4, note: "Patient's dressing changed", seen: '2026-09-15' },
  { patient_id: 'P-1077', wound: { stage: 1, area_cm2: 0.8, site: 'Sacrum', infected: false }, hba1c: 6.1, note: '', seen: '2026-09-02' },
  { patient_id: 'P-1103', wound: { stage: 4, area_cm2: 11, site: 'Right heel', infected: null }, hba1c: '9.0', note: 'Re-measure', seen: '2026-10-01' },
  { patient_id: 'P-1160', wound: { stage: 2, site: 'Left heel' }, hba1c: null, seen: '2026-08-30' },
];

/** Each builder-written text, the rows it is, and which of the four records it holds for. */
export const CASES: { text: string; rules: RuleSet; holds: boolean[] }[] = [
  { text: 'primary.wound.stage in (3, 4)', rules: { join: 'all', rows: [{ field: 'primary.wound.stage', test: 'in', values: [3, 4] }] },
    holds: [true, false, true, false] },
  { text: 'primary.hba1c > 8', rules: { join: 'all', rows: [{ field: 'primary.hba1c', test: 'gt', values: [8] }] }, holds: [true, false, true, false] },
  { text: 'primary.wound.site = \'Left heel\' and primary.wound.stage >= 3',
    rules: { join: 'all', rows: [{ field: 'primary.wound.site', test: 'eq', values: ['Left heel'] }, { field: 'primary.wound.stage', test: 'gte', values: [3] }] },
    holds: [true, false, false, false] },
  { text: 'primary.wound.infected = true or primary.wound.area_cm2 > 10',
    rules: { join: 'any', rows: [{ field: 'primary.wound.infected', test: 'eq', values: [true] }, { field: 'primary.wound.area_cm2', test: 'gt', values: [10] }] },
    holds: [true, false, true, false] },
  { text: '(primary.hba1c >= 6.5 and primary.hba1c <= 9)', rules: { join: 'all', rows: [{ field: 'primary.hba1c', test: 'between', values: [6.5, 9] }] },
    holds: [true, false, true, false] },
  { text: 'primary.note is null', rules: { join: 'all', rows: [{ field: 'primary.note', test: 'empty', values: [] }] }, holds: [false, true, false, true] },
  { text: 'primary.wound.area_cm2 is not null', rules: { join: 'all', rows: [{ field: 'primary.wound.area_cm2', test: 'notEmpty', values: [] }] },
    holds: [true, true, true, false] },
  { text: 'contains(primary.wound.site, \'heel\')', rules: { join: 'all', rows: [{ field: 'primary.wound.site', test: 'contains', values: ['heel'] }] },
    holds: [true, false, true, true] },
  { text: 'primary.patient_id not in (\'P-1042\', \'P-1160\')',
    rules: { join: 'all', rows: [{ field: 'primary.patient_id', test: 'notIn', values: ['P-1042', 'P-1160'] }] }, holds: [false, true, true, false] },
  { text: 'primary.note = \'Patient\\\'s dressing changed\'', rules: { join: 'all', rows: [{ field: 'primary.note', test: 'eq', values: ["Patient's dressing changed"] }] },
    holds: [true, false, false, false] },
  { text: 'primary.seen < \'2026-09-10\' or starts_with(primary.patient_id, \'P-11\')',
    rules: { join: 'any', rows: [{ field: 'primary.seen', test: 'lt', values: ['2026-09-10'] }, { field: 'primary.patient_id', test: 'startsWith', values: ['P-11'] }] },
    holds: [false, true, true, true] },
  { text: 'primary.wound.stage != 1 and (primary.wound.area_cm2 >= 1 and primary.wound.area_cm2 <= 12) and ends_with(primary.wound.site, \'heel\')',
    rules: { join: 'all', rows: [{ field: 'primary.wound.stage', test: 'ne', values: [1] }, { field: 'primary.wound.area_cm2', test: 'between', values: [1, 12] },
      { field: 'primary.wound.site', test: 'endsWith', values: ['heel'] }] },
    holds: [true, false, true, false] },
  { text: 'primary.wound.stage > -1', rules: { join: 'all', rows: [{ field: 'primary.wound.stage', test: 'gt', values: [-1] }] }, holds: [true, true, true, true] },
];

describe('rule builder <-> expression', () => {
  for (const c of CASES) {
    it(`round-trips ${c.text}`, () => {
      expect(toExpression(c.rules)).toBe(c.text);
      expect(rulesOf(c.text)).toEqual(c.rules);
      expect(toExpression(rulesOf(toExpression(c.rules))!)).toBe(c.text);
    });
    it(`counts ${c.text} as the server does`, () => {
      const ast = parseExpression(c.text);
      expect(records.map(r => holds(ast, readerFor(r, ['primary'])))).toEqual(c.holds);
    });
  }

  it('reads hand-written spellings of the same rows (==, <>, AND, extra spaces, a whole expression in brackets)', () => {
    expect(rulesOf("primary.a == 1 AND primary.b <> 'x'")).toEqual({ join: 'all', rows: [
      { field: 'primary.a', test: 'eq', values: [1] }, { field: 'primary.b', test: 'ne', values: ['x'] }] });
    expect(rulesOf('( primary.a = 1 or primary.b = 2 )')?.join).toBe('any');
    expect(rulesOf('(primary.a >= 1 and primary.b <= 2)')?.rows.map(r => r.test)).toEqual(['gte', 'lte']);
    expect(rulesOf('primary.a = null')).toEqual({ join: 'all', rows: [{ field: 'primary.a', test: 'empty', values: [] }] });
    expect(rulesOf('primary.a != null')).toEqual({ join: 'all', rows: [{ field: 'primary.a', test: 'notEmpty', values: [] }] });
  });

  it('refuses what it cannot show, so a hand-written expression is never rewritten', () => {
    for (const text of [
      'primary.a = 1 and primary.b = 2 or primary.c = 3',      // and/or mixed without brackets
      'primary.a = 1 and (primary.b = 2 or primary.c = 3)',    // a bracketed group that is not a between
      'not primary.a = 1',
      'primary.a + 1 > 2',
      'primary.a > primary.b',                                  // field against field
      'lower(primary.site) = \'north\'',
      'days_between(primary.seen, \'2026-10-01\') > 30',
      'primary.x = 1 and (primary.a >= 1 and primary.b <= 2)', // two fields: not a between
      'primary.x = 1 or (primary.a <= 1 and primary.a >= 2)',  // at most then at least: not a between
      'primary.a in (1, primary.b)',
      '1 = primary.a',
      '(primary.a = 1)',
    ]) {
      expect(rulesOf(text), text).toBeNull();
    }
  });

  it('parses as the server does: the same refusals and messages', () => {
    expect(() => parseExpression('')).toThrow(ExprError);
    expect(() => parseExpression('primary.a < 1 < 2')).toThrow(/cannot be chained/);
    expect(() => parseExpression('getClass()')).toThrow(/not a function/);
    expect(() => parseExpression('primary.a.b()')).toThrow(/is a path/);
    expect(() => parseExpression("primary.a = 'open")).toThrow(/not closed/);
    expect(() => parseExpression('primary.a = 1abc')).toThrow(/runs into a name/);
    expect(() => parseExpression('primary.a = 1 )')).toThrow(/Unexpected/);
    expect(() => parseExpression('x'.repeat(2001))).toThrow(/2000/);
    expect(parseExpression("primary['wound site'][0].x is null").k).toBe('null');
  });

  it('writes nothing for an unfinished row', () => {
    expect(() => toExpression({ join: 'all', rows: [] })).toThrow(/Add a rule/);
    expect(() => toExpression({ join: 'all', rows: [{ field: '', test: 'eq', values: [1] }] })).toThrow(/Choose a field/);
    expect(() => toExpression({ join: 'all', rows: [{ field: 'primary.a', test: 'eq', values: [] }] })).toThrow(/Give the value/);
    const sparse: (number)[] = [];
    sparse[1] = 5;
    expect(() => toExpression({ join: 'all', rows: [{ field: 'primary.a', test: 'between', values: sparse }] })).toThrow(/Give the value/);
    expect(() => toExpression({ join: 'all', rows: [{ field: 'primary.a; drop', test: 'eq', values: [1] }] })).toThrow(/not a data path/);
    expect(() => toExpression({ join: 'all', rows: [{ field: 'primary.a', test: 'contains', values: [3] }] })).toThrow(/compares texts/);
  });

  it('a value can never become an operator: quotes and backslashes are escaped', () => {
    const text = toExpression({ join: 'all', rows: [{ field: 'primary.a', test: 'eq', values: ["x' or 1 = 1 or 'y\\"] }] });
    expect(text).toBe("primary.a = 'x\\' or 1 = 1 or \\'y\\\\'");
    expect(rulesOf(text)?.rows[0].values).toEqual(["x' or 1 = 1 or 'y\\"]);
  });

  it('accepts only data paths as fields', () => {
    expect(isRuleField('primary.wound.stage')).toBe(true);
    expect(isRuleField('item.visits[0].date')).toBe(true);
    expect(isRuleField("primary['wound site']")).toBe(true);
    expect(isRuleField('primary.a = 1')).toBe(false);
    expect(isRuleField('true')).toBe(false);
    expect(isRuleField('contains(primary.a, 1)')).toBe(false);
  });

  it('reads a structured condition as one row', () => {
    expect(rulesOfCondition({ left: 'primary.summary.value', operator: 'gt', right: 0 }))
      .toEqual({ join: 'all', rows: [{ field: 'primary.summary.value', test: 'gt', values: [0] }] });
    expect(rulesOfCondition({ left: 'primary.flag', operator: 'isNotNull' })?.rows[0].test).toBe('notEmpty');
    expect(rulesOfCondition({ left: 'primary.site', operator: 'in', right: ['North', 'South'] })?.rows[0].values).toEqual(['North', 'South']);
    expect(rulesOfCondition({ left: 'primary.site', operator: 'eq', right: null })?.rows[0].test).toBe('empty');
    expect(rulesOfCondition({ left: 'primary.rows[*].x', operator: 'eq', right: 1 })).toBeNull();
    expect(rulesOfCondition({ left: 'primary.site', operator: 'contains', right: 3 })).toBeNull();
  });

  it('reads a repeat item by its name and the rest from the record; does not count what it does not evaluate', () => {
    const read = readerFor({ site: 'North' }, ['primary'], { item: { stage: 4 } });
    expect(holds(parseExpression("item.stage >= 3 and primary.site = 'North' and site = 'North'"), read)).toBe(true);
    expect(() => holds(parseExpression('primary.a + 1 > 2'), read)).toThrow(NotEvaluated);
    // A list or an object is not a value: it is empty to "is null", as on the server.
    expect(holds(parseExpression('primary.wound is null'), readerFor(records[0], ['primary']))).toBe(true);
    expect(toRules(parseExpression('primary.a = 1'))?.rows.length).toBe(1);
  });
});
