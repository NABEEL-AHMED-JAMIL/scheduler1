import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { AppLoading, InlineStatus, LoadingShape, createLoadState, loadErrorText } from './loading';
import { StatStrip } from './stat-strip';
import { StatTile } from './stat-tile';

@Component({
  imports: [AppLoading],
  template: `<app-loading [shape]="shape()" label="Loading runs…" />`,
})
class LoadingHost { readonly shape = signal<LoadingShape>('rows'); }

function mountLoading(shape: LoadingShape, wait: number) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [LoadingHost] }).createComponent(LoadingHost);
  fixture.componentInstance.shape.set(shape);
  fixture.detectChanges();
  vi.advanceTimersByTime(wait);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('AppLoading', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('is busy at once but draws nothing for the first 150 ms', () => {
    const el = mountLoading('rows', 100);
    expect(el.querySelector('app-loading')!.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('.ld-rows')).toBeNull();
    expect(el.querySelector('[role="status"]')).toBeNull();
  });

  it('then draws a skeleton in the shape asked for, with a status line naming what loads', () => {
    for (const [shape, cls] of [['rows', '.ld-rows'], ['cards', '.ld-cards'], ['tiles', '.ld-tiles'], ['list', '.ld-list'],
                                ['panel', '.ld-panel'], ['spinner', '.spinner'], ['inline', '.spinner']] as const) {
      const el = mountLoading(shape, 200);
      expect(el.querySelector(cls)).not.toBeNull();
      expect(el.querySelector('[role="status"]')!.textContent!.trim()).toBe('Loading runs…');
    }
  });

  it('says "Still loading…" after 10 seconds', () => {
    const el = mountLoading('cards', 10_100);
    expect(el.querySelector('[role="status"]')!.textContent!.trim()).toBe('Still loading…');
    expect(el.textContent).toContain('Still loading…');
  });
});

describe('createLoadState', () => {
  it('is pending (loading, not empty) until the first answer, and keeps loaded through a reload', () => {
    const s = createLoadState();
    expect(s.loading()).toBe(true);
    expect(s.pending()).toBe(true);
    s.done();
    expect(s.pending()).toBe(false);
    expect(s.loaded()).toBe(true);
    s.start();
    expect(s.loading()).toBe(true);
    expect(s.pending()).toBe(false);
  });

  it('clears loading on a failure and keeps plain words, so a spinner can never stick', () => {
    const s = createLoadState();
    s.fail(new HttpErrorResponse({ status: 500, error: { message: 'The runs could not be read.' } }), 'fallback');
    expect(s.loading()).toBe(false);
    expect(s.error()).toBe('The runs could not be read.');
    expect(s.pending()).toBe(false);
    s.start();
    expect(s.error()).toBe('');
  });
});

describe('loadErrorText', () => {
  it('never shows the raw HTTP message or a stack trace', () => {
    const raw = new HttpErrorResponse({ status: 502, url: '/x', error: 'Bad gateway' });
    expect(loadErrorText(raw, 'The runs could not be read.')).toBe('The runs could not be read.');
    expect(loadErrorText(new Error('Http failure response for /x: 500'), 'Fallback.')).toBe('Fallback.');
    expect(loadErrorText(new HttpErrorResponse({ status: 500, error: { message: 'java.lang.NullPointerException at x.y(Z.java:1)' } }), 'Fallback.')).toBe('Fallback.');
  });

  it('says when the service could not be reached, and when access is refused', () => {
    expect(loadErrorText(new HttpErrorResponse({ status: 0 }), 'F.')).toMatch(/could not be reached/);
    expect(loadErrorText(new HttpErrorResponse({ status: 403 }), 'F.')).toBe('You do not have access to this.');
  });

  it('uses an API answer\'s own message', () => {
    expect(loadErrorText({ status: 'ERROR', message: 'This workspace has no storage connection.' }, 'F.'))
      .toBe('This workspace has no storage connection.');
  });
});

@Component({
  imports: [InlineStatus],
  template: `<app-inline-status [loading]="loading()" [error]="error()" [empty]="empty()" label="Loading schedules…"
                                 emptyText="No schedule yet." (retry)="retried = retried + 1" />`,
})
class InlineHost {
  readonly loading = signal(false);
  readonly error = signal('');
  readonly empty = signal(false);
  retried = 0;
}

describe('InlineStatus', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('goes loading, then empty, then error with Try again', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [InlineHost] }).createComponent(InlineHost);
    const host = fixture.componentInstance;
    const el: HTMLElement = fixture.nativeElement;
    host.loading.set(true);
    fixture.detectChanges();
    vi.advanceTimersByTime(200);
    fixture.detectChanges();
    expect(el.textContent).toContain('Loading schedules…');
    host.loading.set(false);
    host.empty.set(true);
    fixture.detectChanges();
    expect(el.textContent).toContain('No schedule yet.');
    host.error.set('The schedules could not be read.');
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('The schedules could not be read.');
    (el.querySelector('button') as HTMLButtonElement).click();
    expect(host.retried).toBe(1);
  });
});

@Component({
  imports: [StatStrip, StatTile],
  template: `
    <app-stat-strip [items]="[{ label: 'Runs', value: 0 }]" [loading]="loading()" [failed]="failed()" />
    <div class="stat-strip stat-row"><app-stat-tile label="Cost" [value]="'$0.00'" [loading]="loading()" [failed]="failed()" /></div>`,
})
class TilesHost { readonly loading = signal(true); readonly failed = signal(false); }

describe('stat tiles while loading or failed (owner 2026-10-27: never a zero that looks real)', () => {
  it('shows a placeholder, not 0 or $0.00, while the figures load; a dash when the read failed', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [TilesHost] }).createComponent(TilesHost);
    const el: HTMLElement = fixture.nativeElement;
    fixture.detectChanges();
    expect(el.querySelectorAll('.stat-skel').length).toBe(2);
    expect(el.textContent).not.toContain('$0.00');
    expect(el.querySelector('.stat-strip-value')!.textContent).not.toContain('0');
    expect(el.querySelector('app-stat-strip')!.getAttribute('aria-busy')).toBe('true');
    fixture.componentInstance.loading.set(false);
    fixture.componentInstance.failed.set(true);
    fixture.detectChanges();
    expect(el.querySelectorAll('.stat-skel').length).toBe(0);
    expect(el.textContent).toContain('Not available right now');
    expect(el.textContent).not.toContain('$0.00');
    fixture.componentInstance.failed.set(false);
    fixture.detectChanges();
    expect(el.textContent).toContain('$0.00');
  });
});
