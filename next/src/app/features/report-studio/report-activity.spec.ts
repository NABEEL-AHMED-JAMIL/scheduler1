import { describe, it, expect } from 'vitest';
import { REPORT_ACTIVITY, activityDetail, activityLine, codeInWords } from './report-activity';
import { MEDIA_REPORT_AUDIT_ACTIONS } from './report-audit-actions.fixture';

/**
 * Owner 2026-10-27 (RPT-0070, Riverside): a report's Activity showed "report.approved.signed" and "report.version.voided" --
 * the console knew 6 of the 15 actions media-service audits -- and its detail as "version 2 · format pdf".
 */
describe('A report\'s Activity in words', () => {
  it('has words for every action media-service writes (the contract)', () => {
    const missing = MEDIA_REPORT_AUDIT_ACTIONS.map(a => a.action).filter(a => !REPORT_ACTIVITY[a]);
    expect(missing).toEqual([]);
    for (const { action } of MEDIA_REPORT_AUDIT_ACTIONS) expect(activityLine({ action, at: '', detail: {} }).text).not.toMatch(/^report\./);
  });

  it('says who decided, and why when the entry says', () => {
    expect(activityLine({ action: 'report.approved.signed', at: '', actor: 1015, detail: { version: 1, byName: 'Riverside Health admin', signed: true } }))
      .toEqual({ text: 'Approved and signed by Riverside Health admin', detail: 'Version 1', note: null });
    expect(activityLine({ action: 'report.approved', at: '', detail: { version: 2, byName: 'Alex Morgan, RN', why: 'No signature on file.' } }))
      .toEqual({ text: 'Approved (not signed) by Alex Morgan, RN', detail: 'Version 2', note: 'No signature on file.' });
    expect(activityLine({ action: 'report.version.voided', at: '', actor: 1015, detail: { version: 1, reason: 'Wrong patient attached.' } },
      id => (id === 1015 ? 'Riverside Health admin' : null)))
      .toEqual({ text: 'Version voided by Riverside Health admin', detail: 'Version 1', note: 'Wrong patient attached.' });
    expect(activityLine({ action: 'report.approval.rejected', at: '', detail: { version: 3, byName: 'Dr. Anika Patel', note: 'Recheck the dose.' } }))
      .toMatchObject({ text: 'Approval rejected by Dr. Anika Patel', note: 'Recheck the dose.' });
    expect(activityLine({ action: 'report.approval.requested', at: '', detail: { version: 2, secondApprover: true } }))
      .toMatchObject({ text: 'Approval asked', detail: 'Version 2 · a second approver too' });
  });

  it('reads an action it does not know as its code in words, never the code', () => {
    expect(codeInWords('report.foo.bar')).toBe('Foo bar');
    expect(activityLine({ action: 'report.retention_moved', at: '', detail: {} }).text).toBe('Retention moved');
  });

  it('writes the facts in words', () => {
    expect(activityDetail({ version: 2, format: 'pdf' })).toBe('Version 2 · PDF');
    expect(activityDetail({ templateVersion: 8, jobId: 111, snapshotId: 9 })).toBe('Template v8');
    expect(activityDetail({ version: 1, format: 'md', via: 'api', served: 'VOID' })).toBe('Version 1 · Markdown · via API · marked VOID');
    expect(activityDetail({ label: 'RPT-0070', name: 'Patient intake', versions: 2, files: 5 })).toBe('2 versions · 5 files');
    expect(activityDetail({ jobId: 7, code: 'TEMPLATE_INVALID' })).toBe('Template invalid');
    expect(activityDetail({ version: 2, format: 'pdf' })).not.toContain('format');
  });
});
