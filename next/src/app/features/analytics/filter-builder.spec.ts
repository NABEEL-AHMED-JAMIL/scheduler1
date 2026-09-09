import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import {
  FILTER_OPERATORS, FilterBuilder, MAX_GROUP_DEPTH, RELATIVE_WINDOWS, clauseComplete,
  countFilterClauses, describeClause, emptyFilterGroup, newFilterClause, pruneFilters,
} from './filter-builder';
import {
  DatasetColumn, FilterClause, FilterGroup, OPERAND_COUNT, clauseToWire, filtersToWire,
  isFilterGroup,
} from './analytics.service';

/**
 * The filter builder, which is the piece the audit says unblocks about seventy items.
 *
 * Three things are pinned here and they are pinned in descending order of how quietly they can go
 * wrong.
 *
 * THE PRUNE, first, because it is the one that decides what reaches the server. A half-typed
 * BETWEEN is not a generous filter to be interpreted, it is a range with no top, and sending it
 * would apply a predicate nobody wrote to rows a reader will then take as the whole answer.
 * Dropping it silently is the same mistake pointed the other way, so the count of what is sent
 * and the count of what is on screen are both derived from these functions and are shown side by
 * side.
 *
 * THE OPERATOR SWITCH, second. Changing EQ to BETWEEN leaves a value behind, and carrying it over
 * as a lower bound would be the component deciding what somebody meant. The reverse is worse: a
 * second bound left on a clause that now shows one input is an operand the reader cannot see and
 * cannot clear, and it would be sent.
 *
 * THE WIRE SHAPE, third, and it is pinned precisely BECAUSE it is the one guess this client made
 * past the contract. The contract shows `{field, operator, value}` and says nothing about how IN
 * carries a list or BETWEEN two bounds. The rule chosen -- one operand as `value`, many as
 * `values` -- lives in one function, and these tests are what make replacing it a single edit
 * rather than an archaeology exercise.
 */

const COLUMNS: DatasetColumn[] = [
  { name: 'region', type: 'VARCHAR' },
  { name: 'amount', type: 'DECIMAL(18,3)' },
  { name: 'booked_on', type: 'DATE' },
];

function builderWith(model: FilterGroup, columns: DatasetColumn[] = COLUMNS) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  const fixture = TestBed.createComponent(FilterBuilder);
  fixture.componentRef.setInput('model', model);
  fixture.componentRef.setInput('columns', columns);
  const emitted: FilterGroup[] = [];
  fixture.componentInstance.changed.subscribe(group => emitted.push(group));
  fixture.detectChanges();
  return {
    builder: fixture.componentInstance,
    emitted,
    /** The last group the builder handed out -- what a parent would have stored. */
    last: () => emitted[emitted.length - 1],
    text: () => ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' '),
    apply(group: FilterGroup) {
      fixture.componentRef.setInput('model', group);
      fixture.detectChanges();
    },
  };
}

// ---------------------------------------------------------------------------------------------

describe('the fourteen operators document 07 lists', () => {
  it('offers exactly those fourteen, and no others', () => {
    // Not a count check. A fifteenth invented here is a request the server has no branch for,
    // and it would be refused at the far end of a round trip rather than at the picker.
    expect(FILTER_OPERATORS.map(operator => operator.id)).toEqual([
      'EQ', 'NEQ', 'CONTAINS', 'STARTS_WITH', 'GT', 'LT', 'BETWEEN',
      'IN', 'NOT_IN', 'IS_NULL', 'IS_NOT_NULL', 'DATE_RANGE', 'RELATIVE_DATE', 'NUMERIC_RANGE',
    ]);
  });

  it('knows how many operands each one takes', () => {
    // The one table the builder, the completeness check and the wire format all read.
    expect(OPERAND_COUNT['IS_NULL']).toBe(0);
    expect(OPERAND_COUNT['IS_NOT_NULL']).toBe(0);
    expect(OPERAND_COUNT['EQ']).toBe(1);
    expect(OPERAND_COUNT['RELATIVE_DATE']).toBe(1);
    expect(OPERAND_COUNT['BETWEEN']).toBe(2);
    expect(OPERAND_COUNT['DATE_RANGE']).toBe(2);
    expect(OPERAND_COUNT['NUMERIC_RANGE']).toBe(2);
    expect(OPERAND_COUNT['IN']).toBe('many');
    expect(OPERAND_COUNT['NOT_IN']).toBe('many');
  });

  it('puts every one of them on the screen, in English', () => {
    const view = builderWith({ op: 'AND', clauses: [newFilterClause('region')] });
    const text = view.text();
    for (const operator of FILTER_OPERATORS) {
      expect(text, `"${operator.label}" is missing from the operator list`)
        .toContain(operator.label);
    }
  });
});

