import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../core/api/api.config';
import { Comparison, ReportLibraryApi } from './report-library.api';
import { pagesShown, pct, versionWords } from './compare/compare-page';
import { ReportVersionRow, TemplateDefinition } from './report-studio.model';
import {
  contractFields, deidentifyRules, pdfConformance, personalRows, setDeidentifyRule, setPdfConformance, setPersonal, typeOf,
} from './designer/personal-fields';
import { Block } from './designer/designer-model';

/**
 * Reports redesign, phase 4 (features 10-12): Compare versions (its calls, the pages it shows, the highlight geometry),
 * a copy without names (its calls), and the designer's personal fields, copy rules, PDF/A and tagged PDF settings.
 */
const comparison = (over: Partial<Comparison> = {}): Comparison => ({
  reportId: 'R1', name: 'Wound assessment report', label: 'RPT-0002',
  a: { version: 1, createdAt: '2026-10-21T21:49:00Z', templateVersion: 1, pages: 3, state: 'VOID', snapshotId: 'S1', expired: false, sensitive: false },
  b: { version: 2, createdAt: '2026-10-24T14:02:00Z', templateVersion: 2, pages: 3, state: 'WAITING', snapshotId: 'S2', expired: false, sensitive: false },
  notes: [], changes: [{ id: 'd1', kind: 'data', title: 'P-1077 · Area cm²', before: '5.69', after: '6.12', page: 1, side: 'b', where: 'page 1' },
    { id: 'd2', kind: 'data', title: 'P-1077 · Change', before: '+7.8%', after: '+15.9%', page: 2, side: 'b' }],
  counts: { all: 2, data: 2, template: 0, approval: 0 }, dataShown: 2, personalMasked: false,
  highlights: { a: [{ page: 1, x: 0.1, y: 0.2, w: 0.05, h: 0.01 }], b: [{ page: 1, x: 0.1, y: 0.2, w: 0.05, h: 0.01 }] }, ...over,
});

describe('Compare versions -- what it shows', () => {
  it('every page side by side; only pages with a change in Changes only', () => {
    expect(pagesShown(3, 4, comparison(), 'side')).toEqual([1, 2, 3, 4]);
    expect(pagesShown(3, 3, comparison(), 'changes')).toEqual([1, 2]);
    expect(pagesShown(3, 3, comparison({ changes: [], highlights: { a: [], b: [] } }), 'changes')).toEqual([]);
    expect(pagesShown(0, 0, null, 'side')).toEqual([1]);
  });

  it('a highlight box is a percentage of the page, kept visible and inside it', () => {
    expect(pct(0.4533)).toBe(45.33);
    expect(pct(0.001, 0.006)).toBe(0.6);
    expect(pct(1.4)).toBe(100);
    expect(pct(-0.2)).toBe(0);
  });

  it('a version in the pickers says when it was made and its state', () => {
    const v = { version: 1, createdAt: '2026-10-21T21:49:00Z', void: { reason: 'wrong' } } as ReportVersionRow;
    expect(versionWords(v)).toMatch(/^v1 · .+ · Void$/);
    expect(versionWords({ ...v, void: null, approval: { signed: true } } as never)).toMatch(/Signed$/);
  });
});

