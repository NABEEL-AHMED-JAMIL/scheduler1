import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { TemplateDefinition, TemplateDetail } from '../report-studio.model';
import { ReportDesigner } from './designer';

/**
 * ZT-R37 (2026-10-26, AI designer retest): a step design's kept test sample reads its run's output, which the run's
 * retention removes after its keep date. The designer then waited forever under "That run has no such output, or it is not
 * yours to read." -- no page, and the AI sent "no test data". It drops the data, says so, and draws the page without it.
 *
 * (The harness is ZT-R29's:)
 * ZT-R29 (2026-10-22 AI designer retest): Data › "Show as image" on test data that names no bucket (pasted JSON, a run's
 * output, a test sample) made a picture block with an empty bucket, and every autosave after it was refused -- "Not saved"
 * and a schema error ("must be at least 1 characters long (at $.template.components[4].imageSource.bucket)"). The pictures
 * are read from the workspace's storage instead.
 */

const definition: TemplateDefinition = {
  schemaVersion: '1.0',
  template: {
    name: 'Wound assessment (synthetic)', datasets: [{ id: 'primary', rootPath: '$' }],
    components: [{ id: 'title', type: 'heading', level: 1, content: 'Wound assessment' },
      { id: 'footer', type: 'section', role: 'footer', children: [{ id: 'page', type: 'pageNumber' }] }],
  },
} as unknown as TemplateDefinition;

function designer() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ReportDesigner], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    // A Riverside administrator: the templates page is theirs.
    { provide: AuthService, useValue: { user: signal({ appUserId: 1015, tenantId: 1006 }), canOpen: () => true, isPlatformAdmin: () => false,
      hasAtLeast: () => true } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null } }] });
  const fixture = TestBed.createComponent(ReportDesigner);
  const http = TestBed.inject(HttpTestingController);
  const d = fixture.componentInstance;
  d.t.set({ templateId: '01M5J407ZHRVG7CMAPNYWDP91T', name: 'Wound assessment (synthetic)', status: 'DRAFT', samples: [], versions: [], reports: 0,
    draft: { version: 1, revision: 3, definition } } as unknown as TemplateDetail);
  d.def.set(JSON.parse(JSON.stringify(definition)) as TemplateDefinition);
  d.testSource.set({ connector: 'SAMPLE', sampleId: '01M5J73TA88ZC7FVYD9FDC3HW7' });
  d.testLabel.set('Test sample · The step\'s data');
  return { d, http };
}

const lost = (d: ReportDesigner) => (d as unknown as { testDataLost?: () => string }).testDataLost?.() ?? '';

describe('test data that cannot be read any more (ZT-R37)', () => {
  it('is dropped and said once, and the page is drawn without it', () => {
    const { d, http } = designer();
    (d as unknown as { drawNow(): void }).drawNow();
    http.expectOne(`${API_BASE}/reportPreview.json/canvas`).flush(
      { status: 'ERROR', code: 'DATA_SOURCE_NOT_FOUND', message: 'That run has no such output, or it is not yours to read.' },
      { status: 404, statusText: 'Not Found' });
    expect(d.testSource(), 'the lost data is no longer the canvas\'s').toBeNull();
    expect(d.drawError(), 'not an error the page waits under').toBe('');
    expect(lost(d)).toContain('Test sample · The step\'s data could not be read: That run has no such output');
    expect(lost(d)).toContain('pick other test data');
    (d as unknown as { drawNow(): void }).drawNow();
    const again = http.expectOne(`${API_BASE}/reportPreview.json/canvas`);
    expect(again.request.body.source, 'drawn without it').toBeUndefined();
  });

  it('keeps a passing outage an error, and the data', () => {
    const { d, http } = designer();
    (d as unknown as { drawNow(): void }).drawNow();
    http.expectOne(`${API_BASE}/reportPreview.json/canvas`).flush(
      { status: 'ERROR', code: 'DATA_SOURCE_UNAVAILABLE', message: 'The data could not be reached; try again.' }, { status: 502, statusText: 'Bad Gateway' });
    expect(d.testSource()).not.toBeNull();
    expect(d.drawError()).toContain('could not be reached');
    expect(lost(d)).toBe('');
  });
});
