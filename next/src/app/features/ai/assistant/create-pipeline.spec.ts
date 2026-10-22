import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { ConversationApi } from './conversation.api';
import { CreatePipeline, CreatePipelineData } from './create-pipeline';
import { PipelineFlowArtifact } from './flow.model';
import { AuthService } from '../../../core/auth/auth.service';

/**
 * AI hard-workflow test (2026-10-13): the Create dialog says what will really happen -- a scheduled flow runs on its own --
 * and can create it without its schedule; for a pipeline already created it saves a new version and creates nothing.
 */
const flow = (trigger: PipelineFlowArtifact['trigger']): PipelineFlowArtifact => ({
  kind: 'pipeline-flow', name: 'Diabetes review', trigger, valid: true, saved: false, problems: [],
  flow: { nodes: [], edges: [] }, definition: { version: 1, steps: [{ key: 'read', task: 'read_api' }] },
});

function open(data: CreatePipelineData, tenantId: number | null = 2960) {
  const posted: { url: string; body: unknown }[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [CreatePipeline],
    providers: [provideZonelessChangeDetection(), provideRouter([]),
      { provide: DIALOG_DATA, useValue: data },
      { provide: DialogRef, useValue: { close: vi.fn() } },
      { provide: AuthService, useValue: { user: signal({ appUserId: 4640, tenantId }) } },
      { provide: ConversationApi, useValue: { pipelineCreated: vi.fn(() => of({ status: 'SUCCESS' })) } },
      { provide: HttpClient, useValue: {
        get: () => of({ status: 'SUCCESS', data: [{ sourceTaskTypeId: 1, serviceName: 'Pipelines' }] }),
        post: (url: string, body: unknown) => { posted.push({ url, body }); return of({ status: 'SUCCESS', message: 'Saved as version 2.', data: { version: 2 } }); } } }],
  });
  const fixture = TestBed.createComponent(CreatePipeline);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, posted };
}

describe('the Create pipeline dialog', () => {
  it('says a scheduled flow runs on its own, and creates it without the schedule when asked', () => {
    const { el, fixture } = open({ flow: flow({ type: 'schedule', every: 'day', at: '09:00' }), definition: flow({ type: 'manual' }).definition });
    expect(el.querySelector('[data-runs-when]')!.textContent).toContain('It runs every day at 09:00');
    expect(el.querySelector('[data-runs-when]')!.textContent).not.toContain('Nothing runs');
    const without = el.querySelector('[data-without-schedule]') as HTMLInputElement;
    without.checked = true;
    without.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(el.querySelector('[data-runs-when]')!.textContent).toContain('Nothing runs until you press Run now.');
    expect(fixture.componentInstance.trigger()).toEqual({ type: 'manual' });
  });

  it('updates the pipeline already created: a new version of its steps, nothing else made', async () => {
    const { fixture, posted } = open({ flow: flow({ type: 'manual' }), definition: flow({ type: 'manual' }).definition,
      update: { pipelineKey: 1428, pipelineId: 'DIABETES_REVIEW', jobId: 2996, taskDetailId: 2040, name: 'Diabetes review' } });
    await fixture.componentInstance.update();
    expect(posted.map(p => p.url.replace(/^.*\/api\/v1/, ''))).toEqual(['/pipeline.json/steps/save']);
    expect(posted[0].body).toMatchObject({ pipelineKey: 1428, format: 'json' });
    expect(fixture.componentInstance.created()).toMatchObject({ pipelineKey: 1428, version: 2 });
    await fixture.componentInstance.create();
    expect(posted).toHaveLength(1);
  });

  it('ZT-I1: a flow an approved document starts is created with its document trigger', async () => {
    const posted: { url: string; body: unknown }[] = [];
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [CreatePipeline],
      providers: [provideZonelessChangeDetection(), provideRouter([]),
        { provide: DIALOG_DATA, useValue: { flow: flow({ type: 'document', documentTypeId: 1009 }), definition: flow({ type: 'manual' }).definition } },
        { provide: DialogRef, useValue: { close: vi.fn() } },
        { provide: AuthService, useValue: { user: signal({ appUserId: 4640, tenantId: 2960 }) } },
        { provide: ConversationApi, useValue: { pipelineCreated: vi.fn(() => of({ status: 'SUCCESS' })) } },
        { provide: HttpClient, useValue: {
          get: (url: string) => of(url.includes('pipeline.json/list')
            ? { status: 'SUCCESS', data: { rows: [{ pipelineKey: 1500, pipelineId: 'DIABETES_REVIEW' }] } }
            : { status: 'SUCCESS', data: [{ sourceTaskTypeId: 1, serviceName: 'Pipelines' }] }),
          post: (url: string, body: unknown) => {
            posted.push({ url, body });
            if (url.includes('listSourceTask')) return of({ status: 'SUCCESS', data: [{ taskDetailId: 2100, pipelineId: 'DIABETES_REVIEW', taskName: 'Diabetes review' }] });
            if (url.includes('addSourceJob')) return of({ status: 'SUCCESS', message: 'Saved with jobId 3100.' });
            return of({ status: 'SUCCESS', message: 'Saved.', data: { version: 1 } });
          } } }],
    });
    const fixture = TestBed.createComponent(CreatePipeline);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('When a document of type 1009 is approved');
    expect(el.querySelector('[data-runs-when]')!.textContent).toContain('when a document of its type is approved');
    await fixture.componentInstance.create();
    const trigger = posted.find(p => p.url.endsWith('/sourceJob.json/documentTrigger/save'));
    expect(trigger?.body).toEqual({ jobId: 3100, documentTypeId: 1009, enabled: true });
    expect(fixture.componentInstance.steps().map(s => s.label)).toContain('Trigger');
    expect(fixture.componentInstance.created()).toMatchObject({ jobId: 3100 });
  });

  it('a sign-in with no workspace (a platform administrator) is told to open one, and cannot create (owner 2026-10-20)', () => {
    const { el, fixture } = open({ flow: flow({ type: 'manual' }), definition: flow({ type: 'manual' }).definition }, null);
    expect(el.textContent).toContain('Work in this workspace');
    expect(fixture.componentInstance.topics()).toEqual([]);
    expect(fixture.componentInstance.canCreate()).toBe(false);
  });
});
