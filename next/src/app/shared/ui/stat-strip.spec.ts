import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StatStrip, StatStripItem } from './stat-strip';

describe('StatStrip', () => {
  function render(items: StatStripItem[], inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [StatStrip], providers: [provideRouter([])] })
      .createComponent(StatStrip);
    fixture.componentRef.setInput('items', items);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    return { fixture, host, cells: [...host.querySelectorAll<HTMLElement>('.stat-strip-cell')] };
  }

  describe('rendering', () => {
    it('draws one list item per tile with its label and value', () => {
      const { host, cells } = render([{ label: 'Runs', value: 12 }, { label: 'Average', value: '4m 2s' }]);
      expect(host.getAttribute('role')).toBe('list');
      expect(host.classList).toContain('stat-strip');
      expect(cells.length).toBe(2);
      expect(cells.every(c => c.getAttribute('role') === 'listitem')).toBe(true);
      expect(cells[0].querySelector('.stat-strip-value')!.textContent!.trim()).toBe('12');
      expect(cells[0].querySelector('.stat-strip-label')!.textContent!.trim()).toBe('Runs');
      expect(cells[1].querySelector('.stat-strip-value')!.textContent!.trim()).toBe('4m 2s');
    });

    it('puts the label before the value in the DOM, so it is read "Runs, 12"', () => {
      const { cells } = render([{ label: 'Runs', value: 12 }]);
      const text = cells[0].querySelector('.stat-strip-text')!;
      expect(text.firstElementChild!.classList).toContain('stat-strip-label');
    });

    it('shows a foot only when one is given, and a hint as the tooltip', () => {
      const { cells } = render([{ label: 'Failed', value: 3, foot: 'of 42', hint: 'Runs that errored' }, { label: 'Runs', value: 42 }]);
      expect(cells[0].querySelector('.stat-strip-foot')!.textContent!.trim()).toBe('of 42');
      expect(cells[0].querySelector('.stat-strip-item')!.getAttribute('title')).toBe('Runs that errored');
      expect(cells[1].querySelector('.stat-strip-foot')).toBeNull();
      expect(cells[1].querySelector('.stat-strip-item')!.hasAttribute('title')).toBe(false);
    });

    it('mutes a quiet value', () => {
      const { cells } = render([{ label: 'Skip', value: 0, quiet: true }, { label: 'Failed', value: 2 }]);
      expect(cells[0].querySelector('.stat-strip-value')!.classList).toContain('is-quiet');
      expect(cells[1].querySelector('.stat-strip-value')!.classList).not.toContain('is-quiet');
    });

    it('adds a full-width summary line when given one', () => {
      const { host } = render([{ label: 'Runs', value: 1 }], { summary: { label: 'Total', value: 9 } });
      const summary = host.querySelector('.stat-strip-summary')!;
      expect(summary.getAttribute('role')).toBe('listitem');
      expect(summary.textContent).toContain('9');
      expect(summary.textContent).toContain('Total');
    });

    it('draws a live dot with its wording for a screen reader', () => {
      const { cells } = render([{ label: 'Running', value: 2, live: 'Updating as runs report in' }, { label: 'Queued', value: 0 }]);
      expect(cells[0].querySelector('.live-dot')!.getAttribute('title')).toBe('Updating as runs report in');
      expect(cells[0].querySelector('.sr-only')!.textContent).toBe('Updating as runs report in');
      expect(cells[1].querySelector('.live-dot')).toBeNull();
    });

    it('names the list when given a label', () => {
      const { host } = render([{ label: 'Runs', value: 1 }], { label: 'Run outcomes' });
      expect(host.getAttribute('aria-label')).toBe('Run outcomes');
    });

    it('applies the start alignment and the larger size as classes', () => {
      const { host } = render([{ label: 'Runs', value: 1 }], { align: 'start', size: 'md' });
      expect(host.classList).toContain('is-start');
      expect(host.classList).toContain('is-md');
    });
  });

  describe('tone', () => {
    it('tints the icon, never the number', () => {
      const { cells } = render([{ label: 'Failed', value: 3, icon: 'xCircle', tone: 'crit' }]);
      expect(cells[0].querySelector('.stat-strip-glyph')!.classList).toContain('icon-crit');
      expect(cells[0].querySelector('.stat-strip-value')!.className).not.toMatch(/icon-/);
    });

    it('gives an icon without a tone the muted tint', () => {
      const { cells } = render([{ label: 'Never run', value: 1, icon: 'minus' }]);
      expect(cells[0].querySelector('.stat-strip-glyph')!.classList).toContain('icon-muted');
    });

    it('draws a small dot in the tone when there is no icon', () => {
      const { cells } = render([{ label: 'Completed', value: 5, tone: 'ok' }]);
      const dot = cells[0].querySelector('.stat-strip-dot')!;
      expect(dot.classList).toContain('icon-ok');
      expect(dot.getAttribute('aria-hidden')).toBe('true');
    });

    it('draws neither a dot nor a glyph for a plain count', () => {
      const { cells } = render([{ label: 'Runs', value: 5 }]);
      expect(cells[0].querySelector('.stat-strip-dot, .stat-strip-glyph')).toBeNull();
    });
  });

  describe('link and click tiles', () => {
    it('makes a tile with a link an anchor with its full name', () => {
      const { cells } = render([{ label: 'Failed', value: 3, foot: 'today', link: ['/jobs', 'history'], queryParams: { status: 'Failed' } }]);
      const anchor = cells[0].querySelector('a.stat-strip-item')!;
      expect(anchor.getAttribute('href')).toBe('/jobs/history?status=Failed');
      expect(anchor.getAttribute('aria-label')).toBe('Failed: 3, today');
      expect(cells[0].querySelector('button')).toBeNull();
    });

    it('makes a clickable tile a button that emits the item, and keeps it focusable', () => {
      const item: StatStripItem = { label: 'Failed', value: 3, clickable: true, pressed: false, hint: 'Show only failed runs' };
      const { fixture, cells } = render([item]);
      const emitted: StatStripItem[] = [];
      fixture.componentInstance.itemClick.subscribe(i => emitted.push(i));
      const button = cells[0].querySelector('button.stat-strip-item') as HTMLButtonElement;
      expect(button.type).toBe('button');
      expect(button.tabIndex).toBe(0);
      expect(button.getAttribute('aria-label')).toBe('Failed: 3, Show only failed runs');
      expect(button.getAttribute('aria-pressed')).toBe('false');
      button.click();
      expect(emitted).toEqual([item]);
    });

    it('leaves aria-pressed off a clickable tile that is not a toggle', () => {
      const { cells } = render([{ label: 'Failed', value: 3, clickable: true }]);
      expect(cells[0].querySelector('button')!.hasAttribute('aria-pressed')).toBe(false);
    });

    it('prefers the link when a tile has both', () => {
      const { cells } = render([{ label: 'Failed', value: 3, clickable: true, link: '/jobs' }]);
      expect(cells[0].querySelector('a')).not.toBeNull();
      expect(cells[0].querySelector('button')).toBeNull();
    });

    it('draws a plain tile as neither link nor button', () => {
      const { cells } = render([{ label: 'Runs', value: 3 }]);
      expect(cells[0].querySelector('a, button')).toBeNull();
      expect(cells[0].querySelector('.stat-strip-item')!.getAttribute('aria-label')).toBeNull();
    });
  });

  describe('wrapping', () => {
    const five = ['Running', 'Queued', 'Completed', 'Failed', 'Never run'].map(label => ({ label, value: 1 }));

    it('defaults to two columns on a phone', () => {
      const { host } = render(five.slice(0, 4));
      expect(host.classList).toContain('grid-cols-2');
      expect(host.className).not.toMatch(/sm:grid-cols|lg:grid-cols/);
    });

    it('takes three phone columns and wider counts from sm and lg', () => {
      const { host } = render(five, { cols: 3, smCols: 4, lgCols: 5 });
      expect(host.classList).toContain('grid-cols-3');
      expect(host.classList).toContain('sm:grid-cols-4');
      expect(host.classList).toContain('lg:grid-cols-5');
      // The static class survives the bound one.
      expect(host.classList).toContain('stat-strip');
    });

    it('stretches the last tile across a part-filled last row', () => {
      // 5 tiles: phone 2 cols -> last row has 1, spans 2; sm 3 -> last row has 2, last spans 2; lg 5 -> full.
      const { cells } = render(five, { cols: 2, smCols: 3, lgCols: 5 });
      const last = cells[4];
      expect(last.classList).toContain('col-span-2');
      expect(last.classList).toContain('sm:col-span-2');
      expect(last.classList).toContain('lg:col-span-1');
      expect(cells[3].className).not.toMatch(/col-span/);
    });

    it('carries the phone count up when sm and lg are not given', () => {
      const { cells } = render(five.slice(0, 3), { cols: 2 });
      expect(cells[2].classList).toContain('col-span-2');
      expect(cells[2].classList).toContain('sm:col-span-2');
      expect(cells[2].classList).toContain('lg:col-span-2');
    });

    it('does not stretch anything when the rows are full', () => {
      const { cells } = render(five.slice(0, 4), { cols: 2, smCols: 4 });
      expect(cells[3].classList).toContain('col-span-1');
      expect(cells[3].classList).toContain('sm:col-span-1');
    });

    it('keeps a long value and label inside their tile by wrapping, not widening', () => {
      const { cells } = render([{ label: 'A label far longer than any tile is wide', value: '103,909,527,000,000.58' }]);
      // The overflow rules live in styles.css (min-width 0, overflow-wrap anywhere); the tile
      // must carry the classes they hang on, all the way down.
      for (const selector of ['.stat-strip-item', '.stat-strip-text', '.stat-strip-value', '.stat-strip-label']) {
        expect(cells[0].querySelector(selector)).not.toBeNull();
      }
    });
  });
});
