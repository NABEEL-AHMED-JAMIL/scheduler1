import { describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ThemePicker } from './theme-picker';

/** Owner 10-12: a theme's note sits under its name, never in a column of its own that can run over the swatches. */
describe('ThemePicker', () => {
  it('puts each note under its theme name, apart from the swatches', () => {
    const fixture = TestBed.createComponent(ThemePicker);
    fixture.componentRef.setInput('inheritLabel', 'The board\'s theme');
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const rows = [...el.querySelectorAll<HTMLElement>('.theme-row')];
    expect(rows.length).toBeGreaterThan(2);
    for (const row of rows) {
      // Two children only: the text block (name, then its note) and the swatches.
      expect([...row.children].map(c => c.className)).toEqual(row.querySelector('.theme-swatches')
        ? ['theme-text', 'theme-swatches'] : ['theme-text']);
      const note = row.querySelector('.theme-note');
      if (note) expect(note.parentElement?.classList).toContain('theme-text');
    }
    expect(rows[0].querySelector('.theme-note')?.textContent?.trim()).toBe('No override');
  });
});
