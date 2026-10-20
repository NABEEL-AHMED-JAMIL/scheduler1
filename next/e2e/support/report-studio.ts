import { APIRequestContext, expect } from '@playwright/test';
import { deflateSync } from 'node:zlib';
import { api, authOf, Session } from './session';

/**
 * Report Studio's live fixtures, made through media-service's API (reportTemplate.json, reportPublish.json,
 * reportGenerate.json, reportLibrary.json, reportApprove.json, reportAsset.json) for the specs whose subject is a later
 * step: a published template to make a report from, a generated report to approve, an approved image to place. What is
 * made is Riverside's, named "E2E ..." with a run stamp, synthetic and clinical (fictional patients, no real images), and
 * left in place: Report Studio keeps every version by design, and the owner removes test data.
 */

/** A short stamp that makes this run's names unique (template and report names are unique in a workspace). */
export const stamp = (): string => Date.now().toString(36);

/** The synthetic wound-clinic data every Report Studio spec fills its templates with: three fictional patients. */
export const WOUND_DATA = {
  clinic: 'Riverside wound clinic (synthetic)',
  period: 'October 2026',
  summary: { patients: 3, improving: 2, worsening: 1 },
  visits: [
    { patient: 'Patient A (fictional)', site: 'Left heel', stage: 'Stage 2 pressure injury', areaCm2: 4.1 },
    { patient: 'Patient B (fictional)', site: 'Sacrum', stage: 'Stage 3 pressure injury', areaCm2: 9.6 },
    { patient: 'Patient C (fictional)', site: 'Right shin', stage: 'Venous leg ulcer', areaCm2: 6.3 },
  ],
};

/** The same data as the text a person pastes. */
export const woundJson = (data: unknown = WOUND_DATA): string => JSON.stringify(data, null, 2);

/** Pasted data as a source (INLINE_JSON, read straight away and never stored). */
export const pasted = (data: unknown = WOUND_DATA) => ({ connector: 'INLINE_JSON', text: JSON.stringify(data), format: 'JSON' });

/**
 * A small wound-check template whose data contract needs `clinic` and the `visits` list: a report from it cannot be
 * generated from data without them.
 */
export function woundDefinition(name: string): Record<string, unknown> {
  return {
    schemaVersion: '1.0',
    template: {
      name,
      category: 'Clinical quality',
      page: { size: 'A4', orientation: 'portrait' },
      datasets: [{ id: 'primary', rootPath: '$' }],
      dataContract: {
        fields: [
          { path: 'clinic', type: 'string', required: true, label: 'Clinic' },
          { path: 'visits', type: 'array', required: true, label: 'Visits' },
        ],
      },
      components: [
        { id: 'title', type: 'heading', level: 1, content: name },
        { id: 'sub', type: 'text', content: '{{primary.clinic}} · fictional patients, synthetic data. A draft for a clinician to review.' },
        {
          id: 'visits', type: 'table', title: 'Wounds this visit', dataset: 'primary.visits', repeatHeader: true, emptyState: 'No visits.',
          columns: [
            { id: 'p', field: 'patient', label: 'Patient' }, { id: 's', field: 'site', label: 'Site' },
            { id: 'st', field: 'stage', label: 'Stage' }, { id: 'a', field: 'areaCm2', label: 'Area cm²' },
          ],
        },
        { id: 'footer', type: 'section', role: 'footer', children: [{ id: 'page-number', type: 'pageNumber', format: 'Page {current} of {total}' }] },
      ],
    },
  };
}

/** The envelope's data, failing the test with the server's sentence when the call was refused. */
async function data<T = any>(what: string, response: Awaited<ReturnType<APIRequestContext['get']>>): Promise<T> {
  const body: any = await response.json().catch(() => ({}));
  expect(body.status, `${what}: ${body.message ?? response.status()}`).toBe('SUCCESS');
  return body.data as T;
}

export interface Template { templateId: string; name: string; currentPublishedVersion: number | null; draft?: { revision: number; version: number } | null }

/** A template imported as a draft and published as v1 (the wizard's and the library's starting point). */
export async function publishedTemplate(request: APIRequestContext, s: Session, name: string): Promise<Template> {
  const made = await data<Template>(`import ${name}`, await request.post(`${api}/reportTemplate.json/create`,
    { headers: authOf(s), data: { from: 'IMPORT', name, definition: woundDefinition(name) } }));
  return data<Template>(`publish ${name}`, await request.post(`${api}/reportPublish.json/publish?templateId=${made.templateId}`,
    { headers: authOf(s), data: { revision: made.draft!.revision, changeSummary: 'E2E: first version' } }));
}

export async function template(request: APIRequestContext, s: Session, templateId: string): Promise<any> {
  return data(`template ${templateId}`, await request.get(`${api}/reportTemplate.json/fetchById?templateId=${templateId}`, { headers: authOf(s) }));
}

export interface Job { jobId: string; reportId: string; status: string; resultVersion?: number | null; error?: string | null }

