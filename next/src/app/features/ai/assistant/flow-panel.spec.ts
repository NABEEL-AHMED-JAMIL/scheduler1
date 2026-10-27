import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { ToastService } from '../../../shared/ui/toast.service';
import { StepsApi } from '../../tasks/steps/steps.service';
import { FlowPanel } from './flow-panel';
import { PipelineFlowArtifact } from './flow.model';

/**
 * AI hard-workflow test (2026-10-13): the flow panel says what the check moved or left out, says a warning in plain words
 * instead of "Ready to create", and remembers the pipeline the conversation created -- after a reload too -- offering
 * Update pipeline for a changed flow and never Create a second time.
 */
const flow = (over: Partial<PipelineFlowArtifact> = {}): PipelineFlowArtifact => ({
  kind: 'pipeline-flow', name: 'Diabetes review', trigger: { type: 'manual' }, valid: true, saved: false, problems: [],
  flow: { nodes: [{ id: 'trigger-node', kind: 'trigger', label: 'Run on demand' }, { id: 'dedupe', kind: 'process', label: 'Dedupe', task: 'aggregate', problems: [] }],
    edges: [{ from: 'trigger-node', to: 'dedupe' }] },
  definition: { version: 1, steps: [{ key: 'dedupe', task: 'aggregate' }] },
  ...over,
});

function render(f: PipelineFlowArtifact) {
  const closed = new Subject<unknown>();
  const dialog = { open: vi.fn(() => ({ closed })) };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [FlowPanel],
    providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: StepsApi, useValue: { tasks: () => of({ status: 'SUCCESS', data: [] }), prompts: () => of([]), buckets: () => of([]) } },
      { provide: Dialog, useValue: dialog },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }],
  });
  const fixture = TestBed.createComponent(FlowPanel);
  fixture.componentRef.setInput('flow', f);
  fixture.componentRef.setInput('canCreate', true);
  fixture.componentRef.setInput('messageId', 41);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, dialog, closed };
}

describe('the flow panel', () => {
  it('shows the notes worked out for this flow', () => {
    const { el } = render(flow({ notes: ['Step join: "on" is one of join\'s settings; it was moved into the step\'s settings.'] }));
    expect(el.querySelector('[data-flow-notes]')!.textContent).toContain('"on" is one of join\'s settings');
  });

  it('says a warning in plain words, never "Ready to create"', () => {
    const warning = { step: 'dedupe', message: 'Step dedupe has no groupBy, so it collapses all the rows into ONE row.', kind: 'warning' };
    const { el } = render(flow({ problems: [warning] }));
    expect(el.querySelector('[data-verdict]')!.textContent).toContain('Check 1 warning');
    expect(el.querySelector('[data-verdict]')!.textContent).not.toContain('Ready to create');
    expect(el.querySelector('[data-flow-warning]')!.textContent).toContain('collapses all the rows into ONE row');
  });

  it('opens Create once, however often it is pressed', () => {
    const { el, fixture, dialog } = render(flow());
    const create = el.querySelector('[data-create]') as HTMLButtonElement;
    create.click();
    fixture.detectChanges();
    create.click();
    expect(dialog.open).toHaveBeenCalledTimes(1);
    expect((dialog.open.mock.calls[0] as unknown[])[1]).toMatchObject({ data: { messageId: 41, update: null } });
  });

  it('remembers after a reload that the pipeline was created, and offers Update for a changed flow', () => {
    const created = { pipelineKey: 1428, pipelineId: 'DIABETES_REVIEW', taskDetailId: 2040, jobId: 2996, name: 'Diabetes review', version: 1 };
    const saved = render(flow({ created, saved: true }));
    expect(saved.el.querySelector('[data-created]')!.textContent).toContain('Created as');
    expect(saved.el.querySelector('[data-created]')!.textContent).toContain('DIABETES_REVIEW');
    expect(saved.el.querySelector('[data-create]')).toBeNull();
    expect(saved.el.querySelector('[data-update]')).toBeNull();

    const changed = render(flow({ created, saved: false }));
    expect(changed.el.querySelector('[data-create]')).toBeNull();
    expect(changed.el.querySelector('[data-needs-update]')).not.toBeNull();
    (changed.el.querySelector('[data-update]') as HTMLButtonElement).click();
    expect((changed.dialog.open.mock.calls[0] as unknown[])[1]).toMatchObject({ data: { update: { pipelineKey: 1428 } } });
  });
});
