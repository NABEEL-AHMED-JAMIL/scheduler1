import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../../core/api/api.config';
import { Proposal } from '../ai-designer.api';
import { AiPanel } from './ai-panel';
import { applyPatch } from './json-patch';

/** Report Studio phase 6: the designer's AI assistant -- what it sends, how a proposal is shown, accepted and dismissed. */

const proposal = (over: Partial<Proposal> = {}): Proposal => ({
  proposalId: 1042, templateId: '01M5BPGV8Y75XV8AF1QGN63XJK', kind: 'SUGGEST_CHARTS', state: 'PROPOSED', baseVersion: 1, baseRevision: 3,
  model: 'qwen3:8b', connection: 'Local Ollama', dataSent: 'fields only (6)', summary: '1 chart: Wound area over time.',
  patch: [{ op: 'add', path: '/template/components/1', value: { id: 'ai-chart-1', type: 'chart', chartType: 'line' } }],
  changes: { added: [{ id: 'ai-chart-1', type: 'chart', label: 'Wound area over time' }], changed: [], removed: [] },
  ...over,
});

function panel() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [AiPanel], providers: [provideHttpClient(), provideHttpClientTesting()] });
  const fixture = TestBed.createComponent(AiPanel);
  const http = TestBed.inject(HttpTestingController);
  fixture.componentRef.setInput('templateId', '01M5BPGV8Y75XV8AF1QGN63XJK');
  fixture.componentRef.setInput('version', 1);
  fixture.componentRef.setInput('revision', 3);
  fixture.componentRef.setInput('editable', true);
  fixture.componentRef.setInput('data', {
    label: 'Wound clinic sample', shape: 'object',
    fields: [{ path: 'visits[].visitDate', type: 'date' }, { path: 'visits[].areaCm2', type: 'number' }],
    records: [{ visits: [{ visitDate: '2026-10-01', areaCm2: 3.8 }] }],
  });
  fixture.detectChanges();
  http.expectOne(`${API_BASE}/reportDesigner.json/status`).flush({ status: 'SUCCESS', data: { available: true, model: 'qwen3:8b', local: true, maxRecords: 20 } });
  http.expectOne(r => r.url === `${API_BASE}/reportDesigner.json/proposals`).flush({ status: 'SUCCESS', data: { proposals: [] } });
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const click = (selector: string) => { (el.querySelector(selector) as HTMLButtonElement).click(); fixture.detectChanges(); };
  return { fixture, http, el, click, c: fixture.componentInstance };
}

