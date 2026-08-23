import { describe, it, expect, beforeEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Component, signal } from '@angular/core';
import { StatusPill } from './status-pill';

@Component({
  imports: [StatusPill],
  template: `<app-status [label]="label()" [quiet]="quiet()" />`,
})
class Host {
  readonly label = signal('');
  readonly quiet = signal(false);
}

// Each render needs its own module; TestBed refuses to be configured twice once instantiated.
function render(label: string, quiet = false) {
  TestBed.resetTestingModule();
  const fixture = TestBed.configureTestingModule({ imports: [Host] }).createComponent(Host);
  fixture.componentInstance.label.set(label);
  fixture.componentInstance.quiet.set(quiet);
  fixture.detectChanges();
  const el: HTMLElement = fixture.nativeElement;
  return {
    isQuiet: !!el.querySelector('.status-quiet'),
    isChip: !!el.querySelector('.pill'),
    toneClass: (el.querySelector('.pill')?.className.match(/pill-\w+/) ?? [''])[0],
    dotClass: (el.querySelector('.status-dot')?.className.match(/dot-\w+/) ?? [''])[0],
  };
}

describe('StatusPill', () => {
  it('chips every status by default', () => {
    for (const label of ['Active', 'Failed', 'Suspended', 'Running']) {
      expect(render(label).isChip).toBe(true);
    }
  });

  describe('quiet columns', () => {
    // 41 of 41 jobs were Active, so a filled green chip on every row said nothing and
    // drowned out the three rows that had actually failed.
    it('marks the unremarkable states down to a dot', () => {
      const result = render('Active', true);
      expect(result.isQuiet).toBe(true);
      expect(result.isChip).toBe(false);
      expect(result.dotClass).toBe('dot-ok');
    });

    it('still chips a state that is an exception', () => {
      // The point of quieting the norm is that the exceptions become visible.
      for (const [label, tone] of [['Suspended', 'pill-warn'], ['Inactive', 'pill-warn'],
                                   ['Delete', 'pill-crit'], ['Failed', 'pill-crit']]) {
        const result = render(label, true);
        expect(result.isQuiet, `${label} should stay a chip`).toBe(false);
        expect(result.toneClass).toBe(tone);
      }
    });

    it('keeps an in-flight state visible', () => {
      // Running is not the norm and not a problem, but it is worth seeing.
      expect(render('Running', true).isChip).toBe(true);
    });

    it('quiets an unknown status rather than inventing a tone for it', () => {
      expect(render('Stored', true).isQuiet).toBe(true);
      expect(render('Stored', true).dotClass).toBe('dot-neutral');
    });
  });
});
