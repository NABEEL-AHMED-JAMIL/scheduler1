import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableShell } from './data-table';

/**
 * Owner, 2026-09-24: "add a column filter so user can select which column he want to view or hide". Every list
 * screen's table sits in app-table-shell, so the shell offers it: a Columns menu listing the table's headed
 * columns, hiding the unticked ones, remembered per table.
 */
@Component({
  imports: [TableShell],
  template: `
    <app-table-shell heading="People" [isEmpty]="false">
      <table class="table-modern">
        <thead><tr><th></th><th>Name</th><th>Email</th><th>Role</th><th>Workspace</th><th>Added</th><th>Actions</th></tr></thead>
        <tbody><tr><td>x</td><td>Ada</td><td>ada@x</td><td>Admin</td><td>One</td><td>today</td><td>…</td></tr></tbody>
      </table>
    </app-table-shell>`,
})
class Host {}

@Component({
  imports: [TableShell],
  template: `
    <app-table-shell heading="Small" [isEmpty]="false">
      <table class="table-modern"><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>
    </app-table-shell>`,
})
class SmallHost {}

async function render<T>(type: new () => T) {
  const fixture = TestBed.createComponent(type);
  fixture.detectChanges();
  await new Promise(r => setTimeout(r, 0));
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const button = () => Array.from(el.querySelectorAll('button')).find(b => (b.textContent ?? '').includes('Columns'));
  const cell = (row: 'th' | 'td', col: number) => el.querySelector<HTMLElement>(`${row === 'th' ? 'thead' : 'tbody'} tr > :nth-child(${col})`)!;
  const visible = (node: HTMLElement) => getComputedStyle(node).display !== 'none';
  return { fixture, el, button, cell, visible };
}

describe('table shell column picker', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)); },
      removeItem: (k: string) => { store.delete(k); },
    });
    TestBed.resetTestingModule();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers the headed columns, not the blank or Actions ones', async () => {
    const { fixture, el, button } = await render(Host);
    button()!.click();
    fixture.detectChanges();
    const labels = Array.from(el.querySelectorAll('[aria-label="Columns to show"] label')).map(l => (l.textContent ?? '').trim());
    expect(labels).toEqual(['Name', 'Email', 'Role', 'Workspace', 'Added']);
  });

  it('hides an unticked column in the header and the rows, and shows it again', async () => {
    const { fixture, el, button, cell, visible } = await render(Host);
    button()!.click();
    fixture.detectChanges();
    const email = Array.from(el.querySelectorAll<HTMLInputElement>('[aria-label="Columns to show"] input'))[1];
    email.click();
    fixture.detectChanges();
    expect(visible(cell('th', 3))).toBe(false);
    expect(visible(cell('td', 3))).toBe(false);
    expect(visible(cell('td', 2))).toBe(true);
    expect(button()!.textContent).toContain('1 hidden');
    email.click();
    fixture.detectChanges();
    expect(visible(cell('td', 3))).toBe(true);
  });

  it('remembers the choice for the same table', async () => {
    const first = await render(Host);
    first.button()!.click();
    first.fixture.detectChanges();
    Array.from(first.el.querySelectorAll<HTMLInputElement>('[aria-label="Columns to show"] input'))[2].click();
    first.fixture.detectChanges();
    first.fixture.destroy();

    const again = await render(Host);
    expect(again.visible(again.cell('td', 4))).toBe(false);
  });

  it('stays out of the way on a small table', async () => {
    const { button } = await render(SmallHost);
    expect(button()).toBeUndefined();
  });
});
