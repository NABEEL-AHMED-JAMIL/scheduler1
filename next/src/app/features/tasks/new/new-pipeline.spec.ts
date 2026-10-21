import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { NewPipeline, STEP_PAYLOAD } from './new-pipeline';

/**
 * UX review 2026-10-12 (P3): New pipeline starts from a choice -- the AI Assistant, steps, or a copy -- and never asks for a
 * Kafka connection, a topic or an XML payload first.
 */
const SOURCES = [
  { taskDetailId: 1932, taskName: 'Patient 360', pipelineId: 'PATIENT_360', taskStatus: 'Active' },
  { taskDetailId: 1500, taskName: 'Old XML task', pipelineId: null, taskStatus: 'Active' },
];

function screen(tenantId: number | null = 2960) {
  const posts: { url: string; body: any }[] = [];
  const get = vi.fn((url: string, opts?: { params?: Record<string, unknown> }) => {
    if (url.endsWith('/setting.json/topics')) return of({ status: 'SUCCESS', data: [{ sourceTaskTypeId: 11858, serviceName: 'etl.reference', status: 'Active' }] });
    if (url.endsWith('/pipeline.json/list')) {
      const q = String(opts?.params?.['q'] ?? '');
      const rows = [{ pipelineId: 'PATIENT_360', pipelineKey: 100480 }, { pipelineId: 'READMISSION_RISK', pipelineKey: 100500 },
        { pipelineId: 'PATIENT_360_COPY', pipelineKey: 100501 }].filter(r => r.pipelineId.startsWith(q));
      return of({ status: 'SUCCESS', data: { rows: posts.some(p => p.url.endsWith('/pipeline.json/save')) ? rows : rows.filter(r => r.pipelineKey === 100480) } });
    }
    if (url.endsWith('/pipeline.json/steps/definition')) return of({ status: 'SUCCESS', data: { stored: true, json: '{"version":1,"steps":[{"key":"read","task":"sample"}]}' } });
    throw new Error('unexpected GET ' + url);
  });
  const post = vi.fn((url: string, body: any) => {
    posts.push({ url, body });
    if (url.endsWith('/sourceTask.json/listSourceTask')) return of({ status: 'SUCCESS', data: SOURCES });
    if (url.endsWith('/sourceTask.json/addSourceTask')) return of({ status: 'SUCCESS', message: 'SourceTask successfully saved with ID 1950.' });
    return of({ status: 'SUCCESS', message: 'Saved.' });
  });
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(), provideRouter([]),
      { provide: HttpClient, useValue: { get, post } },
      { provide: AuthService, useValue: { canOpen: () => true, user: signal({ appUserId: 4640, tenantId }) } },
    ],
  });
  const fixture = TestBed.createComponent(NewPipeline);
  const router = TestBed.inject(Router);
  const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance, posts, navigate };
}

describe('New pipeline', () => {
  it('offers three starts, and none asks for Kafka or XML', () => {
    const { el } = screen();
    expect(Array.from(el.querySelectorAll('[data-start]')).map(s => s.getAttribute('data-start'))).toEqual(['assistant', 'steps', 'copy']);
    expect(el.textContent).not.toContain('Kafka connection');
    expect(el.querySelector('[data-test="event-source"]')?.hasAttribute('open')).toBe(false);
    expect(el.querySelector('[data-test="full-form"]')?.getAttribute('href')).toBe('/pipelines/new/form');
  });

  it('hands a description to the AI Assistant as a pipeline to design (ZT-P12)', () => {
    const { component, navigate } = screen();
    // "Read the visits file, ..." was taken as a question: the assistant read the file and answered, drawing no pipeline.
    component.ask.set('Flag readmissions within 30 days');
    component.toAssistant();
    expect(navigate).toHaveBeenCalledWith(['/ai/assistant'], { queryParams: { prompt: 'Design a pipeline: Flag readmissions within 30 days' } });
    component.ask.set('design a pipeline: keep the paid orders');
    component.toAssistant();
    expect(navigate).toHaveBeenLastCalledWith(['/ai/assistant'], { queryParams: { prompt: 'design a pipeline: keep the paid orders' } });
  });

  it('makes a pipeline to add steps to and opens its step builder', async () => {
    const { component, posts, navigate } = screen();
    component.name.set('Readmission risk');
    await component.createWithSteps();
    const save = posts.find(p => p.url.endsWith('/pipeline.json/save'))!;
    expect(save.body).toMatchObject({ pipelineName: 'Readmission risk', sourceTaskTypeId: 11858, status: 'Active' });
    expect(save.body.pipelineId).toMatch(/^READMISSION_RISK(_\d+)?$/);
    const task = posts.find(p => p.url.endsWith('/sourceTask.json/addSourceTask'))!;
    expect(task.body).toMatchObject({ taskName: 'Readmission risk', taskStatus: 'Active', taskPayload: STEP_PAYLOAD });
    expect(navigate).toHaveBeenCalledWith(['/pipelines', 1950, 'edit'], { queryParams: { tab: 'steps' } });
  });

  it('copies a pipeline\'s steps into one of its own, inactive', async () => {
    const { component, posts, navigate } = screen();
    expect(component.copyable().map(p => p.taskDetailId)).toEqual([1932]);
    component.pickCopy(1932);
    expect(component.copyName()).toBe('Patient 360 (copy)');
    await component.createCopy();
    const steps = posts.find(p => p.url.endsWith('/pipeline.json/steps/save'))!;
    expect(steps.body.text).toContain('"task":"sample"');
    expect(steps.body.pipelineKey).not.toBe(100480);
    expect(posts.find(p => p.url.endsWith('/sourceTask.json/addSourceTask'))!.body).toMatchObject({ taskStatus: 'Inactive' });
    expect(navigate).toHaveBeenCalledWith(['/pipelines', 1950, 'edit'], { queryParams: { tab: 'steps' } });
  });

  it('sends a sign-in with no workspace (a platform administrator) to open one first, and reads no topics', () => {
    const { el, posts } = screen(null);
    expect(el.querySelector('[data-test="needs-workspace"]')).not.toBeNull();
    expect(el.querySelector('[data-test="start-with"]')).toBeNull();
    expect(el.querySelector('[data-test="needs-workspace"] a')?.getAttribute('href')).toBe('/platform/workspaces');
    expect(posts.length).toBe(0);
  });
});
