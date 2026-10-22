import { describe, it, expect } from 'vitest';
import { acrossQuery, afterText, beforeText, carriedSteps, compareTitle, headline, reportText, rowLook, ticked, versionText, Comparison } from './schedule-items.model';

/** MIG-421: the schedule Items tab's readings of Core's across-runs answers. */
describe('schedule items model', () => {
  it('asks for an exact key ("All runs of this item") over a search, and leaves empty parts out', () => {
    expect(acrossQuery(1037, { search: 'call-a', page: 0, size: 25 })).toEqual({ jobId: 1037, page: 0, size: 25, search: 'call-a' });
    expect(acrossQuery(1037, { key: 'voice-intake/call-a.m4a', search: 'x', status: 'failed', fields: ['status.risk'] }))
      .toEqual({ jobId: 1037, page: 0, size: 25, key: 'voice-intake/call-a.m4a', status: 'failed', fields: ['status.risk'] });
    expect(acrossQuery(1037, { status: 'all', from: null })).toEqual({ jobId: 1037, page: 0, size: 25 });
  });

  it('heads one item "processed 4 times", several by their count', () => {
    const one = { jobId: 1, total: 4, page: 0, size: 25, keys: [{ key: 'k', label: 'call-a.m4a', runs: 4 }], distinctKeys: 1, fields: [], masked: [], items: [] };
    expect(headline(one)).toEqual({ title: 'call-a.m4a', sub: 'processed 4 times · latest result first' });
    expect(headline({ ...one, keys: [{ key: 'k', label: 'x', runs: 1 }], total: 1 })?.sub).toBe('processed once · latest result first');
    expect(headline({ ...one, distinctKeys: 3, total: 9 })?.title).toBe('3 items');
    expect(headline({ ...one, total: 0 })).toBeNull();
    // ZT-I22: the same file in three folders is one item to the reader.
    expect(headline({ ...one, total: 3, distinctKeys: 3, keys: [{ key: 'a/x.m4a', label: 'x.m4a', runs: 1 }, { key: 'b/x.m4a', label: 'x.m4a', runs: 1 },
      { key: 'c/x.m4a', label: 'x.m4a', runs: 1 }] })).toEqual({ title: 'x.m4a', sub: 'processed 3 times · latest result first' });
  });

  it('reads a row: its status, version and report', () => {
    expect(rowLook({ status: 'failed', failedStep: { index: 3, key: 'ai', name: 'AI prompt' } })).toEqual({ label: 'Failed at AI prompt', tone: 'crit' });
    expect(rowLook({ status: 'done', flag: 'check' }).label).toBe('Check by hand');
    expect(rowLook({ status: 'done' }).label).toBe('Done');
    expect(versionText(5)).toBe('v5');
    expect(versionText(null)).toBe('—');
    // ZT-I24: a Report Studio report is its number and version in every run, its first version too; a plain file its name.
    expect(reportText({ report: { number: 'RPT-0019', label: 'RPT-0019', version: 1, fileName: 'Call_insight_call-a.m4a_v1.pdf' } }))
      .toBe('RPT-0019 v1');
    expect(reportText({ report: { number: 'RPT-0013', label: 'RPT-0013', version: 2, fileName: 'Call_insight_call-a.m4a_v1.pdf' } }))
      .toBe('RPT-0013 v2');
    expect(reportText({ report: { number: null, label: 'Call_insight_call-a.m4a_v1.pdf', version: null, fileName: 'Call_insight_call-a.m4a_v1.pdf' } }))
      .toBe('Call_insight_call-a.m4a_v1.pdf');
    expect(reportText({ report: null })).toBe('—');
  });

  it('keeps two runs ticked at most, a third dropping the first', () => {
    expect(ticked([], 8814)).toEqual([8814]);
    expect(ticked([8814], 8701)).toEqual([8814, 8701]);
    expect(ticked([8814, 8701], 8655)).toEqual([8701, 8655]);
    expect(ticked([8814, 8701], 8814)).toEqual([8701]);
  });

  it('titles a compare by the step that changed and how many fields', () => {
    const c: Comparison = {
      jobId: 1, key: 'k', label: 'call-a.m4a', a: { jobQueueId: 8814 }, b: { jobQueueId: 8701 },
      pipeline: { from: 4, to: 5, same: false, changes: ['AI prompt changed its setting promptId'], note: 'Pipeline v4 to v5: …' },
      steps: [{ key: 'insight', name: 'Insight JSON', same: false, changes: [
        { path: 'status.risk', kind: 'changed', before: '"High"', after: '"Moderate"' },
        { path: 'quotes[0].at', kind: 'removed', before: '"01:23"', after: null },
        { path: 'actions[1].due', kind: 'changed', before: '"Tomorrow"', after: '"Today"' }] },
        { key: 'transcribe', name: 'Transcribe audio', same: true, changes: [] }],
      changed: 3, masked: [],
    };
    expect(compareTitle(c)).toEqual({ title: 'Compare #8814 with #8701', sub: 'Insight JSON · 3 fields changed' });
    expect(carriedSteps(c)).toEqual([]);
    expect(carriedSteps({ ...c, steps: [...c.steps, { key: 'save', name: 'Save file', same: false, changes: [], carried: 3 }] }))
      .toEqual([{ name: 'Save file', carried: 3 }]);
    expect(afterText(c.steps[0].changes[1])).toBe('(removed)');
    expect(beforeText({ path: 'x', kind: 'added', after: '1' })).toBe('(not there)');
  });
});