/** Generates a report (a new one by name, or a new version of reportId) and waits for its job to finish. */
export async function generated(request: APIRequestContext, s: Session, body: Record<string, unknown>): Promise<Job> {
  const queued = await data<Job>('generate', await request.post(`${api}/reportGenerate.json/generate`, {
    headers: { ...authOf(s), 'Idempotency-Key': `e2e-${stamp()}-${Math.random().toString(36).slice(2)}` },
    data: { formats: ['PDF', 'HTML'], rootPath: '$', ...body },
  }));
  let job: Job = queued;
  await expect.poll(async () => {
    job = await data<Job>('job', await request.get(`${api}/reportLibrary.json/job?jobId=${queued.jobId}`, { headers: authOf(s) }));
    return job.status;
  }, { timeout: 90_000, intervals: [1000, 2000, 3000], message: `report job ${queued.jobId} finishes` }).toMatch(/^(SUCCEEDED|FAILED|CANCELLED)$/);
  expect(job.status, `job ${job.jobId}: ${job.error ?? ''}`).toBe('SUCCEEDED');
  return job;
}

export async function report(request: APIRequestContext, s: Session, reportId: string): Promise<any> {
  return data(`report ${reportId}`, await request.get(`${api}/reportLibrary.json/report?reportId=${reportId}`, { headers: authOf(s) }));
}

/** Approves (and so signs) a report version as the given person. */
export async function approve(request: APIRequestContext, s: Session, reportId: string, version: number): Promise<any> {
  return data(`approve ${reportId} v${version}`, await request.post(`${api}/reportApprove.json/approve`,
    { headers: authOf(s), data: { reportId, version, note: 'E2E: reviewed as a draft for a clinician' } }));
}

/** A version's file, through the signed link the console uses (five minutes, the reader's own). */
export async function download(request: APIRequestContext, s: Session, reportId: string, version: number, format: 'PDF' | 'HTML'): Promise<Buffer> {
  const link = await data<{ token: string }>('download link', await request.post(`${api}/reportLibrary.json/downloadLink`,
    { headers: authOf(s), data: { reportId, version, format } }));
  const file = await request.get(`${api}/reportLibrary.json/download?token=${encodeURIComponent(link.token)}`, { headers: authOf(s) });
  expect(file.status(), `download ${reportId} v${version} ${format}`).toBe(200);
  return file.body();
}

/** An image uploaded to the asset library (logos and images are approved on upload). */
export async function uploadedImage(request: APIRequestContext, s: Session, name: string, kind: 'IMAGE' | 'LOGO' = 'IMAGE'): Promise<any> {
  return data(`upload ${name}`, await request.post(`${api}/reportAsset.json/upload`, {
    headers: authOf(s),
    multipart: { kind, name, category: 'E2E', file: { name: 'e2e-wound-chart.png', mimeType: 'image/png', buffer: png() } },
  }));
}

/**
 * A small synthetic PNG: teal and amber bands on white (a stand-in for a wound-chart icon -- never a photo).
 */
export function png(width = 96, height = 64): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    for (let x = 0; x < width; x++) {
      const band = Math.floor(x / 16) % 3;
      raw.set(band === 0 ? [20, 150, 140] : band === 1 ? [240, 180, 60] : [255, 255, 255], row + 1 + x * 3);
    }
  }
  const table = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(4); head.writeUInt32BE(body.length);
    const all = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const tail = Buffer.alloc(4); tail.writeUInt32BE(crc(all));
    return Buffer.concat([head, all, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * The isolation spec's rows, made once and reused by name (a spec that only reads them should not add three rows a
 * run): a published template, a report generated from it, and an image. Riverside's, named "E2E isolation ...".
 */
export async function isolationRows(request: APIRequestContext, s: Session): Promise<{ templateId: string; reportId: string; assetId: string }> {
  const TEMPLATE = 'E2E isolation wound template';
  const REPORT = 'E2E isolation wound report';
  const IMAGE = 'E2E isolation wound icon';
  const lib = await data<{ templates: Template[] }>('templates', await request.get(`${api}/reportTemplate.json/fetchAll?archived=false`, { headers: authOf(s) }));
  const tpl = lib.templates.find(t => t.name === TEMPLATE && t.currentPublishedVersion) ?? await publishedTemplate(request, s, TEMPLATE);
  const reports = (await data<{ reports: { reportId: string; name: string; currentVersion: number | null }[] }>('reports',
    await request.get(`${api}/reportLibrary.json/reports?q=${encodeURIComponent(REPORT)}&limit=200`, { headers: authOf(s) }))).reports;
  const made = reports.find(r => r.name === REPORT && r.currentVersion);
  const reportId = made?.reportId ?? (await generated(request, s, { templateId: tpl.templateId, version: '1', name: REPORT, source: pasted() })).reportId;
  const assets = (await data<{ assets: { assetId: string; name: string }[] }>('assets',
    await request.get(`${api}/reportAsset.json/assets?q=${encodeURIComponent(IMAGE)}`, { headers: authOf(s) }))).assets;
  const assetId = assets.find(a => a.name === IMAGE)?.assetId ?? (await uploadedImage(request, s, IMAGE)).assetId;
  return { templateId: tpl.templateId, reportId, assetId };
}
