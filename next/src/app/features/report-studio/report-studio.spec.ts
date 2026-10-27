import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../core/api/api.config';
import { ReportStudioApi, studioError } from './report-studio.api';
import { chipWord, isRunning, jsonProblem, originWord, size, stageWord } from './report-studio.model';
import { fileNameOf } from './report-files';

/** MIG-403: Report Studio's console side -- its prefixes (one page key each), its words, and how a refusal reads. */
function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
  return { api: TestBed.inject(ReportStudioApi), http: TestBed.inject(HttpTestingController) };
}

const ok = (data: unknown) => ({ status: 'SUCCESS', message: '', data });

describe('ReportStudioApi', () => {
  it('calls each page key\'s own prefix', () => {
    const { api, http } = setup();
    api.overview().subscribe();
    api.list().subscribe();
    api.publish('T1', 3, 'why').subscribe();
    api.previewHtml({ templateId: 'T1' }).subscribe();
    api.sources().subscribe();
    api.generate({ templateId: 'T1' }, 'console#k').subscribe();
    api.reports().subscribe();
    http.expectOne(`${API_BASE}/reportStudio.json/overview`).flush(ok({}));
    http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/fetchAll` && r.params.get('archived') === 'false').flush(ok({ templates: [], starters: [] }));
    const publish = http.expectOne(r => r.url === `${API_BASE}/reportPublish.json/publish`);
    expect(publish.request.params.get('templateId')).toBe('T1');
    expect(publish.request.body).toEqual({ revision: 3, changeSummary: 'why' });
    publish.flush(ok({}));
    http.expectOne(`${API_BASE}/reportPreview.json/html`).flush(ok({ problems: [], summary: {} }));
    http.expectOne(`${API_BASE}/reportData.json/sources`).flush(ok({ sources: [] }));
    const generate = http.expectOne(`${API_BASE}/reportGenerate.json/generate`);
    expect(generate.request.headers.get('Idempotency-Key')).toBe('console#k');
    generate.flush(ok({}));
    http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/reports`).flush(ok({ reports: [] }));
    http.verify();
  });

  it('downloads through a signed link, then the proxied file', () => {
    const { api, http } = setup();
    let got: Blob | null = null;
    api.download('R1', 2, 'PDF').subscribe(r => got = r.body);
    const link = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/downloadLink`);
    expect(link.request.method).toBe('POST');
    expect(link.request.body).toEqual({ reportId: 'R1', version: 2, format: 'PDF' });
    // ZT-A12 follow-up: the audited "report PDF" read takes its id from the query string as well.
    expect(link.request.urlWithParams).toBe(`${API_BASE}/reportLibrary.json/downloadLink?reportId=R1&version=2&format=PDF`);
    link.flush(ok({ token: 'abc.def' }));
    const file = http.expectOne(r => r.url === `${API_BASE}/reportLibrary.json/download`);
    expect(file.request.params.get('token')).toBe('abc.def');
    file.flush(new Blob(['%PDF']));
    expect(got).not.toBeNull();
    http.verify();
  });

  it('reads a refusal\'s code, sentence and problems', () => {
    const err = studioError(new HttpErrorResponse({ status: 422, error: { status: 'ERROR', code: 'TEMPLATE_INVALID', message: 'Not valid.',
      details: { problems: [{ severity: 'ERROR', stage: 'SCHEMA', code: 'TEMPLATE_INVALID', message: 'x', path: '$.template' }] } } }));
    expect(err.code).toBe('TEMPLATE_INVALID');
    expect(err.message).toBe('Not valid.');
    expect(err.problems.length).toBe(1);
    expect(studioError(new HttpErrorResponse({ status: 0 })).message).toContain('could not be reached');
    expect(studioError(new HttpErrorResponse({ status: 403, error: { status: 'ERROR', message: 'Report data is not part of your access.' } })).code)
      .toBe('FORBIDDEN');
  });
});

describe('Report Studio words', () => {
  it('names statuses and stages as people read them', () => {
    expect(chipWord('PUBLISHED')).toBe('Published');
    expect(chipWord('GENERATED')).toBe('Ready');
    expect(chipWord('RENDERING_PDF')).toBe('Running');
    expect(stageWord('RENDERING_PDF')).toBe('Rendering PDF');
    expect(isRunning('QUEUED')).toBe(true);
    expect(isRunning('FAILED')).toBe(false);
    expect(originWord({ origin: 'STARTER', originRef: 'starter:data-quality' })).toBe('From the data quality starter');
    expect(size(2048)).toBe('2.0 KB');
  });

  it('checks pasted JSON before it is sent', () => {
    expect(jsonProblem('')).toContain('Paste');
    expect(jsonProblem('{"a": 1}')).toBeNull();
    expect(jsonProblem('{"a": ')).toContain('not valid JSON');
  });

  it('reads a download\'s file name', () => {
    expect(fileNameOf("attachment; filename*=UTF-8''Quality_v1.pdf", 'x')).toBe('Quality_v1.pdf');
    expect(fileNameOf('attachment; filename="a b.html"', 'x')).toBe('a b.html');
    expect(fileNameOf(null, 'fallback.pdf')).toBe('fallback.pdf');
  });
});
