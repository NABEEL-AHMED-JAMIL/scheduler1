import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { ViewToggle, ListView } from './view-toggle';

@Component({
  imports: [ViewToggle],
  template: `<app-view-toggle [(value)]="view" [key]="key()" />`,
})
class Host {
  readonly view = signal<ListView>('table');
  readonly key = signal('');
}

function render(key = '') {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.key.set(key);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return {
    fixture,
    host: fixture.componentInstance,
    buttons: () => [...el.querySelectorAll<HTMLButtonElement>('.seg-btn')],
    on: () => el.querySelector('.seg-on')?.textContent?.trim() ?? '',
    click: (label: string) => {
      const button = [...el.querySelectorAll<HTMLButtonElement>('.seg-btn')]
        .find(b => b.textContent?.trim() === label);
      button!.click();
      fixture.detectChanges();
    },
  };
}

/**
 * The test environment ships a partial localStorage (no clear()), so the component's real
 * storage path is exercised against a complete in-memory one instead of being stubbed out.
 */
let store: Record<string, string> = {};
const memoryStorage: Storage = {
  get length() { return Object.keys(store).length; },
  clear: () => { store = {}; },
  getItem: (key: string) => (key in store ? store[key] : null),
  key: (index: number) => Object.keys(store)[index] ?? null,
  removeItem: (key: string) => { delete store[key]; },
  setItem: (key: string, value: string) => { store[key] = String(value); },
};

beforeEach(() => {
  store = {};
  vi.stubGlobal('localStorage', memoryStorage);
});

describe('ViewToggle', () => {
  it('offers exactly the two layouts', () => {
    const view = render();
    expect(view.buttons().map(b => b.textContent?.trim())).toEqual(['Table', 'Cards']);
  });

  it('starts on the value it was given', () => {
    expect(render().on()).toBe('Table');
  });

  it('reports a choice back to the screen that owns the signal', () => {
    const view = render();
    view.click('Cards');
    expect(view.host.view()).toBe('cards');
    expect(view.on()).toBe('Cards');
  });

  it('marks the active layout for a screen reader, not only by colour', () => {
    const view = render();
    const pressed = view.buttons().map(b => b.getAttribute('aria-pressed'));
    expect(pressed).toEqual(['true', 'false']);
  });

  describe('remembering', () => {
    it('persists a choice under its key', () => {
      const view = render('jobs');
      view.click('Cards');
      expect(localStorage.getItem('etl.view.jobs')).toBe('cards');
    });

    it('restores what was stored for that key', () => {
      localStorage.setItem('etl.view.tenants', 'cards');
      const view = render('tenants');
      expect(view.host.view()).toBe('cards');
    });

    it('keeps screens independent, so cards here is not cards everywhere', () => {
      localStorage.setItem('etl.view.jobs', 'cards');
      expect(render('jobs').host.view()).toBe('cards');
      expect(render('tasks').host.view()).toBe('table');
    });

    it('goes on persisting after it has restored once', () => {
      // The bug this guards: reading the value only on the persist path meant the effect
      // stopped depending on it, so the very first restore froze the stored preference.
      localStorage.setItem('etl.view.queue', 'cards');
      const view = render('queue');
      expect(view.host.view()).toBe('cards');
      view.click('Table');
      expect(localStorage.getItem('etl.view.queue')).toBe('table');
    });

    it('ignores a stored value that is not a layout', () => {
      localStorage.setItem('etl.view.agents', 'garbage');
      expect(render('agents').host.view()).toBe('table');
    });

    it('remembers nothing without a key', () => {
      const view = render();
      view.click('Cards');
      expect(Object.keys(store)).toHaveLength(0);
    });

    it('still works when storage throws, as in private browsing', () => {
      vi.stubGlobal('localStorage', {
        ...memoryStorage,
        getItem: () => { throw new Error('denied'); },
        setItem: () => { throw new Error('quota'); },
      });
      const view = render('objects');
      expect(() => view.click('Cards')).not.toThrow();
      // The layout still changes; only the remembering is lost.
      expect(view.host.view()).toBe('cards');
    });
  });
});
