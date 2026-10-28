import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, computed } from '@angular/core';
import { SortHeader } from './sort-header';
import { createTableSort } from './sort';

interface Row { id: number; name: string; size: number | null }

@Component({
  imports: [SortHeader],
  template: `
    <table>
      <thead><tr>
        <th appSort="name" [sortBy]="sort">Name</th>
        <th appSort="size" [sortBy]="sort">Size</th>
        <th>Actions</th>
      </tr></thead>
      <tbody>@for (r of shown(); track r.id) { <tr><td>{{ r.name }}</td><td>{{ r.size }}</td><td></td></tr> }</tbody>
    </table>`,
})
class Host {
  readonly rows: Row[] = [{ id: 1, name: 'b', size: 5 }, { id: 2, name: 'a', size: null }, { id: 3, name: 'c', size: 9 }];
  readonly sort = createTableSort<Row>({
    id: 'header-spec', note: 'Sorts the newest 3 shown',
    columns: { name: r => r.name, size: { value: r => r.size, kind: 'number' } },
  });
  readonly shown = computed(() => this.sort.apply(this.rows));
}

function mount() {
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  const th = (i: number) => el.querySelectorAll('th')[i] as HTMLElement;
  const names = () => Array.from(el.querySelectorAll('tbody tr td:first-child')).map(td => td.textContent?.trim());
  return { fixture, el, th, names };
}

describe('SortHeader', () => {
  beforeEach(() => { try { localStorage.clear(); } catch { /* none */ } TestBed.resetTestingModule(); });

  it('puts the heading in a real button and marks only the sorted column with aria-sort', () => {
    const { th, fixture } = mount();
    const button = th(0).querySelector('button')!;
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent?.trim()).toBe('Name');
    expect(th(0).hasAttribute('aria-sort')).toBe(false);
    button.click();
    fixture.detectChanges();
    expect(th(0).getAttribute('aria-sort')).toBe('ascending');
    expect(th(1).hasAttribute('aria-sort')).toBe(false);
    expect(th(2).querySelector('button')).toBeNull();
  });

  it('reorders the rows when a heading is clicked, and flips on the second click', () => {
    const { th, fixture, names } = mount();
    expect(names()).toEqual(['b', 'a', 'c']);
    th(0).querySelector('button')!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['a', 'b', 'c']);
    th(0).querySelector('button')!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['c', 'b', 'a']);
    expect(th(0).getAttribute('aria-sort')).toBe('descending');
  });

  it('keeps an empty size last whichever way the size column sorts', () => {
    const { th, fixture, names } = mount();
    th(1).querySelector('button')!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['c', 'b', 'a']);
    th(1).querySelector('button')!.click();
    fixture.detectChanges();
    expect(names()).toEqual(['b', 'c', 'a']);
  });

  it('shows the console sort glyph, and the arrow of the sorted column', () => {
    const { th, fixture } = mount();
    expect(th(0).querySelector('app-icon')).not.toBeNull();
    th(0).querySelector('button')!.click();
    fixture.detectChanges();
    expect(th(0).querySelector('.th-sort-active')).not.toBeNull();
  });

  it('carries the table\'s note as the tooltip, for a sort over a fixed window', () => {
    const { th } = mount();
    expect(th(0).querySelector('button')!.getAttribute('title')).toBe('Sorts the newest 3 shown');
  });
});
