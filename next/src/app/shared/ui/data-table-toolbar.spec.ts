import { describe, it, expect } from 'vitest';
import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableShell } from './data-table';

/**
 * Console review 2026-10-07 (M16): at 1187 px a table's toolbar wrapped Columns alone onto a second line and cut the
 * search's placeholder. The controls are one group: beside the heading while they fit on one line, below it (the
 * heading on a line of its own) once they would wrap.
 */
@Component({
  imports: [TableShell],
  template: `
    <app-table-shell heading="Tasks" [isEmpty]="false">
      <ng-container toolbar>
        <select class="input"><option>All kinds</option></select>
        <div class="search-field"><input class="input" placeholder="Search name, code, service or topic" /></div>
      </ng-container>
      <table class="table-modern"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
    </app-table-shell>`,
})
class Host {}

function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const shell = fixture.debugElement.children[0].componentInstance as TableShell;
  return { el, shell, toolbar: el.querySelector<HTMLElement>('.table-toolbar')! };
}

/** Lays the group's controls out at these tops (jsdom has no layout of its own). */
function at(toolbar: HTMLElement, tops: number[]): void {
  Array.from(toolbar.querySelector('.table-toolbar-controls')!.children).forEach((c, i) => {
    (c as HTMLElement).getBoundingClientRect = () => ({ top: tops[i] ?? tops[0], width: 100 } as DOMRect);
  });
}

describe('TableShell toolbar (review 2026-10-07, M16)', () => {
  it('holds every projected control in one group, before Columns', () => {
    const { toolbar } = render();
    const group = toolbar.querySelector('.table-toolbar-controls')!;
    expect(group.querySelector('select')).not.toBeNull();
    expect(group.querySelector('.search-field')).not.toBeNull();
    expect(toolbar.querySelector(':scope > h2')!.textContent).toContain('Tasks');
  });

  it('keeps the heading beside the controls while they fit on one line', () => {
    const { shell, toolbar } = render();
    at(toolbar, [12, 12]);
    shell.stackToolbar(toolbar);
    expect(toolbar.classList.contains('is-stacked')).toBe(false);
  });

  it('gives the heading its own line once the controls would wrap beside it', () => {
    const { shell, toolbar } = render();
    at(toolbar, [12, 52]);
    shell.stackToolbar(toolbar);
    expect(toolbar.classList.contains('is-stacked')).toBe(true);
    at(toolbar, [12, 12]);
    shell.stackToolbar(toolbar);
    expect(toolbar.classList.contains('is-stacked')).toBe(false);
  });
});
