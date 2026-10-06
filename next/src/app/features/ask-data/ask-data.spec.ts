import { describe, it, expect, vi } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Observable, Subject, of, throwError } from 'rxjs';
import { AskDataApi } from './ask-data.api';
import { AskAnswer, chartItems, csvOf, refusalText, searchedText, segments } from './ask-data.model';
import { AskData } from './ask-data';

const SEARCHED = { documents: 1, runOutputs: 2 };

const ANSWER: AskAnswer = {
  question: 'Which wounds are worsening?',
  answer: 'WC-0002 (sacrum) is worsening, up 10% since 2026-09-10 [1]. The invoice is unrelated [9].',
  notFound: false,
  sources: [{ n: 1, kind: 'run-output', title: 'wound-results.json, run 7447 of Wound intake job', link: '/pipelines/schedules/2853/runs/7447/logs',
    excerpt: 'Row 2: case_id: WC-0002; wound_site: sacrum; change_pct: 10.0; trend: worsening', cited: true }],
  model: 'gemma3:4b', connection: 'Local Ollama', runId: 2001, latencyMs: 8400, searched: SEARCHED, warnings: [],
};

const NOT_FOUND: AskAnswer = { ...ANSWER, question: 'Capital of France?', answer: "I can't find that in your data.", notFound: true, sources: [],
  model: null, connection: null, runId: null };

interface Setup {
  suggestions?: () => Observable<unknown>;
  ask?: (q: string) => Observable<unknown>;
}

function render(setup: Setup = {}) {
  const api = {
    suggestions: vi.fn(setup.suggestions ?? (() => of({ status: 'SUCCESS', data: {
      suggestions: ['What is the total on invoice 77104?', 'Which rows of wound-results have trend "worsening"?'], searched: SEARCHED, warnings: [] } }))),
    ask: vi.fn(setup.ask ?? ((q: string) => of({ status: 'SUCCESS', data: { ...ANSWER, question: q } }))),
  };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [AskData],
    providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AskDataApi, useValue: api }],
  });
  const fixture = TestBed.createComponent(AskData);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const q = (sel: string) => el.querySelector(sel) as HTMLElement | null;
  return { fixture, el, q, api, screen: fixture.componentInstance };
}

describe('Ask your data -- the pure pieces', () => {
  it('cuts an answer into text and the citations it was given', () => {
    expect(segments('A [1] b [2][3] c [9].', new Set([1, 2, 3]))).toEqual([
      { text: 'A ' }, { cite: 1 }, { text: ' b ' }, { cite: 2 }, { cite: 3 }, { text: ' c [9].' }]);
    expect(segments('No citations.', new Set())).toEqual([{ text: 'No citations.' }]);
    expect(segments('', new Set([1]))).toEqual([]);
  });

  it('says what was searched and why a question was refused', () => {
    expect(searchedText({ documents: 1, runOutputs: 2 })).toBe('1 document and 2 pipeline results');
    expect(searchedText(null)).toBe('');
    expect(refusalText(429, 'Wait a moment.')).toBe('Wait a moment.');
    expect(refusalText(403, null)).toContain('not part of your access');
    expect(refusalText(0, '')).toContain('could not be reached');
    expect(refusalText(504, null)).toContain('too long');
  });
});