describe('a clause is complete or it is not sent', () => {
  it('needs nothing typed for the two operators that take no operand', () => {
    expect(clauseComplete({ field: 'region', operator: 'IS_NULL' })).toBe(true);
    expect(clauseComplete({ field: 'region', operator: 'IS_NOT_NULL' })).toBe(true);
  });

  it('needs the one operand for a one-operand operator', () => {
    expect(clauseComplete({ field: 'region', operator: 'EQ', value: '' })).toBe(false);
    expect(clauseComplete({ field: 'region', operator: 'EQ', value: '   ' })).toBe(false);
    expect(clauseComplete({ field: 'region', operator: 'EQ', value: 'north' })).toBe(true);
  });

  it('refuses a range with only one bound rather than inventing the other', () => {
    // The whole point of the prune. A BETWEEN with a low and no high is not "everything above
    // the low" -- that is LT's job, and guessing it here would apply a predicate nobody wrote.
    expect(clauseComplete({ field: 'amount', operator: 'BETWEEN', values: ['10'] })).toBe(false);
    expect(clauseComplete({ field: 'amount', operator: 'BETWEEN', values: ['10', ''] })).toBe(false);
    expect(clauseComplete({ field: 'amount', operator: 'BETWEEN', values: ['10', '20'] })).toBe(true);
  });

  it('needs at least one value for a list operator', () => {
    expect(clauseComplete({ field: 'region', operator: 'IN', values: [] })).toBe(false);
    expect(clauseComplete({ field: 'region', operator: 'IN', values: ['north'] })).toBe(true);
  });

  it('needs a field, whatever the operator', () => {
    expect(clauseComplete({ field: '', operator: 'IS_NULL' })).toBe(false);
  });
});

describe('pruning, which decides what reaches the server', () => {
  it('drops an unfinished clause and keeps the finished ones beside it', () => {
    const group: FilterGroup = {
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        { field: 'amount', operator: 'BETWEEN', values: ['10'] },
        { field: 'booked_on', operator: 'IS_NOT_NULL' },
      ],
    };

    expect(pruneFilters(group).clauses).toEqual([
      { field: 'region', operator: 'EQ', value: 'north' },
      { field: 'booked_on', operator: 'IS_NOT_NULL' },
    ]);
  });

  it('drops a group that pruning has emptied, rather than sending an empty one', () => {
    // An empty group on the wire is a filter that means nothing, and a server reading it as one
    // is a server deciding what "no clauses" implies.
    const group: FilterGroup = {
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        { op: 'OR', clauses: [{ field: 'amount', operator: 'GT', value: '' }] },
      ],
    };

    expect(pruneFilters(group).clauses).toHaveLength(1);
  });

  it('keeps a nested group that still has something in it, and its own operator', () => {
    const group: FilterGroup = {
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        {
          op: 'OR',
          clauses: [
            { field: 'amount', operator: 'GT', value: '100' },
            { field: 'amount', operator: 'LT', value: '' },
          ],
        },
      ],
    };
    const pruned = pruneFilters(group);
    const nested = pruned.clauses[1];

    expect(isFilterGroup(nested)).toBe(true);
    expect((nested as FilterGroup).op).toBe('OR');
    expect((nested as FilterGroup).clauses).toHaveLength(1);
  });

  it('counts what is on screen, including the clauses inside groups', () => {
    const group: FilterGroup = {
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        {
          op: 'OR',
          clauses: [
            { field: 'amount', operator: 'GT', value: '100' },
            { op: 'AND', clauses: [{ field: 'booked_on', operator: 'IS_NULL' }] },
          ],
        },
      ],
    };

    // Three clauses across three levels, and the count reaches all of them. It counts what is
    // ON SCREEN, which is why the unfinished one below is included here and not in the pruned
    // count beside it -- the gap between the two is what the Canvas shows the reader.
    expect(countFilterClauses(group)).toBe(3);
    expect(countFilterClauses(pruneFilters(group))).toBe(3);

    const withUnfinished: FilterGroup = {
      op: 'AND',
      clauses: [...group.clauses, { field: 'amount', operator: 'BETWEEN', values: ['10'] }],
    };
    expect(countFilterClauses(withUnfinished)).toBe(4);
    expect(countFilterClauses(pruneFilters(withUnfinished))).toBe(3);
  });
});