describe('the AI assistant', () => {
  it('sends the fields only, unless the person ticks sample values, and shows the proposal as changes', () => {
    const { http, el, click, c, fixture } = panel();
    c.choose('SUGGEST_CHARTS');
    fixture.detectChanges();
    click('[data-ai-ask]');
    const ask = http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`);
    expect(ask.request.body.version).toBe(1);
    expect(ask.request.body.revision).toBe(3);
    expect(ask.request.body.data.fields).toHaveLength(2);
    expect(ask.request.body.data.records).toBeUndefined();
    expect(ask.request.body.data.includeValues).toBe(false);
    ask.flush({ status: 'SUCCESS', data: proposal() });
    fixture.detectChanges();
    const card = el.querySelector('[data-ai-proposal]')!.textContent!;
    expect(card).toContain('Proposed');
    expect(card).toContain('+ Chart · Wound area over time');
    expect(card).toContain('Sent: fields only (6) · qwen3:8b on Local Ollama');

    c.includeValues.set(true);
    click('[data-ai-ask]');
    const again = http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`);
    expect(again.request.body.data.records).toHaveLength(1);
    expect(again.request.body.data.includeValues).toBe(true);
    again.flush({ status: 'SUCCESS', data: proposal({ proposalId: 1043 }) });
    http.verify();
  });

  it('asks on the saved draft only: unsaved changes are saved first', () => {
    const { click, c, fixture, http, el } = panel();
    const saves: unknown[] = [];
    c.save.subscribe(() => saves.push(1));
    fixture.componentRef.setInput('saveState', 'unsaved');
    c.words.set('A weekly wound summary');
    fixture.detectChanges();
    click('[data-ai-ask]');
    expect(saves).toHaveLength(1);
    expect(el.textContent).toContain('Save the draft first');
    http.verify();
  });

  it('shows a proposal on the page, accepts it and hands the patch to the designer', () => {
    const { click, c, fixture, http } = panel();
    const shown: (Proposal | null)[] = [];
    const applied: Proposal[] = [];
    c.preview.subscribe(p => shown.push(p));
    c.apply.subscribe(p => applied.push(p));
    c.choose('SUGGEST_CHARTS');
    fixture.detectChanges();
    click('[data-ai-ask]');
    http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`).flush({ status: 'SUCCESS', data: proposal() });
    fixture.detectChanges();
    fixture.componentRef.setInput('shown', true);
    click('[data-ai-preview]');
    expect(shown.map(p => p?.proposalId ?? null)).toEqual([1042]);
    click('[data-ai-accept]');
    const accept = http.expectOne(`${API_BASE}/reportDesigner.json/proposal/accept`);
    expect(accept.request.body).toEqual({ proposalId: 1042, version: 1, revision: 3 });
    accept.flush({ status: 'SUCCESS', data: proposal({ state: 'ACCEPTED' }) });
    fixture.detectChanges();
    expect(applied.map(p => p.state)).toEqual(['ACCEPTED']);
    expect(shown[shown.length - 1]).toBeNull();
    http.verify();
  });

  it('says why a stale proposal was refused, and never applies it', () => {
    const { click, c, fixture, http, el } = panel();
    const applied: Proposal[] = [];
    c.apply.subscribe(p => applied.push(p));
    c.choose('SUGGEST_CHARTS');
    fixture.detectChanges();
    click('[data-ai-ask]');
    http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`).flush({ status: 'SUCCESS', data: proposal() });
    fixture.detectChanges();
    click('[data-ai-accept]');
    http.expectOne(`${API_BASE}/reportDesigner.json/proposal/accept`).flush(
      { status: 'ERROR', message: 'The draft was saved since this proposal was made; ask again.',
        data: proposal({ state: 'INVALID', validation: { reason: 'The draft was saved since this proposal was made; ask again.' } }) },
      { status: 409, statusText: 'Conflict' });
    fixture.detectChanges();
    expect(applied).toHaveLength(0);
    expect(el.querySelector('[data-ai-invalid]')!.textContent).toContain('saved since');
    expect(el.querySelector('[data-ai-accept]')).toBeNull();
    http.verify();
  });

  it('a proposal made on an older revision cannot be accepted', () => {
    const { click, c, fixture, http, el } = panel();
    c.choose('SUGGEST_CHARTS');
    fixture.detectChanges();
    click('[data-ai-ask]');
    http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`).flush({ status: 'SUCCESS', data: proposal() });
    fixture.componentRef.setInput('revision', 4);
    fixture.detectChanges();
    expect((el.querySelector('[data-ai-accept]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.textContent).toContain('Out of date');
  });

  it('dismisses, and a question has nothing to accept', () => {
    const { click, c, fixture, http, el } = panel();
    c.words.set('a report');
    fixture.detectChanges();
    click('[data-ai-ask]');
    http.expectOne(`${API_BASE}/reportDesigner.json/draftTemplate`).flush({ status: 'SUCCESS',
      data: proposal({ kind: 'DRAFT_TEMPLATE', patch: [], changes: {}, summary: '', question: 'Which measurements should the report show?' }) });
    fixture.detectChanges();
    expect(el.textContent).toContain('Which measurements should the report show?');
    expect(el.querySelector('[data-ai-accept]')).toBeNull();
    click('[data-ai-dismiss]');
    http.expectOne(`${API_BASE}/reportDesigner.json/proposal/dismiss`).flush({ status: 'SUCCESS', data: proposal({ state: 'DISMISSED' }) });
    fixture.detectChanges();
    expect(el.querySelector('[data-ai-proposal]')).toBeNull();
    http.verify();
  });

  it('waits for a model it can use, on a draft it can edit', () => {
    const { fixture, el, c } = panel();
    fixture.componentRef.setInput('editable', false);
    fixture.detectChanges();
    expect(el.querySelector('[data-ai-why]')!.textContent).toContain('draft you can edit');
    expect(c.canAsk()).toBe(false);
  });
});

describe('the AI assistant on a pipeline step\'s data (ZT-I3, ZT-I4)', () => {
  it('ZT-I3: does not ask to explain the checks when they find no problem, and says why', () => {
    const { http, el, c, fixture } = panel();
    fixture.componentRef.setInput('problems', []);
    c.choose('EXPLAIN_VALIDATION');
    fixture.detectChanges();
    expect((el.querySelector('[data-ai-ask]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-ai-why]')!.textContent).toContain('The checks find no problem, so there is nothing to explain.');
    c.ask();
    http.expectNone(`${API_BASE}/reportDesigner.json/explainValidation`);
  });

  it('ZT-I4: tells the AI a CSV column whose sampled values are all numbers is a number, sending no value', () => {
    const { http, click, c, fixture } = panel();
    fixture.componentRef.setInput('data', {
      label: 'Test sample · The step\'s data', shape: 'list',
      fields: [{ path: 'site', type: 'string' }, { path: 'area_cm2', type: 'string' }, { path: 'change_pct', type: 'string' }, { path: 'patient', type: 'string' }],
      records: [{ site: 'Left heel', area_cm2: '3.82', change_pct: '-34.6', patient: 'P-1042' }, { site: 'Sacrum', area_cm2: '13.95', change_pct: '7.8', patient: 'P-1118' }],
    });
    c.choose('SUGGEST_CHARTS');
    fixture.detectChanges();
    click('[data-ai-ask]');
    const ask = http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`);
    expect(ask.request.body.data.fields).toEqual([{ path: 'site', type: 'string' }, { path: 'area_cm2', type: 'number' },
      { path: 'change_pct', type: 'number' }, { path: 'patient', type: 'string' }]);
    expect(ask.request.body.data.records).toBeUndefined();
  });
});

