import { describe, it, expect } from 'vitest';
import {
  GeneratedReport, base64ToBlob, datasetOf, findRunOf, mergeReports, parseDatasetText, recentJobs, renderBody,
  reportsFromObjects, reportsFromRun, typeOf, DEFAULT_OPTIONS,
} from './generated.model';

/**
 * MIG-253: the pure half of Documents -- the rows a person pastes, the render request they turn
 * into, and the Reports list built from what exists (bucket objects and run outputs), since there
 * is no table of generated files to read.
 */
describe('parseDatasetText', () => {
  it('reads a list of records, with its columns in first-seen order', () => {
    const p = parseDatasetText('[{"region":"North","revenue":1234.5},{"region":"South","units":3}]');
    expect(p).toEqual({ ok: true, dataset: [{ region: 'North', revenue: 1234.5 }, { region: 'South', units: 3 }],
      rows: 2, columns: ['region', 'revenue', 'units'] });
  });

  it('reads records with a title, and columns with rows', () => {
    expect(parseDatasetText('{"title":"Q3","records":[{"a":1}]}')).toMatchObject({ ok: true, rows: 1, columns: ['a'] });
    expect(parseDatasetText('{"columns":["a","b"],"rows":[[1,2],[3,4]]}')).toMatchObject({ ok: true, rows: 2, columns: ['a', 'b'] });
  });

  it('says what is wrong: nothing, not JSON, the wrong shape, no rows', () => {
    expect(parseDatasetText('  ')).toEqual({ ok: false, error: 'Paste the rows as JSON.' });
    expect(parseDatasetText('{oops')).toMatchObject({ ok: false });
    expect((parseDatasetText('{oops') as { error: string }).error).toMatch(/^This is not valid JSON/);
    expect(parseDatasetText('"text"')).toEqual({ ok: false,
      error: 'A dataset is a list of records (JSON objects), or columns and rows.' });
    expect(parseDatasetText('[1,2]')).toMatchObject({ ok: false });
    expect(parseDatasetText('[]')).toEqual({ ok: false, error: 'The dataset has no rows.' });
  });
});

describe('renderBody', () => {
  it('sends the default layout with its options as an inline template, and the title on the dataset', () => {
    const body = renderBody({ outputFormat: 'pdf', dataset: [{ a: 1 }],
      options: { ...DEFAULT_OPTIONS, title: ' Customers ', orientation: 'landscape', watermark: 'DRAFT' } });
    expect(body).toEqual({ outputFormat: 'pdf', dataset: { title: 'Customers', records: [{ a: 1 }] },
      template: { name: 'Customers', pageSize: 'A4', orientation: 'landscape', watermarkText: 'DRAFT' } });
  });

  it('names a saved template by id and nothing else about it', () => {
    const body = renderBody({ outputFormat: 'pdf', dataset: { columns: ['a'], rows: [[1]] },
      options: { ...DEFAULT_OPTIONS, templateId: 1001, title: 'T' } });
    expect(body).toEqual({ outputFormat: 'pdf', dataset: { columns: ['a'], rows: [[1]], title: 'T' }, templateId: 1001 });
  });

  it('reads a stored table as the source, and saves to a bucket when asked', () => {
    const body = renderBody({ outputFormat: 'pdf', source: { bucket: 'b', key: 'data/x.csv' }, options: DEFAULT_OPTIONS,
      fileName: ' UI-CHECK x ', save: { bucket: 'b', folder: ' reports/ ' } });
    expect(body).toEqual({ outputFormat: 'pdf', source: { bucket: 'b', key: 'data/x.csv' },
      template: { pageSize: 'A4', orientation: 'portrait' }, fileName: 'UI-CHECK x',
      save: true, bucketName: 'b', targetFolder: 'reports/' });
  });
});

describe('base64ToBlob', () => {
  it('turns the envelope back into the bytes it carried', async () => {
    const blob = base64ToBlob(btoa('%PDF-1.4'), 'application/pdf');
    expect(blob.type).toBe('application/pdf');
    expect(await blob.text()).toBe('%PDF-1.4');
  });
});

