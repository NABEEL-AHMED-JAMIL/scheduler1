import { describe, it, expect } from 'vitest';
import { HttpErrorResponse } from '@angular/common/http';
import {
  TypeDefinition, blankDefinition, boxPercent, correctionsOf, definitionProblems, definitionToSave, documentFields,
  editableDefinition, fieldName, fileName, isLow, lowLine, nextInQueue, nextRowIndex, percent, recentRows, refusalText, ruleText,
  shortcutOf, statusLabel, stepIndex, tableViews, textList, totalsOf, typeLabel,
} from './documents.model';
import { PO_DEFINITION, PO_FIELDS } from './documents.fixtures';

/** MIG-272: the rules the Document Intelligence screens share. */
describe('confidence', () => {
  it('reads a confidence as a whole percent, and nothing as nothing', () => {
    expect(percent(0.867)).toBe(87);
    expect(percent(1)).toBe(100);
    expect(percent(0)).toBe(0);
    expect(percent(null)).toBeNull();
  });

  it('flags against the type\'s auto-approve threshold, else 80%', () => {
    expect(lowLine(0.9)).toBe(0.9);
    expect(lowLine(null)).toBe(0.8);
    expect(lowLine(0)).toBe(0.8);
  });

  it('flags a value with a problem, or less sure than the line; a corrected value is the reviewer\'s own', () => {
    expect(isLow({ confidence: 0.95, problems: [] }, 0.9)).toBe(false);
    expect(isLow({ confidence: 0.867, problems: [] }, 0.9)).toBe(true);
    expect(isLow({ confidence: 1, problems: ['Not a date.'] }, 0.9)).toBe(true);
    expect(isLow({ confidence: 0.25, problems: [], corrected: true }, 0.9)).toBe(false);
    expect(isLow({ confidence: null, problems: [] }, 0.9)).toBe(true);
  });
});

describe('labels', () => {
  it('says "In review" and tells an approval the document made on its own apart', () => {
    expect(statusLabel({ status: 'Review' })).toBe('In review');
    expect(statusLabel({ status: 'Approved', autoApproved: true })).toBe('Auto-approved');
    expect(statusLabel({ status: 'Approved', autoApproved: false })).toBe('Approved');
    expect(statusLabel({ status: 'Failed' })).toBe('Failed');
  });

  it('names the file by its key\'s last segment, and the type with its version', () => {
    expect(fileName('ocr-live-check/ocr-live-check.png')).toBe('ocr-live-check.png');
    expect(fileName('scan.pdf')).toBe('scan.pdf');
    expect(typeLabel({ documentTypeName: 'Invoice', documentTypeVersion: 2 })).toBe('Invoice v2');
    expect(typeLabel({ documentTypeKey: null, documentTypeName: null })).toBe('Not classified');
  });

  it('names a table cell by its table, row and column', () => {
    expect(fieldName(PO_FIELDS[4], PO_DEFINITION)).toBe('Ordered items row 1 · Quantity');
    expect(fieldName(PO_FIELDS[1], PO_DEFINITION)).toBe('PO number');
  });
});