describe('the AI assistant with nothing to work on (ZT-R25)', () => {
  it('does not ask for mappings when the template reads no field yet, and says why', () => {
    const { http, el, c, fixture } = panel();
    fixture.componentRef.setInput('fieldsRead', 0);
    c.choose('SUGGEST_MAPPINGS');
    fixture.detectChanges();
    expect((el.querySelector('[data-ai-ask]') as HTMLButtonElement).disabled).toBe(true);
    expect(el.querySelector('[data-ai-why]')!.textContent).toContain('The template reads no data field yet, so there is nothing to map.');
    c.ask();
    http.expectNone(`${API_BASE}/reportDesigner.json/suggestMappings`);
  });

  it('says the service\'s "nothing to do" answer plainly, not as an error', () => {
    const { http, el, click, c, fixture } = panel();
    fixture.componentRef.setInput('fieldsRead', 3);
    c.choose('SUGGEST_MAPPINGS');
    fixture.detectChanges();
    click('[data-ai-ask]');
    http.expectOne(`${API_BASE}/reportDesigner.json/suggestMappings`).flush(
      { status: 'ERROR', message: 'Every field the template reads is in this test data: nothing to map.' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]'), 'not shown as an error').toBeNull();
    expect(el.querySelector('[data-ai-note]')!.textContent).toContain('nothing to map');
    c.choose('SUGGEST_CHARTS');
    fixture.detectChanges();
    expect(el.querySelector('[data-ai-note]'), 'another action clears it').toBeNull();
    click('[data-ai-ask]');
    http.expectOne(`${API_BASE}/reportDesigner.json/suggestCharts`).flush({ status: 'ERROR', message: 'The model could not answer.' }, { status: 502, statusText: 'Bad gateway' });
    fixture.detectChanges();
    expect(el.querySelector('[role=alert]')!.textContent, 'a failure is still an error').toContain('The model could not answer.');
  });
});

describe('a proposal\'s patch', () => {
  it('adds, replaces, removes and tests on a copy, and refuses what does not fit', () => {
    const doc = { template: { components: [{ id: 'a' }, { id: 'c' }] } };
    const out = applyPatch(doc, [
      { op: 'test', path: '/template/components/0/id', value: 'a' },
      { op: 'add', path: '/template/components/1', value: { id: 'b' } },
      { op: 'add', path: '/template/components/-', value: { id: 'd' } },
      { op: 'replace', path: '/template/components/0/id', value: 'a2' },
      { op: 'remove', path: '/template/components/2' },
      { op: 'add', path: '/template/description', value: 'x' },
    ]);
    expect(out.template.components.map(c => c.id)).toEqual(['a2', 'b', 'd']);
    expect((out.template as Record<string, unknown>)['description']).toBe('x');
    expect(doc.template.components).toHaveLength(2);
    expect(() => applyPatch(doc, [{ op: 'replace', path: '/template/nope', value: 1 }])).toThrow(/not in the draft/);
    expect(() => applyPatch(doc, [{ op: 'test', path: '/template/components/0/id', value: 'z' }])).toThrow(/does not hold/);
    expect(() => applyPatch(doc, [{ op: 'add', path: '/template/components/9', value: {} }])).toThrow(/list position/);
  });
});