describe('the Reports list', () => {
  const RUN = { jobId: 2849, jobName: 'UI-CHECK registry chain job 0929', pipelineName: 'UI-CHECK registry chain task 0929',
    owner: 'Claude Demo Admin', jobQueueId: 7405 };
  const OUTPUTS = [
    { runOutputId: 1000, kind: 'file' as const, name: 'customers-clean.json', format: 'json', rowCount: 3, byteCount: 169,
      recordedAt: '2026-09-29T07:07:05.699379', runDatasetId: 1051, expiresAt: '2026-09-30T07:07:05.698', expired: false },
    { runOutputId: 1001, kind: 'bucket' as const, name: 'customers-clean.json', format: 'json', byteCount: 169,
      recordedAt: '2026-09-29T07:07:05.863214', bucket: 'ui-review-s3', key: 'registry-live-check/customers-clean.json' },
  ];

  it('types a file by its format or extension', () => {
    expect(typeOf('a.pdf')).toBe('PDF');
    expect(typeOf('a.tar.gz')).toBe('GZ');
    expect(typeOf('noext')).toBe('File');
    expect(typeOf('x.bin', 'json')).toBe('JSON');
  });

  it('lists a run\'s kept file and its upload, with the pipeline, owner and status', () => {
    const rows = reportsFromRun(RUN, OUTPUTS);
    expect(rows.map(r => [r.id, r.type, r.status, r.size, r.origin])).toEqual([
      ['run-1000', 'JSON', 'Ready', 169, 'run-file'],
      ['run-1001', 'JSON', 'In storage', 169, 'run-bucket'],
    ]);
    expect(rows[0]).toMatchObject({ jobQueueId: 7405, jobId: 2849, pipeline: 'UI-CHECK registry chain task 0929',
      owner: 'Claude Demo Admin', runDatasetId: 1051, expiresAt: '2026-09-30T07:07:05.698' });
    expect(reportsFromRun(RUN, [{ ...OUTPUTS[0], expired: true }])[0].status).toBe('Expired');
  });

  it('lists the files in a folder, not its subfolders', () => {
    const rows = reportsFromObjects('b', [
      { name: '2026', key: 'reports/2026/', folder: true },
      { name: 'Q3.pdf', key: 'reports/Q3.pdf', folder: false, size: 13841, lastModified: '2026-09-29T12:00:00Z' },
    ]);
    expect(rows).toEqual([{ id: 'obj-b/reports/Q3.pdf', name: 'Q3.pdf', type: 'PDF', origin: 'bucket', bucket: 'b',
      key: 'reports/Q3.pdf', created: '2026-09-29T12:00:00Z', size: 13841, status: 'In storage' } satisfies GeneratedReport]);
  });

  it('merges an upload a run recorded with the object it wrote, newest first', () => {
    const objects = reportsFromObjects('ui-review-s3', [
      { name: 'customers-clean.json', key: 'registry-live-check/customers-clean.json', folder: false, size: 169,
        lastModified: '2026-09-29T12:07:05Z' },
      { name: 'old.pdf', key: 'reports/old.pdf', folder: false, size: 5, lastModified: '2026-09-01T12:00:00Z' },
    ]);
    const merged = mergeReports(objects, reportsFromRun(RUN, OUTPUTS));
    expect(merged.map(r => r.id)).toEqual(['run-1001', 'run-1000', 'obj-ui-review-s3/reports/old.pdf']);
    expect(merged[0]).toMatchObject({ pipeline: 'UI-CHECK registry chain task 0929', bucket: 'ui-review-s3' });
  });

  it('finds the run that wrote an object, when a recent run did', () => {
    const rows = reportsFromRun(RUN, OUTPUTS);
    expect(findRunOf(rows, 'ui-review-s3', 'registry-live-check/customers-clean.json')?.jobQueueId).toBe(7405);
    expect(findRunOf(rows, 'ui-review-s3', 'elsewhere.json')).toBeUndefined();
  });

  it('names the newest run that wrote an object, whatever order the runs were read in', () => {
    // A schedule's runs all write the same key; the fan-out answers in any order (seen live: an older run named).
    const newest = reportsFromRun(RUN, OUTPUTS);
    const older = (id: number, created: string) => newest.map(r => ({ ...r, id: `${r.id}-${id}`, jobQueueId: id, created }));
    const rows = [...older(7409, '2026-09-29T08:55:00Z'), ...newest, ...older(7410, '2026-09-29T09:28:00Z')];
    const upload = newest.find(r => r.origin === 'run-bucket')!;
    expect(findRunOf(rows, upload.bucket!, upload.key!)?.jobQueueId).toBe(7405);
    expect(findRunOf([...rows].reverse(), upload.bucket!, upload.key!)?.jobQueueId).toBe(7405);
  });

  it('reads the most recently run schedules first, only those that ran, up to the cap', () => {
    const jobs = [
      { jobId: 1, lastJobRun: '2026-09-20T10:00:00' }, { jobId: 2 }, { jobId: 3, lastJobRun: '2026-09-29T10:00:00' },
      { jobId: 4, lastJobRun: '2026-09-25T10:00:00' },
    ];
    expect(recentJobs(jobs, 2).map(j => j.jobId)).toEqual([3, 4]);
  });

  it('keeps only a dataset a run still holds', () => {
    expect(datasetOf(OUTPUTS).map(o => o.runOutputId)).toEqual([1000]);
    expect(datasetOf([{ ...OUTPUTS[0], expired: true }])).toEqual([]);
  });
});
