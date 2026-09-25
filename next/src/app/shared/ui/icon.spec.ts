import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Icon } from './icon';

/**
 * What a control shows while its own work is running.
 *
 * styles.css already records the rule: "a rotating arrow reads as an action rather than a wait".
 * Twenty-two controls broke it by putting [class.spin] on whatever glyph they already had, so a
 * Pull button span a download arrow, a delete button span a trash can, and Ask span a paper
 * plane -- each reading as the operation happening over and over rather than as waiting.
 */
describe('an icon on a control that is busy', () => {
  function render(busy: boolean, name = 'download') {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [Icon] }).createComponent(Icon);
    fixture.componentRef.setInput('name', name);
    fixture.componentRef.setInput('busy', busy);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('draws a ring instead of the glyph it would otherwise show', () => {
    const el = render(true);
    expect(el.querySelector('circle')).not.toBeNull();
    // The download arrow's own path must be gone, not merely spinning.
    expect(el.innerHTML).not.toContain('M21 15v4a2 2 0 0 1-2 2H5');
  });

  it('draws the named glyph and no ring when it is not busy', () => {
    const el = render(false);
    expect(el.querySelector('circle')).toBeNull();
    expect(el.innerHTML).toContain('M21 15v4a2 2 0 0 1-2 2H5');
  });

  it('keeps the element in place, so the button does not resize as it starts', () => {
    // The name is still required while busy: swapping the element out entirely would lose the
    // button's size and alignment and make the control jump.
    expect(render(true).querySelector('svg')).not.toBeNull();
    expect(render(false).querySelector('svg')).not.toBeNull();
  });
});

/** "Not connected" beside the zap used for a live connection: the zap with a slash through it. */
describe('the zapOff glyph', () => {
  it('draws something', () => {
    TestBed.resetTestingModule();
    const fixture = TestBed.configureTestingModule({ imports: [Icon] }).createComponent(Icon);
    fixture.componentRef.setInput('name', 'zapOff');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('path').length).toBeGreaterThan(0);
  });
});