describe('the wire shape, which is the one guess past the contract', () => {
  it('sends a single operand as value', () => {
    expect(clauseToWire({ field: 'country', operator: 'EQ', value: 'US' }))
      .toEqual({ field: 'country', operator: 'EQ', value: 'US' });
  });

  it('sends no operand at all for the two that take none', () => {
    expect(clauseToWire({ field: 'region', operator: 'IS_NULL', value: 'ignored' }))
      .toEqual({ field: 'region', operator: 'IS_NULL' });
  });

  it('sends a list as values, and two bounds as exactly [low, high]', () => {
    expect(clauseToWire({ field: 'region', operator: 'IN', values: ['north', 'south'] }))
      .toEqual({ field: 'region', operator: 'IN', values: ['north', 'south'] });
    expect(clauseToWire({ field: 'amount', operator: 'NUMERIC_RANGE', values: ['10', '20'] }))
      .toEqual({ field: 'amount', operator: 'NUMERIC_RANGE', values: ['10', '20'] });
  });

  it('drops an empty operand rather than sending it blank', () => {
    // The same rule the join half of a query follows: an empty string is PRESENT, and a server
    // reading presence as intent would see a BETWEEN with a blank bound as a bound of blank.
    expect(clauseToWire({ field: 'amount', operator: 'BETWEEN', values: ['10', ''] }))
      .toEqual({ field: 'amount', operator: 'BETWEEN', values: ['10'] });
    expect(clauseToWire({ field: 'region', operator: 'EQ', value: '' }))
      .toEqual({ field: 'region', operator: 'EQ' });
  });

  it('nests a group inside a group, which is what makes a OR b expressible', () => {
    const wire = filtersToWire({
      op: 'AND',
      clauses: [
        { field: 'country', operator: 'EQ', value: 'US' },
        {
          op: 'OR',
          clauses: [
            { field: 'region', operator: 'EQ', value: 'north' },
            { field: 'region', operator: 'EQ', value: 'south' },
          ],
        },
      ],
    });

    expect(wire).toEqual({
      op: 'AND',
      clauses: [
        { field: 'country', operator: 'EQ', value: 'US' },
        {
          op: 'OR',
          clauses: [
            { field: 'region', operator: 'EQ', value: 'north' },
            { field: 'region', operator: 'EQ', value: 'south' },
          ],
        },
      ],
    });
  });
});

describe('editing: a model goes in and a new model comes out', () => {
  it('never mutates the group it was handed', () => {
    // The parent holds one signal and compares what is on screen against what it is about to
    // send. An in-place mutation makes those the same object and the comparison impossible.
    const model: FilterGroup = { op: 'AND', clauses: [] };
    const view = builderWith(model);
    view.builder.addClause();

    expect(model.clauses).toEqual([]);
    expect(view.last().clauses).toHaveLength(1);
  });

  it('adds a clause on the first column, at the operator that needs least explaining', () => {
    const view = builderWith(emptyFilterGroup());
    view.builder.addClause();

    expect(view.last().clauses[0]).toEqual({ field: 'region', operator: 'EQ', value: '' });
  });

  it('adds nothing when there are no columns to write a condition against', () => {
    const view = builderWith(emptyFilterGroup(), []);
    view.builder.addClause();

    expect(view.emitted).toHaveLength(0);
    expect(view.text()).toContain('Open a dataset first');
  });

  it('switches AND to OR without touching the clauses under it', () => {
    const clause: FilterClause = { field: 'region', operator: 'EQ', value: 'north' };
    const view = builderWith({ op: 'AND', clauses: [clause] });
    view.builder.setOp('OR');

    expect(view.last().op).toBe('OR');
    expect(view.last().clauses).toEqual([clause]);
  });

  it('says which way the group joins, in words rather than only as a highlighted button', () => {
    const view = builderWith({ op: 'AND', clauses: [] });
    expect(view.text()).toContain('every condition below must hold');

    view.apply({ op: 'OR', clauses: [] });
    expect(view.text()).toContain('any one condition below is enough');
  });

  it('removes the clause at the index asked for and no other', () => {
    const view = builderWith({
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        { field: 'amount', operator: 'GT', value: '10' },
        { field: 'booked_on', operator: 'IS_NULL' },
      ],
    });
    view.builder.removeAt(1);

    expect(view.last().clauses).toEqual([
      { field: 'region', operator: 'EQ', value: 'north' },
      { field: 'booked_on', operator: 'IS_NULL' },
    ]);
  });
});

