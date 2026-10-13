import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { ConversationsPage } from './conversations-page';

/**
 * All conversations (2026-10-12), the Explorer pattern: the server's facet counts on the left, its filters asked for,
 * and a picked row's detail -- the first question, what it came to, Open, Pin and Delete.
 */
describe('ConversationsPage', () => {
  function make() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ConversationsPage],
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(ConversationsPage);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const list = () => http.expectOne(r => r.url.endsWith('/aiPrompt.json/assistant/conversationList'));
    return { fixture, http, list, el: fixture.nativeElement as HTMLElement };
  }

  const answer = {
    status: 'SUCCESS', message: '', data: {
      total: 2,
      facets: { kind: { pipeline: 1, question: 1 }, outcome: { pipeline_saved: 1, answered: 1 }, updated: { today: 1, older: 1 }, pinned: { pinned: 0 } },
      rows: [
        { conversationId: 11, title: 'Design a pipeline: invoices', shortTitle: 'Approve and Save Invoices', kind: 'pipeline', outcome: 'pipeline_saved',
          pipelineKey: 41, pipelineId: 'APPROVE_INVOICES', taskDetailId: 77, firstQuestion: 'Design a pipeline: start from three sample invoice rows',
          messageCount: 6, dateUpdated: '2026-10-12T00:20:00', dateCreated: '2026-10-12T00:10:00' },
        { conversationId: 12, title: 'Which pipeline jobs do I have?', shortTitle: 'Pipeline jobs', kind: 'question', outcome: 'answered', messageCount: 3,
          dateUpdated: '2026-09-01T10:00:00' },
      ],
    },
  };

  it('counts each facet as the server says, and asks for what is ticked', () => {
    const { fixture, list, el } = make();
    list().flush(answer);
    fixture.detectChanges();
    const kind = el.querySelector('[data-facet-kind="pipeline"]')!.closest('label')!;
    expect(kind.textContent).toContain('Pipeline design');
    expect(kind.textContent).toContain('1');
    expect(el.querySelector('[data-facet-outcome="run_failed"]')).toBeNull();
    (el.querySelector('[data-facet-kind="pipeline"]') as HTMLInputElement).click();
    const next = list();
    expect(next.request.params.get('kind')).toBe('pipeline');
    next.flush(answer);
    (el.querySelector('[data-facet-day="today"]') as HTMLInputElement).click();
    const day = list();
    expect(day.request.params.get('updated')).toBe('today');
    expect(day.request.params.get('kind')).toBe('pipeline');
  });

  it('shows a picked conversation\'s first question and outcome, and opens it in the assistant', () => {
    const { fixture, list, el } = make();
    list().flush(answer);
    fixture.detectChanges();
    const row = el.querySelector('[data-conversation="11"]') as HTMLElement;
    expect(row.querySelector('[data-badge]')!.textContent!.trim()).toBe('Pipeline created');
    row.click();
    fixture.detectChanges();
    const detail = el.querySelector('[data-detail]')!;
    expect(detail.textContent).toContain('start from three sample invoice rows');
    expect(detail.textContent).toContain('Open the pipeline');
    const router = TestBed.inject(Router);
    const go = router.navigate.bind(router);
    let to: unknown = null;
    router.navigate = ((commands: unknown[], extras: unknown) => { to = { commands, extras }; return go(['/']); }) as typeof router.navigate;
    (detail.querySelector('[data-open]') as HTMLButtonElement).click();
    expect(to).toEqual({ commands: ['/ai/assistant'], extras: { queryParams: { c: 11 } } });
  });
});
