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
  describe('sorted on the server (owner 2026-10-27)', () => {
    it('sends no sort before a heading is picked, then the column and direction from the start, and Load more pages on in it', () => {
      try { localStorage.clear(); } catch { /* none */ }
      const { fixture, list, el } = make();
      const first = list();
      expect(first.request.params.has('sort')).toBe(false);
      first.flush({ ...answer, data: { ...answer.data, total: 80 } });
      fixture.detectChanges();
      const sortable = [...el.querySelectorAll('thead th')].filter(th => th.querySelector('button.th-sort')).map(th => th.textContent?.trim());
      expect(sortable).toEqual(['Conversation', 'Kind', 'Status', 'Messages', 'Updated']);
      const page = fixture.componentInstance;
      page.sort.toggle('messages');
      const sorted = list();
      expect(sorted.request.params.get('sort')).toBe('messages');
      expect(sorted.request.params.get('dir')).toBe('desc');
      expect(sorted.request.params.has('offset')).toBe(false);
      sorted.flush({ ...answer, data: { ...answer.data, total: 80 } });
      page.loadMore();
      const more = list();
      expect(more.request.params.get('offset')).toBe('2');
      expect(more.request.params.get('sort')).toBe('messages');
      expect(more.request.params.get('dir')).toBe('desc');
      more.flush({ ...answer, data: { ...answer.data, total: 80, rows: [] } });
      page.sort.toggle('title');
      const byTitle = list();
      expect(byTitle.request.params.get('sort')).toBe('title');
      expect(byTitle.request.params.get('dir')).toBe('asc');
      byTitle.flush(answer);
      try { localStorage.clear(); } catch { /* none */ }
    });
  });

  describe('loading, empty, error (owner 2026-10-27)', () => {
    it('is loading, not empty, and counts nothing, until the list answers', () => {
      const { fixture, el, list } = make();
      fixture.detectChanges();
      expect(fixture.componentInstance.state.pending()).toBe(true);
      expect(el.textContent).not.toContain('No conversations yet');
      expect(el.querySelector('[data-facets] .cp-count')).toBeNull();
      list();
    });

    it('says there is none yet once an empty list answers', () => {
      const { fixture, el, list } = make();
      list().flush({ status: 'SUCCESS', message: '', data: { total: 0, facets: {}, rows: [] } });
      fixture.detectChanges();
      expect(fixture.componentInstance.state.pending()).toBe(false);
      expect(el.textContent).toContain('No conversations yet');
    });

    it('says the list could not be read, in plain words, and not that there is none', () => {
      const { fixture, el, list } = make();
      list().flush('boom', { status: 500, statusText: 'Server Error' });
      fixture.detectChanges();
      expect(fixture.componentInstance.loading()).toBe(false);
      expect(fixture.componentInstance.error()).toBe('The conversations could not be read.');
      expect(el.textContent).toContain('Try again');
      expect(el.textContent).not.toContain('No conversations yet');
    });
  });
});
