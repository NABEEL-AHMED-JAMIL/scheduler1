import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { TableShell } from './data-table';

@Component({
  imports: [TableShell],
  template: `
    <app-table-shell heading="Rows" [loading]="loading()" [isEmpty]="isEmpty()">
      <table><tbody><tr><td>row one</td></tr></tbody></table>
    </app-table-shell>`,
})
class Host {
  readonly loading = signal(false);
  readonly isEmpty = signal(false);
}

/** Renders the shell, then lets `wait` ms pass: the indicators wait 150 ms before they draw anything. */
function render(loading: boolean, isEmpty: boolean, wait = 200) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.loading.set(loading);
  fixture.componentInstance.isEmpty.set(isEmpty);
  fixture.detectChanges();
  vi.advanceTimersByTime(wait);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return {
    el,
    rows: !!el.querySelector('td'),
    veil: el.querySelector('.blur-loader-veil')?.textContent?.trim() ?? null,
    blurred: !!el.querySelector('.blur-loader.is-loading'),
    busy: !!el.querySelector('[aria-busy="true"]'),
    skeleton: !!el.querySelector('app-loading .ld-rows'),
    status: el.querySelector('app-loading [role="status"]')?.textContent?.trim() ?? null,
  };
}

describe('TableShell loading states', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows skeleton rows, named for the list, only while there is nothing to keep on screen', () => {
    const first = render(true, true);
    expect(first.skeleton).toBe(true);
    expect(first.status).toBe('Loading rows…');
    expect(first.rows).toBe(false);
  });

  it('draws nothing for a load that answers within 150 ms, but is busy from the start', () => {
    const quick = render(true, true, 50);
    expect(quick.skeleton).toBe(false);
    expect(quick.busy).toBe(true);
  });

  it('says "Still loading…" once a first load passes 10 seconds', () => {
    const slow = render(true, true, 10_500);
    expect(slow.status).toBe('Still loading…');
    expect(slow.el.textContent).toContain('Still loading…');
  });

  it('keeps the rows under a blur while a refresh is in flight', () => {
    const refresh = render(true, false);
    expect(refresh.rows).toBe(true);
    expect(refresh.blurred).toBe(true);
    expect(refresh.veil).toBe('Refreshing…');
  });

  it('does not flash the veil for a refresh that answers within 150 ms', () => {
    const quick = render(true, false, 50);
    expect(quick.rows).toBe(true);
    expect(quick.veil).toBeNull();
    expect(quick.blurred).toBe(true);
  });

  it('lifts the veil once the answer lands', () => {
    const done = render(false, false);
    expect(done.rows).toBe(true);
    expect(done.blurred).toBe(false);
    expect(done.veil).toBeNull();
  });
});