describe('the review screen', () => {
  it('lists the document\'s own fields in the type\'s order, table cells aside', () => {
    expect(documentFields(PO_FIELDS, PO_DEFINITION).map(f => f.fieldKey)).toEqual(['po_number', 'supplier_name', 'delivery_date', 'total']);
  });

  it('lays a table out by row and column, a missing cell as null', () => {
    const [items] = tableViews(PO_FIELDS, PO_DEFINITION);
    expect(items.label).toBe('Ordered items');
    expect(items.columns.map(c => c.key)).toEqual(['description', 'quantity', 'amount']);
    expect(items.rows).toHaveLength(1);
    expect(items.rows[0].cells.map(c => c?.value ?? null)).toEqual(['Pallets', '40', null]);
    expect(nextRowIndex(PO_FIELDS, 'line_items')).toBe(1);
    expect(nextRowIndex(PO_FIELDS, 'other')).toBe(0);
  });

  it('sends only what changed, blank as null, and a new row by table, row and column', () => {
    const sent = correctionsOf(PO_FIELDS, { 1000: '77104', 1003: 'Dock Supplies Ltd', 1004: '  ' },
      { tableKey: 'line_items', rowIndex: 1, values: { description: 'Crates', quantity: '2', amount: '' } });
    expect(sent).toEqual([
      { fieldId: 1003, value: 'Dock Supplies Ltd' },
      { fieldId: 1004, value: null },
      { tableKey: 'line_items', rowIndex: 1, fieldKey: 'description', value: 'Crates' },
      { tableKey: 'line_items', rowIndex: 1, fieldKey: 'quantity', value: '2' },
      { tableKey: 'line_items', rowIndex: 1, fieldKey: 'amount', value: null },
    ]);
    expect(correctionsOf(PO_FIELDS, {}, { tableKey: 'line_items', rowIndex: 1, values: { description: ' ' } })).toEqual([]);
  });

  it('keeps a value as typed: "$1,234.50" goes as it is, and the service reads it', () => {
    expect(correctionsOf(PO_FIELDS, { 1005: '$9,820.00' }, null)).toEqual([{ fieldId: 1005, value: '$9,820.00' }]);
  });

  it('moves the selection within the list', () => {
    expect(stepIndex(-1, 1, 4)).toBe(0);
    expect(stepIndex(-1, -1, 4)).toBe(3);
    expect(stepIndex(3, 1, 4)).toBe(3);
    expect(stepIndex(0, -1, 4)).toBe(0);
    expect(stepIndex(1, 1, 4)).toBe(2);
    expect(stepIndex(0, 1, 0)).toBe(-1);
  });

  it('reads A, R and the arrows -- never while typing, never with a modifier', () => {
    const on = (tagName: string) => ({ tagName } as unknown as EventTarget);
    const key = (k: string, target: EventTarget | null = on('BODY'), mods: Partial<KeyboardEvent> = {}) =>
      shortcutOf({ key: k, ctrlKey: false, metaKey: false, altKey: false, target, ...mods });
    expect(key('a')).toBe('approve');
    expect(key('R')).toBe('reject');
    expect(key('ArrowDown')).toBe('next');
    expect(key('ArrowUp')).toBe('previous');
    expect(key('x')).toBeNull();
    expect(key('a', on('INPUT'))).toBeNull();
    expect(key('r', on('TEXTAREA'))).toBeNull();
    expect(key('ArrowDown', on('SELECT'))).toBeNull();
    expect(key('a', { tagName: 'DIV', isContentEditable: true } as unknown as EventTarget)).toBeNull();
    expect(key('r', on('BODY'), { ctrlKey: true })).toBeNull();
    expect(key('a', on('BODY'), { metaKey: true })).toBeNull();
  });

  it('places a box in percent of the page image, so it scales with the image', () => {
    expect(boxPercent({ left: 425, top: 110, width: 170, height: 55 }, { width: 1700, height: 1100 }))
      .toEqual({ left: '25%', top: '10%', width: '10%', height: '5%' });
  });

  it('says what each rule checks, in the type\'s words', () => {
    expect(ruleText({ index: 1, rule: 'sumEquals', status: 'passed' }, PO_DEFINITION)).toBe('Ordered items amount adds up to order total');
    expect(ruleText({ index: 2, rule: 'notAfter', status: 'failed' }, PO_DEFINITION)).toBe('Order date is on or before delivery date');
    expect(ruleText({ index: 9, rule: 'matches', status: 'skipped' }, PO_DEFINITION)).toBe('matches');
    const sums: TypeDefinition = { ...PO_DEFINITION, rules: [{ rule: 'sumOf', fields: ['po_number', 'total'], field: 'total' }] };
    expect(ruleText({ index: 1, rule: 'sumOf', status: 'passed' }, sums)).toBe('PO number + Order total = Order total');
  });

  it('goes on to the first other document in the queue', () => {
    expect(nextInQueue([{ extractionId: 5 }, { extractionId: 6 }], 5)).toBe(6);
    expect(nextInQueue([{ extractionId: 6 }], 5)).toBe(6);
    expect(nextInQueue([{ extractionId: 5 }], 5)).toBeNull();
    expect(nextInQueue([], 5)).toBeNull();
  });
});

