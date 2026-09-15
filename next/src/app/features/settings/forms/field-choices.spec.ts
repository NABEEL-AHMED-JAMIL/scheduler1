import { describe, it, expect } from 'vitest';
import {
  FieldChoice, TaskFormField,
  parseFieldChoices, serializeFieldChoices, validateSelectChoices,
} from './task-form-dialog';

/**
 * A select's choices are one free-text column, `task_form_field.field_options`, and until
 * 2026-09-14 one line of it was bound to an <option>'s value and its visible text at once -- so
 * an author could give the operator a readable dropdown or give the worker a token it could
 * parse, never both. The format grew a value/label split rather than a new column.
 *
 * Almost every test below is about the half of that decision nothing on screen shows: forms
 * already exist in the database written in the old format, tasks already hold answers matched
 * against those exact strings, and task-edit DELETES a task's tag when its control comes back
 * blank. A legacy line that stops resolving to itself therefore does not look like a parser bug
 * -- it looks like every task on that pipeline quietly losing an answer on its next save.
 */
describe('parseFieldChoices -- legacy data', () => {
  it('reads a line with no separator as both value and label, exactly as before', () => {
    // The whole back-compatibility guarantee in one assertion. Anything else here and a task
    // holding the tag "records" no longer matches the option it was saved from.
    expect(parseFieldChoices('records\nlines')).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ]);
  });

  it('still trims and drops blank lines the way the newline-only parser did', () => {
    expect(parseFieldChoices('  records  \n\n   \n lines ')).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ]);
  });

  it('reads CRLF-separated choices, which a Windows author\'s textarea produces', () => {
    expect(parseFieldChoices('first\r\nlast')).toEqual([
      { value: 'first', label: 'first' },
      { value: 'last', label: 'last' },
    ]);
  });

  it('returns nothing for null, undefined and empty options', () => {
    expect(parseFieldChoices(null)).toEqual([]);
    expect(parseFieldChoices(undefined)).toEqual([]);
    expect(parseFieldChoices('')).toEqual([]);
    expect(parseFieldChoices('   \n  ')).toEqual([]);
  });
});

describe('parseFieldChoices -- value and label', () => {
  it('splits a line at the first "=" into the stored value and the shown label', () => {
    expect(parseFieldChoices('lines=JSON Lines (one object per line)')).toEqual([
      { value: 'lines', label: 'JSON Lines (one object per line)' },
    ]);
  });

  it('keeps a label containing "=", ":" or "," whole, since only the first "=" splits', () => {
    // The separator is deliberately positional rather than escaped: everything after the first
    // "=" is the label verbatim, so the punctuation a real label carries needs no escaping.
    expect(parseFieldChoices('eq=Equals (a = b)')).toEqual([
      { value: 'eq', label: 'Equals (a = b)' },
    ]);
    expect(parseFieldChoices('ratio=Width:Height, as shipped')).toEqual([
      { value: 'ratio', label: 'Width:Height, as shipped' },
    ]);
    expect(parseFieldChoices('kv=key=value pairs, comma separated')).toEqual([
      { value: 'kv', label: 'key=value pairs, comma separated' },
    ]);
  });

  it('falls back to the value when the label half is empty', () => {
    expect(parseFieldChoices('records=')).toEqual([{ value: 'records', label: 'records' }]);
    expect(parseFieldChoices('records=   ')).toEqual([{ value: 'records', label: 'records' }]);
  });

  it('treats a line starting with "=" as legacy, since an empty value is not a value', () => {
    expect(parseFieldChoices('=Whatever')).toEqual([{ value: '=Whatever', label: '=Whatever' }]);
  });

  it('mixes legacy and value/label lines in one field', () => {
    // What a half-migrated form looks like: the author relabelled one choice and left the rest.
    expect(parseFieldChoices('records\nlines=JSON Lines')).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'JSON Lines' },
    ]);
  });

  it('trims around the separator', () => {
    expect(parseFieldChoices('  lines  =  JSON Lines  ')).toEqual([
      { value: 'lines', label: 'JSON Lines' },
    ]);
  });
});

describe('parseFieldChoices -- the comma-separated rows the ETL demo seeder wrote', () => {
  it('splits a single comma-joined token line, which used to render as one junk choice', () => {
    // etl_demo_catalogue.py wrote options="records,lines" for nine select fields; the seeder
    // posted it verbatim and the server stored it verbatim, so the newline-only split produced
    // a single option reading "records,lines" that the field's own default never matched.
    expect(parseFieldChoices('records,lines')).toEqual([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ]);
  });

  it('leaves a genuine one-line choice containing a comma alone', () => {
    // The guard that keeps the tolerance from becoming a second bug: a machine-written token
    // list has no whitespace in it, and a human label almost always does.
    expect(parseFieldChoices('Doe, John')).toEqual([{ value: 'Doe, John', label: 'Doe, John' }]);
    expect(parseFieldChoices('Lahore, Pakistan')).toEqual([
      { value: 'Lahore, Pakistan', label: 'Lahore, Pakistan' },
    ]);
  });

  it('does not comma-split once the line uses the value/label form', () => {
    expect(parseFieldChoices('csv=Comma,separated values')).toEqual([
      { value: 'csv', label: 'Comma,separated values' },
    ]);
  });

  it('does not comma-split when more than one line is present', () => {
    // Two lines means the author already wrote them one per line; a comma inside one is content.
    expect(parseFieldChoices('a,b\nc')).toEqual([
      { value: 'a,b', label: 'a,b' },
      { value: 'c', label: 'c' },
    ]);
  });
});