describe('Ask your data -- as drawn', () => {
  it('opens with examples built from the workspace and what it searches', () => {
    const { el, q, api } = render();
    expect(api.suggestions).toHaveBeenCalledTimes(1);
    expect(q('[data-test=searched]')!.textContent).toContain('1 document and 2 pipeline results');
    const pills = Array.from(el.querySelectorAll('[data-test=suggestions] button')).map(b => b.textContent!.trim());
    expect(pills).toEqual(['What is the total on invoice 77104?', 'Which rows of wound-results have trend "worsening"?']);
    expect(q('[data-test=ask]')!.hasAttribute('disabled')).toBe(true);
  });

  it('asks, then shows the answer with numbered citations that open their sources', () => {
    const { fixture, el, q, api, screen } = render();
    screen.question.set('  Which wounds   are worsening? ');
    fixture.detectChanges();
    expect(q('[data-test=ask]')!.hasAttribute('disabled')).toBe(false);
    (q('[data-test=ask]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(api.ask).toHaveBeenCalledWith('Which wounds are worsening?');
    expect(screen.question()).toBe('');
    const turn = q('[data-turn]')!;
    expect(turn.getAttribute('data-state')).toBe('answered');
    const answer = turn.querySelector('[data-test=answer]')!;
    // [1] is a citation; [9] names no source it was given and stays text.
    expect(Array.from(answer.querySelectorAll('button')).map(b => b.textContent)).toEqual(['[1]']);
    expect(answer.textContent).toContain('[9]');
    const source = turn.querySelector('[data-source="1"]')!;
    expect(source.querySelector('a')!.getAttribute('href')).toBe('/pipelines/schedules/2853/runs/7447/logs');
    expect(source.textContent).toContain('Pipeline result');
    expect(source.textContent).toContain('WC-0002');
    expect(turn.querySelector('[data-test=meta]')!.textContent).toContain('gemma3:4b on Local Ollama in 8.4s');

    (answer.querySelector('button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(source.classList).toContain('bg-accent-soft');
    expect(el.textContent).toContain('This session');
  });

  it('a suggestion asks itself', () => {
    const { el, api } = render();
    (el.querySelector('[data-test=suggestions] button') as HTMLButtonElement).click();
    expect(api.ask).toHaveBeenCalledWith('What is the total on invoice 77104?');
  });

  it('says plainly when the data does not hold the answer, with no sources', () => {
    const { fixture, q, screen } = render({ ask: () => of({ status: 'SUCCESS', data: NOT_FOUND }) });
    screen.ask('Capital of France?');
    fixture.detectChanges();
    expect(q('[data-test=not-found]')!.textContent).toContain("I can't find that in your data.");
    expect(q('[data-test=sources]')).toBeNull();
    expect(q('[data-test=meta]')!.textContent).toContain('No model was asked');
  });

  it('shows the working state, and one question at a time', () => {
    const pending = new Subject<unknown>();
    const { fixture, q, screen, api } = render({ ask: () => pending });
    screen.ask('Which wounds are worsening?');
    fixture.detectChanges();
    expect(q('[data-test=asking]')!.textContent).toContain('Reading your data');
    screen.ask('Another?');
    expect(api.ask).toHaveBeenCalledTimes(1);
    pending.next({ status: 'SUCCESS', data: ANSWER });
    fixture.detectChanges();
    expect(q('[data-turn]')!.getAttribute('data-state')).toBe('answered');
  });

  it('shows a refusal in the server\'s words and asks again on Try again', () => {
    let calls = 0;
    const { fixture, el, q, screen, api } = render({ ask: () => ++calls === 1
      ? throwError(() => new HttpErrorResponse({ status: 429, error: { status: 'ERROR', message: 'That is a lot of questions in a minute.' } }))
      : of({ status: 'SUCCESS', data: ANSWER }) });
    screen.ask('Which wounds are worsening?');
    fixture.detectChanges();
    expect(q('[data-test=error]')!.textContent).toContain('That is a lot of questions in a minute.');
    (q('[data-test=error] button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.ask).toHaveBeenCalledTimes(2);
    expect(el.querySelectorAll('[data-turn]').length).toBe(1);
    expect(q('[data-turn]')!.getAttribute('data-state')).toBe('answered');
  });

  it('keeps the session\'s questions newest first until cleared', () => {
    const { fixture, el, screen } = render();
    screen.ask('First?');
    screen.ask('Second?');
    fixture.detectChanges();
    expect(Array.from(el.querySelectorAll('[data-turn] h3')).map(h => h.textContent!.trim())).toEqual(['Second?', 'First?']);
    screen.clear();
    fixture.detectChanges();
    expect(el.querySelectorAll('[data-turn]').length).toBe(0);
  });

  it('says when there is nothing to ask about yet, and when the examples could not be read', () => {
    const empty = render({ suggestions: () => of({ status: 'SUCCESS', data: { suggestions: [], searched: { documents: 0, runOutputs: 0 },
      warnings: ['Pipeline results were not searched: Schedules is not part of your access.'] } }) });
    expect(empty.q('[data-test=nothing]')).not.toBeNull();
    expect(empty.q('[data-test=warning]')!.textContent).toContain('Pipeline results were not searched');

    const failed = render({ suggestions: () => throwError(() => new HttpErrorResponse({ status: 403, error: null })) });
    expect(failed.q('[data-test=suggestions]')!.textContent).toContain('not part of your access');
  });

  it('does not ask an empty or too long question', () => {
    const { screen, api } = render();
    screen.ask('   ');
    screen.ask('x'.repeat(501));
    expect(api.ask).not.toHaveBeenCalled();
  });
});

describe('Ask your data -- a question answered by a query (MIG-283)', () => {
  const QUERY = {
    sql: 'SELECT city, sum(amount) AS total FROM dataset GROUP BY city ORDER BY total DESC\nLIMIT 200',
    dataset: { datasetId: 1002, name: 'Customers small', connection: 's3', path: 'customers.csv' },
    columns: ['city', 'total'], rows: [['Austin', '120.5'], ['Paris, FR', '80']], rowCount: 2, truncated: false,
    chart: { type: 'bar' as const, label: 'city', value: 'total' },
  };

  it('shows the sentence, the chart, the rows and the query it ran -- and hands the query to Analytics Studio', () => {
    const { screen, fixture, q } = render({ ask: (question: string) => of({ status: 'SUCCESS', data: {
      question, kind: 'query', answer: '2 rows; the first: Austin, 120.5.', notFound: false, sources: [], query: QUERY,
      model: 'gemma3:1b', connection: 'Local Ollama', runId: 9, latencyMs: 2100, searched: { datasets: 1 }, warnings: [] } }) });
    screen.ask('Total amount by city');
    fixture.detectChanges();
    expect(q('[data-test="query-answer"] [data-test="answer"]')?.textContent).toContain('2 rows; the first: Austin, 120.5.');
    expect(q('[data-test="query-chart"]')?.textContent).toContain('Austin');
    expect(q('[data-test="query-rows"]')?.textContent).toContain('Paris, FR');
    expect(q('[data-test="query-sql"]')?.textContent).toContain('GROUP BY city');
    expect(q('[data-test="open-analytics"]')?.getAttribute('href')).toContain('sql=SELECT');
    expect(q('[data-test="meta"]')?.textContent).toContain('1 dataset');
  });

  it('turns the rows into CSV and the chart into bars', () => {
    expect(csvOf(QUERY)).toBe('city,total\r\nAustin,120.5\r\n"Paris, FR",80\r\n');
    expect(chartItems(QUERY)).toEqual([{ name: 'Austin', value: 120.5 }, { name: 'Paris, FR', value: 80 }]);
    expect(chartItems({ ...QUERY, chart: null })).toEqual([]);
  });
});

