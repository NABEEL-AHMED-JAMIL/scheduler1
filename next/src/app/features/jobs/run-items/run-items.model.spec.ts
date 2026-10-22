import { describe, it, expect } from 'vitest';
import {
  ItemsSummary, cellLook, countsLine, filterOf, itemLook, itemStats, itemSub, itemsQuery, rangeLabel, retryRefusal, zipLabel,
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
    expect(cellLook({ status: 'done', hasData: true, files: 40 })).toMatchObject({ kind: 'files', text: '40 files ›' });
    expect(cellLook({ status: 'done', files: 1 })).toMatchObject({ kind: 'files', text: '1 file ›' });
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
});
