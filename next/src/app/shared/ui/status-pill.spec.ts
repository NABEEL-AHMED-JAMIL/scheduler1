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
    // Must span the whole modifier: /pill-\w+/ stops at the hyphen and reads
    // "pill-solid" out of "pill-solid-crit", which hid a real difference.
    toneClass: (el.querySelector('.pill')?.className.match(/pill-(?:solid-)?\w+/) ?? [''])[0],
    // The icon's name is an Angular input, not a DOM attribute, so the drawn paths are what
    // is actually comparable -- and they are what a reader sees.
    glyph: el.querySelector('app-icon svg')?.innerHTML ?? '',
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
                                   ['Delete', 'pill-crit'], ['Failed', 'pill-solid-crit']]) {
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

describe('run states are told apart', () => {
  const RUN_STATES = ['Queue', 'Start', 'Running', 'Completed',
                      'Failed', 'Interrupt', 'Skip', 'Missed'];

  it('gives each of the eight its own appearance', () => {
    // They used to share four colours between eight states, so a queued run and a working
    // one were the same chip. Appearance here is the pair a reader actually sees.
    const seen = new Map<string, string>();
    for (const label of RUN_STATES) {
      const { toneClass, glyph } = render(label);
      const key = `${toneClass}|${glyph}`;
      expect(seen.has(key), `${label} looks identical to ${seen.get(key)}`).toBe(false);
      seen.set(key, label);
    }
    expect(seen.size).toBe(RUN_STATES.length);
  });

  it('keeps the family colour, so red still means bad', () => {
    for (const label of ['Failed', 'Interrupt']) {
      expect(render(label).toneClass).toContain('crit');
    }
    for (const label of ['Skip', 'Missed']) {
      expect(render(label).toneClass).toContain('warn');
    }
    for (const label of ['Start', 'Running']) {
      expect(render(label).toneClass).toContain('brand');
    }
    expect(render('Completed').toneClass).toContain('ok');
  });

  it('separates the pair inside a family by weight', () => {
    // One filled, one soft -- which is what makes them distinguishable at a glance.
    for (const [soft, solid] of [['Interrupt', 'Failed'], ['Skip', 'Missed'], ['Start', 'Running']]) {
      expect(render(soft).toneClass).not.toContain('solid');
      expect(render(solid).toneClass).toContain('solid');
    }
  });

  it('carries the difference in shape as well as colour', () => {
    // Anyone who cannot separate the hues still gets a distinct glyph per state.
    const glyphs = RUN_STATES.map(label => render(label).glyph);
    expect(new Set(glyphs).size).toBe(RUN_STATES.length);
    expect(glyphs.every(Boolean)).toBe(true);
  });

  it('never quiets a run state, however ordinary it looks', () => {
    // Completed is the norm, but a run column exists to report exactly this.
    for (const label of RUN_STATES) {
      expect(render(label, true).isChip, `${label} should stay a chip`).toBe(true);
    }
  });
});
