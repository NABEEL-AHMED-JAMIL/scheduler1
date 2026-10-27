import { describe, it, expect, vi, afterEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { ReportStudioApi } from '../../report-studio/report-studio.api';
import { ReportDesignSettings, ReportStepDesign } from './report-step-design';
import { StepsApi } from './steps.service';
import { withoutProperties } from './step-panel';
import { JsonSchema } from './steps.model';

/**
 * Report Studio phase 5 (plan 1.11.1, owner 2026-10-19): a generate_report step designs its report inside the step, from
 * its own data -- the upstream step's rows of the pipeline's latest run -- or uses a saved template.
 */
const design = { templateId: 'D1', name: 'Wound clinic weekly · Generate report (step design)', currentPublishedVersion: null, hasDraft: true,
  versions: [{ version: 1, state: 'DRAFT' }], ownerKind: 'STEP', created: true };

function render(inputs: Record<string, unknown> = {}) {
  const api = {
    stepDesign: vi.fn(() => of(design)),
    template: vi.fn(() => of({ ...design, currentPublishedVersion: 2, versions: [{ version: 1, state: 'PUBLISHED' }, { version: 2, state: 'PUBLISHED' }] })),
    list: vi.fn(() => of({ templates: [{ templateId: 'T9', name: 'Wound care summary', currentPublishedVersion: 3 }] })),
    create: vi.fn(() => of({ templateId: 'T10', name: 'Wound clinic weekly' })),
  };
  const steps = {
    runs: vi.fn((id: number) => of({ data: { jobQueues: id === 11 ? [{ jobQueueId: 900 }] : [{ jobQueueId: 905 }, { jobQueueId: 903 }] } })),
    timeline: vi.fn(() => of({ data: { steps: [{ key: 'clean', datasets: [{ runDatasetId: 4412, name: 'rows' }] }] } })),
  };
  const toast = { success: vi.fn(), error: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), { provide: ReportStudioApi, useValue: api }, { provide: StepsApi, useValue: steps },
      { provide: ToastService, useValue: toast }],
  });
  const fixture = TestBed.createComponent(ReportStepDesign);
  const all = { pipelineKey: 77, pipelineName: 'Wound clinic weekly', stepKey: 'weekly_report', stepName: 'Generate report', upstreamKey: 'clean',
    jobIds: [11, 12], ...inputs };
  for (const [k, v] of Object.entries(all)) fixture.componentRef.setInput(k, v);
  const changed: ReportDesignSettings[] = [];
  fixture.componentInstance.changed.subscribe(c => changed.push(c));
  fixture.detectChanges();
  return { fixture, c: fixture.componentInstance, api, steps, toast, changed, el: fixture.nativeElement as HTMLElement };
}

afterEach(() => vi.restoreAllMocks());

describe('ReportStepDesign', () => {
  it('starts on "Design the report here", and asks for the pipeline to be saved first when it never was', () => {
    const { c, el } = render({ pipelineKey: null });
    expect(c.mode()).toBe('STEP');
    expect(el.querySelector('[data-save-first]')).not.toBeNull();
    expect(el.querySelector('[data-design-report]')).toBeNull();
  });

  it('seeds the design with the upstream step\'s rows of the newest run of any schedule, then opens the designer in a new tab', async () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    const { c, api, steps, changed } = render();
    c.createDesign();
    await Promise.resolve();
    expect(steps.runs).toHaveBeenCalledTimes(2);
    expect(steps.timeline).toHaveBeenCalledWith(905);
    expect(api.stepDesign).toHaveBeenCalledWith({ jobId: 77, stepKey: 'weekly_report', pipelineName: 'Wound clinic weekly', stepName: 'Generate report',
      source: { connector: 'RUN_OUTPUT', jobQueueId: 905, runDatasetId: 4412 } });
    expect(changed.at(-1)).toEqual({ design: 'STEP', templateId: 'D1', templateVersion: 'latest' });
    expect(open).toHaveBeenCalledTimes(1);
    // ZT-R39: the pipeline's schedules go with it, so the designer's Test data offers this step's input rows.
    expect(String(open.mock.calls[0][0])).toMatch(/^\/reports\/templates\/D1\/design\?step=weekly_report&jobs=11,12&back=/);
    expect(open.mock.calls[0][1]).toBe('_blank');
  });

  it('shows the save\'s problem with the design until the step has one (ZT-R40)', () => {
    const problem = 'This report step has no design yet: open the step and design it or pick a saved template.';
    const { el, fixture } = render({ problem });
    expect(el.querySelector('[data-design-problem]')?.textContent).toContain(problem);
    expect(el.querySelector('[data-design-report]')).not.toBeNull();
    fixture.componentRef.setInput('config', { design: 'TEMPLATE', templateId: 'T9', templateVersion: 'latest' });
    fixture.detectChanges();
    expect(el.querySelector('[data-design-problem]')).toBeNull();
  });

  it('makes a design without data when the pipeline has not run (the designer\'s Test data takes pasted JSON)', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { c, api } = render({ jobIds: [] });
    c.createDesign();
    await Promise.resolve();
    expect(api.stepDesign).toHaveBeenCalledWith(expect.objectContaining({ source: null }));
  });

  it('shows a step\'s existing design with its published versions, pins one, and saves it as a template under a name', () => {
    const { c, api, changed, toast, fixture, el } = render({ config: { design: 'STEP', templateId: 'D1', templateVersion: 'latest' } });
    c.ngOnInit();
    fixture.detectChanges();
    expect(api.template).toHaveBeenCalledWith('D1');
    expect(c.publishedVersions(c.design()!)).toEqual([2, 1]);
    c.setVersion('1');
    expect(changed.at(-1)).toEqual({ design: 'STEP', templateId: 'D1', templateVersion: '1' });
    c.askName(c.design()!);
    expect(c.naming()).toBe('Wound clinic weekly · Generate report');
    c.saveAsTemplate();
    expect(api.create).toHaveBeenCalledWith({ from: 'COPY', name: 'Wound clinic weekly · Generate report', copyOf: { templateId: 'D1' } });
    expect(toast.success).toHaveBeenCalledWith('Saved as the template Wound clinic weekly.');
    expect(el.querySelector('[data-open-designer]')).not.toBeNull();
  });

  it('uses a saved template: the published ones to pick from, and the version', () => {
    const { c, api, changed } = render();
    c.setMode('TEMPLATE');
    expect(api.list).toHaveBeenCalledWith({ state: 'LIVE', limit: 200 });
    expect(changed.at(-1)).toEqual({ design: 'TEMPLATE', templateId: undefined, templateVersion: 'latest' });
    c.pickTemplate('T9');
    expect(changed.at(-1)).toEqual({ design: 'TEMPLATE', templateId: 'T9', templateVersion: 'latest' });
  });
});

describe('withoutProperties', () => {
  it('leaves the design keys to the editor and the rest to the form', () => {
    const schema = { type: 'object', required: ['templateId', 'reportName'], properties: { design: {}, templateId: {}, templateVersion: {}, reportName: {} } } as unknown as JsonSchema;
    const out = withoutProperties(schema, ['design', 'templateId', 'templateVersion']) as unknown as { properties: object; required: string[] };
    expect(Object.keys(out.properties)).toEqual(['reportName']);
    expect(out.required).toEqual(['reportName']);
  });
});
