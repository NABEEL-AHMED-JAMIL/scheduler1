import { describe, it, expect } from 'vitest';
import { contrastRatio, emptyDefinition, stateTone, stateWord, typeOf } from './assets.model';
import { PRINTED_LOOK } from './assets/printed-look';

describe('Report Studio assets (MIG-406)', () => {
  it('measures contrast as WCAG does: black on white is 21:1, a colour on itself 1:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#244A73', '#244A73')).toBeCloseTo(1, 5);
  });

  it('the printed platform look passes AA: text 4.5:1 and the main colour 3:1 on its background', () => {
    expect(contrastRatio(PRINTED_LOOK.text, PRINTED_LOOK.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(PRINTED_LOOK.primary, PRINTED_LOOK.background)).toBeGreaterThanOrEqual(3);
  });

  it('a pale text colour on white fails the check the editor shows before publishing', () => {
    expect(contrastRatio('#C0C8D0', '#FFFFFF')).toBeLessThan(4.5);
  });

  it('a value that is not a six-digit colour is not judged (the server checks it on save)', () => {
    expect(contrastRatio('teal', '#FFFFFF')).toBe(21);
  });

  it('names a version state and its tone as the cards print them', () => {
    expect([stateWord('APPROVED'), stateWord('IN_REVIEW'), stateWord('RETIRED'), stateWord(null)]).toEqual(['Approved', 'In review', 'Retired', '—']);
    expect([stateTone('APPROVED'), stateTone('IN_REVIEW'), stateTone('REJECTED'), stateTone('RETIRED')]).toEqual(['pill-ok', 'pill-warn', 'pill-crit', 'pill-neutral']);
  });

  it('names the type the person uploaded: an SVG stays SVG though a PNG is kept', () => {
    expect(typeOf({ originalType: 'svg', contentType: 'image/png' })).toBe('SVG');
    expect(typeOf({ originalType: 'jpeg' })).toBe('JPG');
    expect(typeOf({ contentType: 'image/png' })).toBe('PNG');
  });

  it('a new brand profile lets reports change the look, templates the fonts, and nobody the confidentiality line', () => {
    expect(emptyDefinition().locks).toEqual({ look: 'REPORT', fontsContact: 'TEMPLATE', confidentiality: 'LOCKED' });
    expect(emptyDefinition().signOnApproval).toBe(true);
  });
});