describe('serializeFieldChoices', () => {
  it('writes a choice whose label equals its value as a bare legacy line', () => {
    // So a form whose choices were plain and were never edited round-trips byte for byte, and
    // a diff of the column still means "somebody changed the choices".
    expect(serializeFieldChoices([
      { value: 'records', label: 'records' },
      { value: 'lines', label: 'lines' },
    ])).toBe('records\nlines');
  });

  it('writes value=label when the two differ', () => {
    expect(serializeFieldChoices([{ value: 'lines', label: 'JSON Lines' }])).toBe('lines=JSON Lines');
  });

  it('fills in either half from the other and drops a wholly empty row', () => {
    expect(serializeFieldChoices([
      { value: 'records', label: '' },
      { value: '', label: 'lines' },
      { value: '  ', label: '  ' },
    ])).toBe('records\nlines');
  });

  it('round-trips legacy options unchanged', () => {
    const legacy = 'eq\nne\ngt\ngte\nlt\nlte\ncontains\nstarts_with\nends_with';
    expect(serializeFieldChoices(parseFieldChoices(legacy))).toBe(legacy);
  });

  it('round-trips a label carrying the separator, a colon and a comma', () => {
    const stored = 'eq=Equals (a = b), exactly\nratio=Width:Height';
    expect(serializeFieldChoices(parseFieldChoices(stored))).toBe(stored);
  });
});

describe('validateSelectChoices', () => {
  function select(overrides: Partial<TaskFormField> = {}): TaskFormField[] {
    return [{
      tagKey: 'format', label: 'JSON shape', fieldType: 'select', required: false,
      position: 0, fieldOptions: 'records\nlines', defaultValue: null, ...overrides,
    }];
  }

  it('accepts a select whose choices and default line up', () => {
    expect(validateSelectChoices(select({ defaultValue: 'records' }))).toBeNull();
  });

  it('accepts a default matching the VALUE half of a value/label choice', () => {
    expect(validateSelectChoices(select({
      fieldOptions: 'records=JSON array\nlines=JSON Lines', defaultValue: 'records',
    }))).toBeNull();
  });

  it('rejects a select with no choices, which offers the operator only "None"', () => {
    // And if it is also required and has no default, that task can never be made valid.
    const problem = validateSelectChoices(select({ fieldOptions: null }));
    expect(problem).toContain('JSON shape');
    expect(problem).toContain('no choices');
  });

  it('rejects two choices sharing a stored value, since the second is unreachable', () => {
    const problem = validateSelectChoices(select({
      fieldOptions: 'records=JSON array\nrecords=Records',
    }));
    expect(problem).toContain('twice');
  });

  it('rejects a default that is not one of the choices', () => {
    // The silent one: the control is seeded with it, required passes because the string is
    // non-empty, no <option> matches so the dropdown paints blank, and an untouched save still
    // writes the value nobody was shown.
    const problem = validateSelectChoices(select({ defaultValue: 'Records' }));
    expect(problem).toContain('not one of its choices');
    expect(problem).toContain('Records');
  });

  it('rejects a default matching only a LABEL, the mistake the feature itself creates', () => {
    const problem = validateSelectChoices(select({
      fieldOptions: 'records=JSON array\nlines=JSON Lines', defaultValue: 'JSON array',
    }));
    expect(problem).toContain('not one of its choices');
  });

  it('ignores every field type but select', () => {
    expect(validateSelectChoices([{
      tagKey: 'bucket', label: 'Bucket', fieldType: 'text', required: false, position: 0,
      fieldOptions: null, defaultValue: 'etl-bucket',
    }])).toBeNull();
  });

  it('accepts the comma-separated options already seeded in live databases', () => {
    // The read-side tolerance has to reach the validator too, or editing an existing demo form
    // would be refused for a default the operator can plainly see in the list.
    expect(validateSelectChoices(select({
      fieldOptions: 'records,lines', defaultValue: 'records',
    }))).toBeNull();
  });
});

describe('the value/label format as a whole', () => {
  it('never changes what a legacy option stores, only what it shows', () => {
    // The property every existing task depends on, asserted directly: for any legacy field, the
    // stored values a task can match against are the lines themselves, unchanged.
    const legacy = 'sum\ncount\navg\nmin\nmax';
    const values = parseFieldChoices(legacy).map((c: FieldChoice) => c.value);
    expect(values).toEqual(legacy.split('\n'));
  });
});
