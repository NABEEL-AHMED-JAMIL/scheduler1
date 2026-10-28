import { describe, expect, it, beforeEach } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { API_BASE } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { TemplateDefinition, TemplateDetail } from '../report-studio.model';
import { Proposal } from '../ai-designer.api';
import { ReportDesigner } from './designer';
import { AiPanel } from './ai-panel';

/**
 * Owner 2026-10-27: the designer's Components tab said "No component matches." while the palette was on its way and when
 * it failed; the Brand chip said "A profile not published" / "None yet" before the profiles answered; the Data tab's
 * fields read nothing while loading. The AI panel's suggested mappings sort, and its model check and earlier proposals
 * say when they could not be read.
 */
const definition = { schemaVersion: '1.0', template: { name: 'Wound assessment (synthetic)', components: [] } } as unknown as TemplateDefinition;

function designer() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ReportDesigner], providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
    { provide: AuthService, useValue: { user: signal({ appUserId: 1015, tenantId: 1006 }), canOpen: () => true, isPlatformAdmin: () => false,
      hasAtLeast: () => true } },
    { provide: WorkspaceDirectory, useValue: { remembered: () => null } }] });
  const fixture = TestBed.createComponent(ReportDesigner);
  const http = TestBed.inject(HttpTestingController);
  const d = fixture.componentInstance;
  d.t.set({ templateId: 'T1', name: 'Wound assessment (synthetic)', status: 'DRAFT', samples: [], versions: [], reports: 0,
    draft: { version: 1, revision: 3, definition } } as unknown as TemplateDetail);
  d.def.set(definition);
  return { d, http };
}

const refused = { status: 500, statusText: 'Server Error' };

beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } });

describe('the designer -- loading, empty, error (owner 2026-10-27)', () => {
  it('the palette is loading, not "No component matches.", until it answers; a failure says so', () => {
    const { d, http } = designer();
    d.loadPalette();
    expect(d.paletteState.pending()).toBe(true);
    http.expectOne(`${API_BASE}/reportStudio.json/schema`).flush({ status: 'ERROR' }, refused);
    http.expectOne(`${API_BASE}/reportStudio.json/components`).flush({ status: 'ERROR' }, refused);
    expect(d.paletteState.loading()).toBe(false);
    expect(d.paletteState.error()).toBe('The components could not be read.');
    expect(d.schemaError()).toContain('could not be read');
  });

  it('an empty palette answer is empty, not loading', () => {
    const { d, http } = designer();
    d.loadPalette();
    http.expectOne(`${API_BASE}/reportStudio.json/schema`).flush({ status: 'SUCCESS', data: { definitions: {} } });
    http.expectOne(`${API_BASE}/reportStudio.json/components`).flush({ status: 'SUCCESS', data: [] });
    expect(d.paletteState.pending()).toBe(false);
    expect(d.paletteState.error()).toBe('');
    expect(d.palette()).toEqual([]);
  });

  it('the Brand chip does not claim "None yet" before the profiles answer, nor when they fail', () => {
    const { d, http } = designer();
    d.loadUsable();
    expect(d.brandWord()).toBe('Loading brand profiles…');
    http.expectOne(r => r.url === `${API_BASE}/reportAsset.json/usable`).flush({ status: 'ERROR' }, refused);
    expect(d.brandWord()).toBe('Brand profiles not available right now');
    expect(d.usableState.error()).toBe('The brand profiles and assets could not be read.');
  });

  it('the Data tab\'s fields read says it is reading, then why it failed', () => {
    const { d, http } = designer();
    d.testSource.set({ connector: 'SAMPLE', sampleId: 'S1' });
    d.inspectTestData();
    expect(d.inspecting()).toBe(true);
    http.expectOne(`${API_BASE}/reportData.json/inspect`).flush(
      { status: 'ERROR', code: 'DATA_SOURCE_UNAVAILABLE', message: 'The data could not be reached; try again.' }, { status: 502, statusText: 'Bad Gateway' });
    expect(d.inspecting()).toBe(false);
    expect(d.inspectError()).toContain('could not be reached');
  });
});

const proposal = (): Proposal => ({
  proposalId: 7, templateId: 'T1', kind: 'SUGGEST_MAPPINGS', state: 'PROPOSED', baseVersion: 1, baseRevision: 3, patch: [],
  mappings: [{ field: 'woundArea', source: 'area_cm2', confidence: 0.4 }, { field: 'patient', source: 'name', confidence: 0.9 },
    { field: 'visitDate', source: 'date', confidence: 0.7 }],
} as unknown as Proposal);

function panel() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [AiPanel], providers: [provideHttpClient(), provideHttpClientTesting()] });
  TestBed.overrideComponent(AiPanel, { set: { template: '', imports: [] } });
  const fixture = TestBed.createComponent(AiPanel);
  const http = TestBed.inject(HttpTestingController);
  fixture.componentRef.setInput('templateId', 'T1');
  fixture.componentRef.setInput('version', 1);
  fixture.componentRef.setInput('revision', 3);
  fixture.detectChanges();
  return { c: fixture.componentInstance, http };
}

describe('the AI assistant -- the mappings sort; its reads say when they fail (owner 2026-10-27)', () => {
  it('keeps the AI\'s order, then sorts by how sure, the surest first, and back', () => {
    const { c, http } = panel();
    http.expectOne(`${API_BASE}/reportDesigner.json/status`).flush({ status: 'SUCCESS', data: { available: true, model: 'qwen3:8b', local: true } });
    http.expectOne(r => r.url === `${API_BASE}/reportDesigner.json/proposals`).flush({ status: 'SUCCESS', data: { proposals: [] } });
    c.open(proposal());
    expect(c.sortedMappings().map(m => m.field)).toEqual(['woundArea', 'patient', 'visitDate']);
    c.mappingSort.toggle('sure');
    expect(c.sortedMappings().map(m => m.confidence)).toEqual([0.9, 0.7, 0.4]);
    c.mappingSort.toggle('sure');
    expect(c.sortedMappings().map(m => m.confidence)).toEqual([0.4, 0.7, 0.9]);
    c.mappingSort.toggle('field');
    expect(c.sortedMappings().map(m => m.field)).toEqual(['patient', 'visitDate', 'woundArea']);
  });

  it('a model check or a history read that fails is said, with Try again', () => {
    const { c, http } = panel();
    expect(c.status()).toBeNull();
    http.expectOne(`${API_BASE}/reportDesigner.json/status`).flush({ status: 'ERROR' }, refused);
    http.expectOne(r => r.url === `${API_BASE}/reportDesigner.json/proposals`).flush({ status: 'ERROR' }, refused);
    expect(c.statusError()).toBe('Whether a model can answer could not be checked.');
    expect(c.status()?.available).toBe(false);
    expect(c.historyError()).toBe('The earlier proposals could not be read.');
    c.loadStatus();
    expect(c.statusError()).toBe('');
    http.expectOne(`${API_BASE}/reportDesigner.json/status`).flush({ status: 'SUCCESS', data: { available: true, model: 'qwen3:8b', local: true } });
    expect(c.status()?.available).toBe(true);
  });
});