describe('the overview', () => {
  it('adds the types\' numbers up: auto-approved of those decided, accuracy of the fields reviewed', () => {
    const t = totalsOf([
      { documentTypeId: 1001, typeKey: 'purchase_order', name: 'Purchase order', documents: 4, autoApproved: 1, approvedByReviewer: 1, rejected: 0,
        inReview: 2, failed: 0, reviewedFields: 11, correctedFields: 6 },
      { documentTypeId: 1000, typeKey: 'invoice', name: 'Invoice', documents: 1, autoApproved: 0, approvedByReviewer: 0, rejected: 1,
        inReview: 0, failed: 0, reviewedFields: 9, correctedFields: 0 },
    ]);
    expect(t.documents).toBe(5);
    expect(t.inReview).toBe(2);
    expect(t.autoRate).toBeCloseTo(1 / 3);
    expect(t.accuracy).toBeCloseTo(1 - 6 / 20);
    expect(totalsOf([])).toEqual({ documents: 0, autoApproved: 0, inReview: 0, autoRate: null, accuracy: null });
  });

  it('shows every extraction, newest first, then the reads nothing was extracted from', () => {
    const reads = [
      { ocrDocumentId: 1003, sourceBucket: 'ui-review-s3', sourceKey: 'scans/a.png', status: 'Done', pageCount: 1, dateCreated: '2026-09-29T03:07:04.627+00:00' },
      { ocrDocumentId: 1001, sourceBucket: 'ui-review-s3', sourceKey: 'ocr-live-check/ocr-live-check.png', status: 'Done', pageCount: 2 },
    ];
    const extractions = [
      { extractionId: 1000, ocrDocumentId: 1001, status: 'Approved', revision: 1, dateCreated: 'x' },
      { extractionId: 1005, ocrDocumentId: 1001, status: 'Review', revision: 0, dateCreated: 'y' },
      { extractionId: 900, ocrDocumentId: 42, status: 'Failed', revision: 0 },
    ];
    const rows = recentRows(reads, extractions);
    expect(rows.map(r => [r.key, r.name, r.where, r.status])).toEqual([
      ['e1005', 'ocr-live-check.png', 'ui-review-s3 · 2 pages', 'In review'],
      ['e1000', 'ocr-live-check.png', 'ui-review-s3 · 2 pages', 'Approved'],
      ['e900', 'OCR document 42', '', 'Failed'],
      ['o1003', 'a.png', 'ui-review-s3 · 1 page', 'Read'],
    ]);
  });
});

describe('the type editor', () => {
  it('edits a copy, never what the service sent', () => {
    const copy = editableDefinition(PO_DEFINITION);
    copy.fields[0].label = 'Changed';
    copy.tables[0].columns.push({ key: 'x', label: 'X', type: 'text' });
    expect(PO_DEFINITION.fields[0].label).toBe('PO number');
    expect(PO_DEFINITION.tables[0].columns).toHaveLength(3);
    expect(copy.fields[1].aliases).toEqual([]);
  });

  it('holds a definition to what the service accepts', () => {
    expect(definitionProblems('Purchase order', 'purchase_order', editableDefinition(PO_DEFINITION))).toEqual([]);
    const bad = editableDefinition(PO_DEFINITION);
    bad.fields.push({ key: 'po_number', label: '', type: 'choice', options: [] });
    bad.autoApproveThreshold = 1.5;
    bad.rules.push({ rule: 'sumOf', fields: ['nope'], field: 'total' }, { rule: 'rowProduct', table: 'line_items', columns: ['quantity'], column: 'amount' });
    expect(definitionProblems('', 'Bad Key', bad)).toEqual([
      'Name the document type.',
      'The key is lower_snake_case: a letter, then letters, digits or _.',
      'The auto-approve threshold is more than 0% and at most 100%.',
      'Field 6: "po_number" is used twice.',
      'Field 6: add a label.',
      'Field 6: a choice needs its options.',
      'Rule 3: name the fields that add up (their keys).',
      'Rule 4: name the two columns that multiply.',
    ]);
    expect(definitionProblems('X', 'x', { ...blankDefinition(), fields: [] })).toContain('Add a field or a table.');
  });

  it('sends what a rule kind uses, and drops the blanks', () => {
    const d = editableDefinition(PO_DEFINITION);
    d.rules = [{ rule: 'notAfter', before: 'order_date', after: 'delivery_date', table: 'line_items', tolerance: 0.5, message: ' ' }];
    d.fields[0].aliases = textList('PO #, , Purchase Order No.');
    const saved = definitionToSave(d);
    expect(saved.rules).toEqual([{ rule: 'notAfter', before: 'order_date', after: 'delivery_date' }]);
    expect(saved.fields[0]).toEqual({ key: 'po_number', label: 'PO number', type: 'text', required: true, aliases: ['PO #', 'Purchase Order No.'] });
    expect(saved.fields[1]).toEqual({ key: 'order_date', label: 'Order date', type: 'date', required: true });
    expect(saved.autoApproveThreshold).toBe(0.9);
  });
});

describe('refusals', () => {
  it('shows the service\'s own message, and a sentence of ours when it sent none', () => {
    const refused = (status: number, error: unknown) => new HttpErrorResponse({ status, error });
    expect(refusalText(refused(422, { status: 'ERROR', message: 'No model connection to extract with: set a workspace default.' }), 'x'))
      .toBe('No model connection to extract with: set a workspace default.');
    expect(refusalText(refused(429, null), 'x')).toBe('Document Intelligence is busy. Try again in a few minutes.');
    expect(refusalText(refused(404, null), 'x')).toBe('It is not there any more: it may have been removed.');
    expect(refusalText(refused(500, null), 'Could not load.')).toBe('Could not load.');
  });
});