describe('Compare versions and a copy without names -- the calls', () => {
  const setup = () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    return { api: TestBed.inject(ReportLibraryApi), http: TestBed.inject(HttpTestingController) };
  };

  it('compares two versions by number', () => {
    const { api, http } = setup();
    let got: Comparison | undefined;
    api.compare('R1', 1, 2).subscribe(c => got = c);
    const req = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/compare`);
    expect(req.request.params.get('reportId')).toBe('R1');
    expect(req.request.params.get('a')).toBe('1');
    expect(req.request.params.get('b')).toBe('2');
    req.flush({ status: 'SUCCESS', data: comparison() });
    expect(got?.counts.data).toBe(2);
    http.verify();
  });

  it('the comparison PDF is a file', () => {
    const { api, http } = setup();
    api.comparePdf('R1', 1, 2).subscribe();
    const req = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/comparePdf`);
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['%PDF']));
    http.verify();
  });

  it('a copy without names: a signed link (its read named in the query), then the file', () => {
    const { api, http } = setup();
    let name: string | null = null;
    api.downloadDeidentified('R1', 2, 'PDF').subscribe(r => name = r.headers.get('Content-Disposition'));
    const link = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/deidentifiedLink`);
    expect(link.request.method).toBe('POST');
    expect(link.request.body).toEqual({ reportId: 'R1', version: 2, format: 'PDF' });
    expect(link.request.params.get('reportId')).toBe('R1');
    link.flush({ status: 'SUCCESS', data: { token: 't0k' } });
    const file = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/deidentifiedDownload`);
    expect(file.request.params.get('token')).toBe('t0k');
    file.flush(new Blob(['%PDF']), { headers: { 'Content-Disposition': 'attachment; filename="DEIDENTIFIED-report_v2.pdf"' } });
    expect(name).toContain('DEIDENTIFIED-');
    http.verify();
  });

  it("asks whether a version has a copy", () => {
    const { api, http } = setup();
    api.deidentified('R1', 2).subscribe();
    const req = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/deidentifiedCopy`);
    expect(req.request.params.get('version')).toBe('2');
    req.flush({ status: 'SUCCESS', data: { available: false, personalFields: [], rules: { dates: 'shift', freeText: true, picturesLeftOut: 0 } } });
    http.verify();
  });
});

describe('the designer -- personal data, a copy without names, PDF/A and tagged PDF', () => {
  const def = (template: Record<string, unknown>): TemplateDefinition => ({ schemaVersion: '1.0', template: { name: 'x', ...template } });
  const blocks: Block[] = [
    { id: 't', type: 'table', dataset: 'primary.visits', columns: [{ id: 'p', field: 'patient' }, { id: 'v', field: 'visitDate' }] } as Block,
    { id: 'h', type: 'heading', content: 'Report for {{primary.patient.name}}' } as Block,
  ];
  const sample = { visits: [{ patient: 'P-1077', visitDate: '2026-10-21' }], patient: { name: 'Synthetic A' } };

  it('lists the contract fields and the fields the blocks read, tagged or not', () => {
    const d = def({ dataContract: { fields: [{ path: 'patient.name', type: 'string', label: 'Patient', personal: true }, { path: 'visits', type: 'array' }] } });
    const rows = personalRows(d, blocks, ['primary'], sample);
    expect(rows.map(r => [r.path, r.personal, r.type])).toEqual([
      ['patient.name', true, 'string'], ['visits[*].patient', false, 'string'], ['visits[*].visitDate', false, 'date']]);
    expect(rows[0].label).toBe('Patient');
  });

  it('ticking a field not in the contract adds it, typed from the test data; unticking keeps it without the tag', () => {
    const d = def({});
    const row = personalRows(d, blocks, ['primary'], sample).find(r => r.path === 'visits[*].visitDate')!;
    setPersonal(d, row, true, 'year');
    expect(contractFields(d)).toEqual([{ path: 'visits[*].visitDate', type: 'date', personal: true, deidentify: 'year' }]);
    setPersonal(d, { ...row, inContract: true }, false);
    expect(contractFields(d)).toEqual([{ path: 'visits[*].visitDate', type: 'date' }]);
  });

  it('the copy rules and the PDF settings: defaults left out of the template', () => {
    const d = def({});
    expect(deidentifyRules(d)).toEqual({ dates: 'shift', freeText: true });
    setDeidentifyRule(d, 'dates', 'year');
    setDeidentifyRule(d, 'freeText', false);
    expect((d.template['output'] as Record<string, unknown>)['deidentify']).toEqual({ dates: 'year', freeText: false });
    setDeidentifyRule(d, 'dates', 'shift');
    setDeidentifyRule(d, 'freeText', true);
    expect((d.template['output'] as Record<string, unknown>)['deidentify']).toBeUndefined();
    setPdfConformance(d, 'archive', 'PDF/A-2b');
    setPdfConformance(d, 'tagged', true);
    expect(pdfConformance(d)).toEqual({ archive: 'PDF/A-2b', tagged: true });
    setPdfConformance(d, 'archive', '');
    setPdfConformance(d, 'tagged', undefined);
    expect(pdfConformance(d)).toEqual({ archive: '', tagged: undefined });
    expect(d.template['output']).toEqual({});
  });

  it('reads a type from the test data', () => {
    expect(typeOf(3)).toBe('integer');
    expect(typeOf(5.69)).toBe('number');
    expect(typeOf('2026-10-21T21:49:00Z')).toBe('datetime');
    expect(typeOf('2026-10-21')).toBe('date');
    expect(typeOf('P-1077')).toBe('string');
    expect(typeOf(undefined)).toBe('string');
  });
});
