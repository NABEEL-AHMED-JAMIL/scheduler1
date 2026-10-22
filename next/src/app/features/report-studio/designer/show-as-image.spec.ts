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
import { Block, componentsOf } from './designer-model';

/**
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
  d.testSource.set({ connector: 'INLINE_JSON', text: '{"woundList":[{"photo":"p-1042-after.jpg"}]}', format: 'JSON' });
  return { d, http };
}

const grid = (blocks: Block[]) => blocks.find(b => b.type === 'imageGrid') as (Block & { imageSource?: { bucket?: string } }) | undefined;

describe('Show as image (ZT-R29)', () => {
  it('reads the pictures from the workspace\'s storage when the test data names no bucket, so the draft still saves', () => {
    const { d, http } = designer();
    d.showAsImage('woundList[].photo');
    http.expectOne(`${API_BASE}/storage.json/buckets`).flush({ status: 'SUCCESS',
      data: [{ label: 'Riverside Health storage', bucket: 'riverside-health-s3', provider: 'S3' }] });
    const made = grid(componentsOf(d.def()!));
    expect(made, 'the picture grid is added').toBeTruthy();
    expect(made!.imageSource?.bucket).toBe('riverside-health-s3');
    expect(made!['binding']).toBe('primary.woundList');
    expect(made!['imageField']).toBe('photo');
  });

  it('keeps a bucket file\'s own bucket, and adds nothing when the workspace has no storage', () => {
    const { d, http } = designer();
    d.testSource.set({ connector: 'BUCKET_OBJECT', bucket: 'clinic-s3', key: 'wounds/visit.json' });
    d.showAsImage('woundList[].photo');
    http.expectNone(`${API_BASE}/storage.json/buckets`);
    expect(grid(componentsOf(d.def()!))!.imageSource?.bucket).toBe('clinic-s3');

    const other = designer();
    other.d.showAsImage('woundList[].photo');
    other.http.expectOne(`${API_BASE}/storage.json/buckets`).flush({ status: 'SUCCESS', data: [] });
    expect(grid(componentsOf(other.d.def()!)), 'no block whose every save would be refused').toBeUndefined();
  });
});
