import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { API_BASE } from '../../../core/api/api.config';
import { SourcesApi } from './sources.service';
import { PipelineRead, PipelineReads, READERS_SHOWN, readKindIcon, readKindLabel, readKindPill, readingPipelines, readsSentence } from './pipeline-reads';

/** UX review 2026-10-13 (I1): the words and counts of what the pipelines read. */
const read = (kind: string, ids: number[]): PipelineRead => ({
  kind, task: 't', taskName: 'T', label: kind, target: {},
  pipelines: ids.map(id => ({ taskDetailId: id, taskName: 'P' + id, pipelineKey: id * 10, steps: ['s'] })),
});

describe('pipeline reads', () => {
  it('names each kind of place, with a fallback for one the console does not know yet', () => {
    expect(['storage', 'api', 'database', 'documents', 'other'].map(readKindLabel)).toEqual(['Storage', 'API', 'Database', 'Documents', 'In the step']);
    expect(readKindLabel('queue')).toBe('queue');
    expect(readKindLabel(null)).toBe('—');
    expect(readKindIcon('api')).toBe('code');
    expect(readKindIcon('queue')).toBe('database');
    expect(readKindPill('storage')).toBe('pill-info');
    expect(readKindPill('queue')).toBe('pill-neutral');
  });

  it('counts each pipeline once however many places it reads', () => {
    expect(readingPipelines([read('storage', [1, 2]), read('api', [2, 3])])).toBe(3);
    expect(readingPipelines([])).toBe(0);
  });

  it('says how many pipelines read how many places, in singular or plural', () => {
    expect(readsSentence([read('storage', [1])])).toBe('Your 1 pipeline read 1 place directly, listed above. Add a source here to test and preview one.');
    expect(readsSentence([read('storage', [1, 2]), read('api', [2])])).toBe(
      'Your 2 pipelines read 2 places directly, listed above. Add a source here to test and preview one.');
    expect(READERS_SHOWN).toBe(3);
  });
});

describe('SourcesApi.pipelineReads', () => {
  it('reads Core\'s GET pipeline.json/steps/reads, the Sources page\'s gate', () => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
    const api = TestBed.inject(SourcesApi);
    const http = TestBed.inject(HttpTestingController);
    let answered: PipelineRead[] | undefined;
    api.pipelineReads().subscribe(r => answered = r.data);
    const call = http.expectOne(`${API_BASE}/pipeline.json/steps/reads`);
    expect(call.request.method).toBe('GET');
    call.flush({ status: 'SUCCESS', message: '1 of 1 pipeline(s) read 1 place(s).', data: [read('api', [1932])] });
    expect(answered?.[0].pipelines[0].taskDetailId).toBe(1932);
    http.verify();
  });
});

describe('PipelineReads -- sorting (owner 2026-10-27)', () => {
  function table(reads: PipelineRead[]) {
    try { localStorage.clear(); } catch { /* none */ }
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    const fixture = TestBed.createComponent(PipelineReads);
    fixture.componentRef.setInput('reads', reads);
    return fixture.componentInstance;
  }

  it('keeps Core\'s order, then sorts by how many pipelines read a place, both ways', () => {
    const t = table([read('storage', [1]), read('api', [1, 2, 3, 4, 5])]);
    expect(t.sorted().map(r => r.kind)).toEqual(['storage', 'api']);
    t.sort.toggle('readBy');
    expect(t.sorted().map(r => r.kind)).toEqual(['api', 'storage']);
    t.sort.toggle('readBy');
    expect(t.sorted().map(r => r.kind)).toEqual(['storage', 'api']);
  });

  it('keeps "+N more" open on the place it was opened for when the rows move', () => {
    const t = table([read('storage', [1]), read('api', [1, 2, 3, 4, 5])]);
    const api = t.sorted()[1];
    t.expand(api);
    t.sort.toggle('readBy');
    expect(t.sorted()[0].kind).toBe('api');
    expect(t.shownReaders(t.sorted()[0]).length).toBe(5);
    expect(t.hiddenReaders(t.sorted()[1])).toBe(0);
  });
});
