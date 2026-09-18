import { describe, it, expect } from 'vitest';
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

function render(loading: boolean, isEmpty: boolean) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.loading.set(loading);
  fixture.componentInstance.isEmpty.set(isEmpty);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return {
    rows: !!el.querySelector('td'),
    veil: el.querySelector('.blur-loader-veil')?.textContent?.trim() ?? null,
    blurred: !!el.querySelector('.blur-loader.is-loading'),
    plainSpinner: /Loading…/.test(el.textContent ?? '') && !el.querySelector('.blur-loader-veil'),
  };
}

describe('TableShell loading states', () => {
  it('shows the plain spinner only while there is nothing to keep on screen', () => {
    const first = render(true, true);
    expect(first.plainSpinner).toBe(true);
    expect(first.rows).toBe(false);
  });

  it('keeps the rows under a blur while a refresh is in flight', () => {
    const refresh = render(true, false);
    expect(refresh.rows).toBe(true);
    expect(refresh.blurred).toBe(true);
    expect(refresh.veil).toBe('Refreshing…');
  });

  it('lifts the veil once the answer lands', () => {
    const done = render(false, false);
    expect(done.rows).toBe(true);
    expect(done.blurred).toBe(false);
    expect(done.veil).toBeNull();
  });
});
