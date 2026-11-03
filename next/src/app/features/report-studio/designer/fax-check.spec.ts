import { describe, expect, it } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Problem, TemplateDefinition, TemplateDetail } from '../report-studio.model';
import { ReportDesigner } from './designer';
import { DataProblems, dataProblems } from './data-problems';
import { Block } from './designer-model';

/**
 * Reports redesign, feature 15: showing the page as a fax runs the server's fax check (the layout's text sizes, colours,
 * rules, charts and pictures) and lists what a black-and-white fax would lose, by block; Page settings' Fax-safe sets the
 * theme's faxSafe. Synthetic wound report.
 */
const definition = {
  schemaVersion: '1.0',
  template: {
    name: 'Wound assessment (synthetic)', datasets: [{ id: 'primary', rootPath: '$' }],
    components: [{ id: 'title', type: 'heading', level: 1, content: 'Wound assessment' },
      { id: 'labs', type: 'table', name: 'Lab values', dataset: 'primary.rows', columns: [{ id: 'h', field: 'hba1c', label: 'HbA1c' }] }],
  },
} as unknown as TemplateDefinition;

const found: Problem[] = [
  { severity: 'WARNING', stage: 'RENDER', code: 'FAX_COLOUR_ONLY', componentId: 'labs',
    message: 'Colour alone sets some values apart (#F5E0DF fill); a black-and-white fax prints them like the rest.' } as Problem,
  { severity: 'WARNING', stage: 'RENDER', code: 'FAX_SMALL_TEXT', componentId: null, message: 'Text in 7.7 pt, under 8 pt, may not read on a fax (2 places).' } as unknown as Problem,
];

function designer() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ReportDesigner], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: AuthService, useValue: { user: signal({ appUserId: 1015, tenantId: 1006 }), canOpen: () => true, isPlatformAdmin: () => false,
      hasAtLeast: () => true } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null } }] });
  const fixture = TestBed.createComponent(ReportDesigner);
  const http = TestBed.inject(HttpTestingController);
  const d = fixture.componentInstance;
  d.t.set({ templateId: '01M5J407ZHRVG7CMAPNYWDP91T', name: 'Wound assessment (synthetic)', status: 'DRAFT', samples: [], versions: [], reports: 0,
    draft: { version: 1, revision: 3, definition } } as unknown as TemplateDetail);
  d.def.set(JSON.parse(JSON.stringify(definition)) as TemplateDefinition);
  return { d, http, fixture };
}

describe('the fax check in the designer (feature 15)', () => {
  it('runs when the page is shown as a fax, once for the same definition, and lists what a fax would lose', () => {
    const { d, http } = designer();
    // What the Show as switch's effect does (soon after Fax is picked).
    d.showAs.set('fax');
    d.runFaxCheck(false);
    const ask = http.expectOne(`${API_BASE}/reportPreview.json/faxCheck`);
    expect(ask.request.body.definition.template.name).toBe('Wound assessment (synthetic)');
    expect(d.faxStatus()).toContain('Checking');
    ask.flush({ status: 'SUCCESS', data: { problems: [], summary: { errors: 0, warnings: 0, valid: true }, records: 0, fax: found } });
    expect(d.faxProblems()).toEqual(found);
    // The same definition and data: not laid out again.
    d.runFaxCheck(false);
    http.expectNone(`${API_BASE}/reportPreview.json/faxCheck`);
    // Try again asks whatever was checked before.
    d.runFaxCheck(true);
    http.expectOne(`${API_BASE}/reportPreview.json/faxCheck`).flush({ status: 'SUCCESS', data: { problems: [], summary: {}, records: 0, fax: [] } });
    expect(d.faxStatus()).toBe('Fax check: nothing on these pages would be lost on a black-and-white fax.');
    // Shown as on screen, nothing is checked.
    d.showAs.set('screen');
    d.runFaxCheck(true);
    http.expectNone(`${API_BASE}/reportPreview.json/faxCheck`);
  });

  it('says why when the template has errors (no fax answer)', () => {
    const { d, http } = designer();
    d.showAs.set('fax');
    d.runFaxCheck(false);
    http.expectOne(`${API_BASE}/reportPreview.json/faxCheck`).flush({ status: 'SUCCESS', data: { problems: [], summary: {}, records: 0 } });
    expect(d.faxStatus()).toBe('The fax check runs once the template has no errors.');
  });

  it('sets and clears the theme\'s fax-safe switch', () => {
    const { d } = designer();
    expect(d.faxSafe()).toBe(false);
    d.setFaxSafe(true);
    expect((d.def()!.template['theme'] as Record<string, unknown>)['faxSafe']).toBe(true);
    expect(d.faxSafe()).toBe(true);
    d.setFaxSafe(false);
    expect((d.def()!.template['theme'] as Record<string, unknown>)['faxSafe']).toBeUndefined();
  });

  it('lists every finding under the fax heading, each with its block and what to do', () => {
    const blocks = definition.template['components'] as unknown as Block[];
    const rows = dataProblems(found, blocks, true);
    expect(rows.map(r => r.title)).toEqual(['Meaning carried by colour alone', 'Text too small for a fax']);
    expect(rows[0].component).toContain('Lab values');
    expect(rows[0].todo).toContain('Add a word or a mark');
    // The data banner leaves them out: they are not about the data.
    expect(dataProblems(found, blocks)).toEqual([]);
    TestBed.resetTestingModule();
    const fixture = TestBed.createComponent(DataProblems);
    fixture.componentRef.setInput('kind', 'fax');
    fixture.componentRef.setInput('problems', found);
    fixture.componentRef.setInput('blocks', blocks);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('[data-fax-problems]')?.getAttribute('aria-label')).toBe('Fax check');
    expect(el.textContent).toContain('Fax check: 2 things a black-and-white fax would lose (advisory)');
  });
});