describe('changing the operator drops the operands it cannot use', () => {
  it('does not turn a single value into a lower bound', () => {
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'amount', operator: 'EQ', value: '100' }],
    });
    view.builder.setOperator(0, 'BETWEEN');

    expect(view.last().clauses[0]).toEqual({ field: 'amount', operator: 'BETWEEN' });
  });

  it('does not leave a second bound behind on a one-input clause', () => {
    // The dangerous direction. A stale upper bound on a clause that now shows one input is an
    // operand the reader cannot see, cannot clear, and would have sent.
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'amount', operator: 'BETWEEN', values: ['10', '20'] }],
    });
    view.builder.setOperator(0, 'GT');

    expect(view.last().clauses[0]).toEqual({ field: 'amount', operator: 'GT' });
  });

  it('keeps the typed value when both operators take one free-text operand', () => {
    // The control. A rule that dropped everything would be safe and would also make the picker
    // useless: retyping "north" to switch from is to is-not is a control that punishes a fix.
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'region', operator: 'EQ', value: 'north' }],
    });
    view.builder.setOperator(0, 'NEQ');

    expect(view.last().clauses[0]).toEqual({
      field: 'region', operator: 'NEQ', value: 'north',
    });
  });

  it('does not carry a free-text value into a relative-date window, or back out', () => {
    // A window is a token out of a closed list, not text somebody typed. Carrying "north" across
    // would leave a clause whose select shows nothing while its value says something.
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'booked_on', operator: 'EQ', value: '2024-01-01' }],
    });
    view.builder.setOperator(0, 'RELATIVE_DATE');
    expect(view.last().clauses[0]).toEqual({ field: 'booked_on', operator: 'RELATIVE_DATE' });

    view.apply(view.last());
    view.builder.setOperator(0, 'EQ');
    expect(view.last().clauses[0]).toEqual({ field: 'booked_on', operator: 'EQ' });
  });

  it('keeps a list when moving between the two list operators', () => {
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'region', operator: 'IN', values: ['north', 'south'] }],
    });
    view.builder.setOperator(0, 'NOT_IN');

    expect(view.last().clauses[0]).toEqual({
      field: 'region', operator: 'NOT_IN', values: ['north', 'south'],
    });
  });

  it('keeps both bounds when moving between two-bound operators', () => {
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'amount', operator: 'BETWEEN', values: ['10', '20'] }],
    });
    view.builder.setOperator(0, 'NUMERIC_RANGE');

    expect(view.last().clauses[0]).toEqual({
      field: 'amount', operator: 'NUMERIC_RANGE', values: ['10', '20'],
    });
  });
});

describe('the list operand, and what a comma cannot express', () => {
  it('splits on commas and trims each value', () => {
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'region', operator: 'IN', values: [] }],
    });
    view.builder.setList(0, ' north , south ');

    expect((view.last().clauses[0] as FilterClause).values).toEqual(['north', 'south']);
  });

  it('drops a blank entry rather than filtering for the empty string', () => {
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'region', operator: 'IN', values: [] }],
    });
    view.builder.setList(0, 'north, , south,');

    expect((view.last().clauses[0] as FilterClause).values).toEqual(['north', 'south']);
  });

  it('says on screen that a value containing a comma cannot be written here', () => {
    // The limitation is real and is stated rather than discovered. A reader whose category is
    // "Lima, Peru" needs to know before they type it, not after it silently became two.
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'region', operator: 'IN', values: ['north'] }],
    });

    expect(view.text()).toContain('a value that itself contains a comma cannot be written');
  });
});

describe('nesting, which is what a flat filter bar cannot do', () => {
  it('adds a group and lets it carry its own operator', () => {
    const view = builderWith(emptyFilterGroup());
    view.builder.addGroup();
    const nested = view.last().clauses[0];

    expect(isFilterGroup(nested)).toBe(true);
    expect((nested as FilterGroup).op).toBe('AND');
  });

  it('replaces a nested group in place when the child reports a change', () => {
    const view = builderWith({
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        { op: 'AND', clauses: [] },
      ],
    });
    view.builder.replaceChild(1, {
      op: 'OR', clauses: [{ field: 'amount', operator: 'GT', value: '5' }],
    });

    expect(view.last().clauses[0]).toEqual({ field: 'region', operator: 'EQ', value: 'north' });
    expect((view.last().clauses[1] as FilterGroup).op).toBe('OR');
  });

  it('stops offering another level once the nesting is as deep as it stays readable', () => {
    // Not a limit of the model, which nests as far as anybody wants. It is a limit of what can
    // be read in a narrow column, and past it the SQL console next door is the better tool.
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});
    const fixture = TestBed.createComponent(FilterBuilder);
    fixture.componentRef.setInput('model', emptyFilterGroup());
    fixture.componentRef.setInput('columns', COLUMNS);
    fixture.componentRef.setInput('depth', MAX_GROUP_DEPTH);
    fixture.detectChanges();
    const text = ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');

    expect(text).toContain('Condition');
    expect(text).not.toContain('Group');
  });
});

