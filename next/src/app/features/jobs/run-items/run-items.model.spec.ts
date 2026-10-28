import { describe, it, expect } from 'vitest';
import {
  ItemsSummary, NO_SELECTION, cellLook, countsLine, filterOf, filtersOf, isSelected, itemLook, itemStats, itemSub, itemsQuery, pageState,
  rangeLabel, refsOf, retryLabel, retryRefusal, selectedCount, selectionBody, toggled, withPage, zipItemsLabel, zipLabel,
  fileIcon, humanKey, reportLine, reportState, stepDescription, stepShortName,
} from './run-items.model';

/** MIG-420: how the Items tab reads Core's run items. */
const SUMMARY: ItemsSummary = { items: 50, done: 48, failed: 2, running: 0, failedItems: 2, files: 146, averageMs: 118_000,
  failedAt: [{ step: 'AI prompt', count: 2 }], runStatus: 'Completed', retryable: true, source: 'Read S3' };

describe('Run items: the readings', () => {
  it('says an item\'s status as a pill: Done, Failed at its step, a document\'s failed pages in amber', () => {
    expect(itemLook({ status: 'done' })).toEqual({ label: 'Done', tone: 'ok' });
    expect(itemLook({ status: 'failed', failedStep: { index: 3, key: 'ai', name: 'AI prompt' } })).toEqual({ label: 'Failed at AI prompt', tone: 'crit' });
    expect(itemLook({ status: 'done', children: { total: 40, done: 39, failed: 1 } })).toEqual({ label: '1 page failed', tone: 'warn' });
    expect(itemLook({ status: 'done', children: { total: 40, done: 37, failed: 3 } }).label).toBe('3 pages failed');
    expect(itemLook({ status: 'running' }).tone).toBe('brand');
  });

  it('offers View for a step with data, the files for one that made many, and a dash where it did not run', () => {
    expect(cellLook({ status: 'done', hasData: true, files: 0 }).kind).toBe('view');
    expect(cellLook({ status: 'done', hasData: true, files: 40 })).toMatchObject({ kind: 'files', text: '40 files' });
    expect(cellLook({ status: 'done', files: 1 })).toMatchObject({ kind: 'files', text: '1 file' });
    expect(cellLook({ status: 'not_run' }).text).toBe('—');
    expect(cellLook(undefined).text).toBe('—');
    expect(cellLook({ status: 'shared', sharedBy: 50 }).text).toBe('Shared by 50');
    expect(cellLook({ status: 'failed' }).kind).toBe('failed');
  });

  it('asks only for what is set: a search, a parent, the fields', () => {
    expect(itemsQuery(8814, { status: 'all' })).toEqual({ jobQueueId: 8814, status: 'all', page: 0, size: 50 });
    expect(itemsQuery(8814, { status: 'failed', search: '  risk = High ', page: 2, size: 100, fields: ['risk'], parent: '3' }))
      .toEqual({ jobQueueId: 8814, status: 'failed', search: 'risk = High', parent: '3', page: 2, size: 100, fields: ['risk'] });
  });

  it('writes the summary strip from the counts, the average an item took and where they failed', () => {
    const stats = itemStats(SUMMARY, '1 h 38 min');
    expect(stats.map(s => s.label)).toEqual(['Items', 'Done', 'Failed', 'Duration', 'Files made']);
    expect(stats[2]).toMatchObject({ value: '2', foot: 'both at AI prompt', tone: 'crit' });
    expect(stats[3]).toMatchObject({ value: '1 h 38 min', foot: 'about 1 min 58 sec an item' });
    expect(itemSub({ folder: 'intake/', children: { total: 40, done: 39, failed: 1 }, key: 'a', label: 'a' })).toBe('intake/ · 40 pages · 39 done, 1 failed');
  });

  it('says why Retry failed items cannot run', () => {
    expect(retryRefusal(SUMMARY)).toBe('');
    expect(retryRefusal({ ...SUMMARY, retryable: false, runStatus: 'Running' })).toContain('still going');
    expect(retryRefusal({ ...SUMMARY, retryable: false })).toContain('cannot be retried');
    expect(retryRefusal({ ...SUMMARY, failedItems: 0 })).toBe('No item failed.');
  });

  it('writes the Runs list line, a page range and the zip\'s size', () => {
    expect(countsLine({ items: 50, done: 48, failed: 2, running: 0 })).toEqual({ done: '48 of 50 done', failed: '2 failed', running: '' });
    expect(countsLine({ items: 0, done: 0, failed: 0, running: 0 })).toBeNull();
    expect(rangeLabel(0, 15, 40)).toBe('1–15 of 40');
    expect(rangeLabel(2, 15, 40)).toBe('31–40 of 40');
    expect(zipLabel(18 * 1024 * 1024)).toBe('Download all (zip, 18.0 MB)');
    expect(filterOf('FAILED')).toBe('failed');
    expect(filterOf('nonsense')).toBe('all');
  });

  // MIG-421
  it('selects rows by ref, or all matching less the unticked, and says it as Core\'s bodies', () => {
    let sel = NO_SELECTION;
    sel = toggled(sel, '4');
    sel = toggled(sel, '6');
    expect(isSelected(sel, '4')).toBe(true);
    expect(selectedCount(sel, 9)).toBe(2);
    expect(selectionBody(8814, sel, 'all', '')).toEqual({ jobQueueId: 8814, refs: ['4', '6'] });
    expect(pageState(sel, ['4', '6', '10'])).toBe('some');
    expect(pageState(withPage(sel, ['4', '6', '10'], true), ['4', '6', '10'])).toBe('all');
    const all = toggled({ all: true, refs: [], except: [] }, '13');
    expect(selectedCount(all, 9)).toBe(8);
    expect(isSelected(all, '13')).toBe(false);
    expect(selectionBody(8814, all, 'failed', ' risk = High ')).toEqual({ jobQueueId: 8814, all: true, status: 'failed', search: 'risk = High', except: ['13'] });
    expect(retryLabel(1)).toBe('Retry 1 failed');
    expect(zipItemsLabel(3)).toBe('Download zip (3 items)');
  });

  it('reads a Task inbox link\'s items and shows Check by hand only when an OCR step marked a page', () => {
    expect(refsOf('2,6, 9,x,1.12')).toEqual(['2', '6', '9', '1.12']);
    expect(refsOf(null)).toEqual([]);
    const summary = { items: 1, done: 1, failed: 0, running: 0, failedItems: 0, files: 0 };
    expect(filtersOf(summary)).toEqual(['all', 'done', 'failed', 'running']);
    expect(filtersOf({ ...summary, check: 1 })).toEqual(['all', 'done', 'failed', 'running', 'check']);
    expect(filterOf('check')).toBe('check');
    expect(itemLook({ status: 'done', failedStep: null, children: null, flag: 'check' } as never).label).toBe('Check by hand');
  });

  // ZT-I35 (live run #2950, "Patient intake · summary report"): the owner saw headers cut mid-word in capitals and a dash
  // where the PDF was.
  it('names a step by its short name -- its name when short, else without what it adds in brackets, else its key in words', () => {
    const report = { key: 'report', name: 'The Patient intake summary (published template, signed on approval, QR verify)' };
    expect(stepShortName(report)).toBe('Patient intake summary');
    expect(stepDescription(report)).toBe(report.name);
    expect(stepShortName({ key: 'json', name: 'The intake JSON (what the EHR would take)' })).toBe('Intake JSON');
    expect(stepShortName({ key: 'outcome', name: 'The outcome row (the dashboard reads every one)' })).toBe('Outcome row');
    expect(stepShortName({ key: 'keep_outcome', name: 'Outcome row to the bucket' })).toBe('Outcome row to the bucket');
    expect(stepDescription({ key: 'keep_outcome', name: 'Outcome row to the bucket' })).toBe('');
    expect(stepShortName({ key: 'assessed', name: 'The assessed intake' })).toBe('Assessed intake');
    expect(stepDescription({ key: 'assessed', name: 'The assessed intake' })).toBe('');
    expect(stepShortName({ key: 'ai', name: 'AI prompt' })).toBe('AI prompt');
    // A long name with nothing in brackets: its key in words; no key: whole words and an ellipsis, never half a word.
    const long = 'Every referral with its risk, the clinician who signed it and the date it was read again';
    expect(stepShortName({ key: 'keep_outcome', name: long })).toBe('Keep outcome');
    const cut = stepShortName({ name: long });
    expect(cut.endsWith('…')).toBe(true);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut).toBe('Every referral with its risk…');
    expect(/[a-z]/i.test(long.charAt(cut.length - 1))).toBe(false);
    expect(stepShortName({ key: 'splitPages', name: '' })).toBe('Split pages');
    expect(stepShortName(null)).toBe('Step');
    expect(humanKey('ocr_json')).toBe('OCR JSON');
    expect(humanKey('keep-outcome')).toBe('Keep outcome');
    // The failed pill and the summary strip say it short too.
    expect(itemLook({ status: 'failed', failedStep: { index: 2, key: 'report', name: report.name } }).label).toBe('Failed at Patient intake summary');
    expect(itemStats({ ...SUMMARY, failedAt: [{ step: report.name, count: 2 }] }, '1 min')[2].foot).toBe('both at Patient intake summary');
  });

  it('shows a step\'s files whatever its status says: one as a chip with its type and name, more as a count, a dash only for nothing', () => {
    // Core said "left_out" for #2950's report and JSON steps, though each made the item a file.
    expect(cellLook({ status: 'left_out', files: 1, file: { name: 'Patient_intake_S-1151_v1.pdf', format: 'pdf' } }))
      .toMatchObject({ kind: 'file', text: 'Patient_intake_S-1151_v1.pdf', icon: 'file' });
    expect(cellLook({ status: 'left_out', files: 1, file: { name: 'intake-S-1151.json', format: 'json' } })).toMatchObject({ kind: 'file', icon: 'code' });
    expect(cellLook({ status: 'left_out', files: 1 })).toMatchObject({ kind: 'files', text: '1 file' });
    expect(cellLook({ status: 'not_run', files: 2 })).toMatchObject({ kind: 'files', text: '2 files' });
    expect(cellLook({ status: 'done', hasData: true, files: 1, file: { name: 'a.png' } })).toMatchObject({ kind: 'file', icon: 'image' });
    expect(cellLook({ status: 'left_out', files: 0 }).text).toBe('—');
    expect(cellLook({ status: 'left_out' }).text).toBe('—');
    expect(fileIcon({ name: 'rows.csv' })).toBe('table');
    expect(fileIcon({ name: 'call.m4a' })).toBe('volume');
  });

  it('says where a report stands: signed by whom and when, approved, waiting for approval, or nothing it may say', () => {
    expect(reportLine({ reportId: 'r', number: 'RPT-0086', version: 1 })).toBe('RPT-0086 · version 1');
    expect(reportState({ approval: { approverName: 'Riverside Health reviewer', approvedAt: '2026-10-27T07:18:41Z', signed: true } }))
      .toMatchObject({ kind: 'signed', by: 'Riverside Health reviewer', at: '2026-10-27T07:18:41Z', tone: 'ok' });
    expect(reportState({ approval: { approverName: 'Ann', approvedAt: 'x', signed: false } })?.kind).toBe('approved');
    expect(reportState({ review: { state: 'OPEN' } })).toMatchObject({ kind: 'waiting', tone: 'warn' });
    expect(reportState({ void: { reason: 'wrong patient' }, approval: { signed: true } })?.kind).toBe('void');
    expect(reportState({})).toBeNull();
    expect(reportState(null)).toBeNull();
  });
});
