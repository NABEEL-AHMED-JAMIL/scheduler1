import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { API_BASE } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { TemplateDefinition, TemplateDetail } from '../report-studio.model';
import { ReportDesigner, jobIdsOf, stepKeyOf } from './designer';
import { TestDataChoice, TestDataData } from './test-data-panel';

/**
 * ZT-R39 (AI designer retest, 2026-10-26): a step design's test data picked from a run pointed at the run's output, which
 * the job keeps a day; then the designer had nothing to draw or to give the AI. Picked from a run, a step design's data is
 * kept with the design at once -- media freezes a capped, masked copy -- and the canvas reads the kept sample. The Test data
 * panel is told the step and its pipeline's schedules, to offer the step's own input rows. (ZT-R37's harness.)
 */
const definition = {
  schemaVersion: '1.0',
  template: { name: 'AI designer retest · generate_report (step design)', datasets: [{ id: 'primary', rootPath: '$' }],
    components: [{ id: 'title', type: 'heading', level: 1, content: 'Wound visits' }] },
} as unknown as TemplateDefinition;
const ID = '01M5J73T8KXCSGK28A07AHNR2R';
const NAME = 'Run #1871 · the step\'s data';
const frozen = { sampleId: '01M5X0000000000000000000ZZ', templateId: ID, name: NAME, kind: 'INLINE_JSON', sourceKind: 'FROZEN', format: 'JSON',
  frozen: { jobQueueId: 1871, runDatasetId: 9101, records: 4, ofRecords: 4, capped: false, masked: ['patient_name'] } };

function designer(ownerKind: 'STEP' | 'WORKSPACE', choice: TestDataChoice) {
  const opened: TestDataData[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ReportDesigner], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: AuthService, useValue: { user: signal({ appUserId: 1015, tenantId: 1006 }), canOpen: () => true, isPlatformAdmin: () => false,
      hasAtLeast: () => true } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null } },
    { provide: Dialog, useValue: { open: (_: unknown, config: { data: TestDataData }) => { opened.push(config.data); return { closed: of(choice) }; } } }] });
  const fixture = TestBed.createComponent(ReportDesigner);
  fixture.componentRef.setInput('templateId', ID);
  fixture.componentRef.setInput('step', 'generate_report');
  fixture.componentRef.setInput('jobs', '1097');
  const http = TestBed.inject(HttpTestingController);
  const d = fixture.componentInstance;
  d.t.set({ templateId: ID, name: 'AI designer retest · generate_report (step design)', status: 'DRAFT', samples: [], versions: [], reports: 0,
    ownerKind, ownerRef: 'pipeline:1161#generate_report', draft: { version: 1, revision: 3, definition } } as unknown as TemplateDetail);
  d.def.set(JSON.parse(JSON.stringify(definition)) as TemplateDefinition);
  return { d, http, opened };
}

const runPick: TestDataChoice = { source: { connector: 'RUN_OUTPUT', jobQueueId: 1871, runDatasetId: 9101 }, rootPath: '$' };

describe('a step design\'s test data picked from a run (ZT-R39)', () => {
  it('is kept with the design at once and the canvas reads the kept copy', () => {
    const { d, http, opened } = designer('STEP', runPick);
    d.openTestData();
    expect(opened[0].step).toEqual({ key: 'generate_report', jobIds: [1097] });
    const keep = http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/sample/save`);
    expect(keep.request.params.get('templateId')).toBe(ID);
    expect(keep.request.body).toEqual({ name: NAME, source: runPick.source });
    keep.flush({ status: 'SUCCESS', message: 'Test sample saved with the template.', data: frozen });
    http.expectOne(r => r.url === `${API_BASE}/reportTemplate.json/fetchById`).flush({ status: 'SUCCESS', message: '',
      data: { templateId: ID, samples: [frozen], versions: [] } });
    expect(d.testSource()).toEqual({ connector: 'SAMPLE', sampleId: frozen.sampleId });
    expect(d.t()!.samples.map(s => s.name)).toEqual([NAME]);
  });

  it('is not kept for a workspace template: the run\'s output stays a pointer, as before', () => {
    const { d, http, opened } = designer('WORKSPACE', runPick);
    d.openTestData();
    expect(opened[0].step).toBeNull();
    expect(http.match(r => r.url === `${API_BASE}/reportTemplate.json/sample/save`)).toHaveLength(0);
    expect(d.testSource()).toEqual(runPick.source);
  });

  it('reads the step and the schedules from the design and its link', () => {
    expect(stepKeyOf('pipeline:1161#generate_report')).toBe('generate_report');
    expect(stepKeyOf(null)).toBe('');
    expect(jobIdsOf('1097, 1098,x,-3')).toEqual([1097, 1098]);
    expect(jobIdsOf(undefined)).toEqual([]);
  });
});
