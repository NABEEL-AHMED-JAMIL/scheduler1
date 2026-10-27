import { openableOutputs, OutputRow, ReportVersionRow } from './report-studio.model';

/** ZT-M21: a report made from a sensitive pipeline's data stays listed; to a person without the permission it opens nothing. */
describe('A report version\'s openable files', () => {
  const pdf: OutputRow = { format: 'PDF', bytes: 2048, pages: 2, sha256: 'a', fileName: 'care-plan.pdf' };
  const html: OutputRow = { format: 'HTML', bytes: 900, sha256: 'b', fileName: 'care-plan.html' };
  const version = (extra: Partial<ReportVersionRow>) => ({ outputs: [html, pdf], ...extra }) as ReportVersionRow;

  it('puts the PDF first', () => {
    expect(openableOutputs(version({})).map(o => o.format)).toEqual(['PDF', 'HTML']);
  });

  it('opens nothing of a sensitive report the person may not have, nor of an expired version', () => {
    expect(openableOutputs(version({ sensitive: true, downloadable: false }))).toEqual([]);
    expect(openableOutputs(version({ expired: true }))).toEqual([]);
  });

  it('opens a sensitive report as any to a person who holds the permission', () => {
    expect(openableOutputs(version({ sensitive: true, downloadable: true }))).toHaveLength(2);
  });
});