describe('an operator that does not suit a column is hinted, never refused', () => {
  it('says a text column is not a date column, and still allows the comparison', () => {
    // A hint rather than a disabled option, because the reason is an inference from a type name
    // and not a fact. A CSV column of digits is typed VARCHAR and comparing it is legitimate.
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'region', operator: 'DATE_RANGE', values: [] }],
    });

    expect(view.text()).toContain('region is VARCHAR, not a date column');
  });

  it('says nothing at all when the operator suits the column', () => {
    const view = builderWith({
      op: 'AND', clauses: [{ field: 'booked_on', operator: 'DATE_RANGE', values: [] }],
    });

    expect(view.text()).not.toContain('not a date column');
  });

  it('gives a number column a number input and a date column a date one', () => {
    const view = builderWith(emptyFilterGroup());

    expect(view.builder.inputType({ field: 'amount', operator: 'EQ' })).toBe('number');
    expect(view.builder.inputType({ field: 'booked_on', operator: 'EQ' })).toBe('date');
    expect(view.builder.inputType({ field: 'region', operator: 'EQ' })).toBe('text');
  });

  it('lets the operator decide a range input, not the column', () => {
    // Picking NUMERIC_RANGE asserted that the values are numbers, whatever DuckDB called the
    // column while reading the file.
    const view = builderWith(emptyFilterGroup());

    expect(view.builder.boundType({ field: 'region', operator: 'NUMERIC_RANGE' })).toBe('number');
    expect(view.builder.boundType({ field: 'region', operator: 'DATE_RANGE' })).toBe('date');
    expect(view.builder.boundType({ field: 'region', operator: 'BETWEEN' })).toBe('text');
  });
});

describe('a relative date is a token, never two dates computed here', () => {
  it('offers windows by name', () => {
    expect(RELATIVE_WINDOWS.map(window => window.id)).toContain('LAST_7_DAYS');
    expect(RELATIVE_WINDOWS.map(window => window.id)).toContain('THIS_MONTH');
  });

  it('sends the token itself, so nothing here resolves it against the browser clock', () => {
    // The audit records that nothing in this module had settled which clock a relative date is
    // relative to. Sending a token settles it in one place, server-side: the same saved analysis
    // then means the same period wherever it is opened from.
    expect(clauseToWire({ field: 'booked_on', operator: 'RELATIVE_DATE', value: 'LAST_7_DAYS' }))
      .toEqual({ field: 'booked_on', operator: 'RELATIVE_DATE', value: 'LAST_7_DAYS' });
  });

  it('says on screen where the window is resolved', () => {
    const view = builderWith({
      op: 'AND',
      clauses: [{ field: 'booked_on', operator: 'RELATIVE_DATE', value: 'LAST_7_DAYS' }],
    });

    expect(view.text()).toContain('resolved by the server');
  });
});

describe('describing a clause, for a chip and for a tooltip', () => {
  it('quotes the operand so a value with a space in it stays one value', () => {
    expect(describeClause({ field: 'region', operator: 'EQ', value: 'North West' }))
      .toBe('region is "North West"');
  });

  it('says a no-operand clause without a trailing empty quote', () => {
    expect(describeClause({ field: 'region', operator: 'IS_NULL' })).toBe('region is empty');
  });

  it('reads a range as two bounds', () => {
    expect(describeClause({ field: 'amount', operator: 'BETWEEN', values: ['10', '20'] }))
      .toBe('amount is between 10 and 20');
  });

  it('names a relative window in words rather than by its token', () => {
    expect(describeClause({ field: 'booked_on', operator: 'RELATIVE_DATE', value: 'LAST_7_DAYS' }))
      .toBe('booked_on is in the last 7 days');
  });

  it('lists every value of a set operand', () => {
    expect(describeClause({ field: 'region', operator: 'NOT_IN', values: ['north', 'south'] }))
      .toBe('region is none of "north", "south"');
  });
});
