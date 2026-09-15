import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReadAlongText } from './read-along-text';

@Component({
  imports: [ReadAlongText],
  template: `<app-read-along-text [text]="text" [at]="at" />`,
})
class Host {
  text = 'the quick brown fox';
  at: { charIndex: number; charLength: number } | null = null;
}

/**
 * The split is the whole component, and getting it wrong is visible rather than silent: the
 * marked word drifts off the word being spoken, which is worse than no highlight at all
 * because it actively misleads whoever is following along.
 */
describe('ReadAlongText', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
  });

  const render = () => { fixture.detectChanges(); return fixture.nativeElement as HTMLElement; };
  const mark = () => render().querySelector('mark');

  it('marks the word at the offset it was given', () => {
    host.at = { charIndex: 4, charLength: 5 };

    expect(mark()?.textContent).toBe('quick');
  });

  it('marks the occurrence at the offset, not the first one that matches', () => {
    // Why the input is an offset and not the word itself: a word usually appears several times
    // in a passage, and matching by content marks the wrong one.
    host.text = 'fox fox fox';
    host.at = { charIndex: 8, charLength: 3 };

    const text = render().textContent ?? '';
    expect(text).toBe('fox fox fox');
    // Marked at the end, so what precedes the mark is both earlier copies.
    expect(render().querySelector('mark')?.previousElementSibling?.textContent).toBe('fox fox ');
  });

  it('keeps the whole passage readable around the mark', () => {
    host.at = { charIndex: 4, charLength: 5 };

    // Nothing may be dropped by the split -- the text around the spoken word is what makes the
    // highlight a place in a sentence rather than a word on its own.
    expect(render().textContent).toBe('the quick brown fox');
  });

  it('renders the text untouched when nothing is being read', () => {
    host.at = null;

    expect(render().textContent).toBe('the quick brown fox');
    expect(mark()).toBeNull();
  });

  it('marks nothing when the offset is past the end of the passage', () => {
    // Engines count the trailing silence of a passage as a boundary. Clamping into range would
    // park the highlight on the last word for as long as that silence lasts.
    host.at = { charIndex: 99, charLength: 3 };

    expect(mark()).toBeNull();
    expect(render().textContent).toBe('the quick brown fox');
  });

  it('marks nothing for a negative offset', () => {
    host.at = { charIndex: -1, charLength: 3 };

    expect(mark()).toBeNull();
  });

  it('marks at least one character, so a zero length is still visible', () => {
    host.at = { charIndex: 4, charLength: 0 };

    expect(mark()?.textContent).toBe('q');
  });

  it('stops at the end of the passage when the length overruns it', () => {
    host.at = { charIndex: 16, charLength: 50 };

    expect(mark()?.textContent).toBe('fox');
    expect(render().textContent).toBe('the quick brown fox');
  });

  it('handles empty text without marking anything', () => {
    host.text = '';
    host.at = { charIndex: 0, charLength: 1 };

    expect(mark()).toBeNull();
  });
});
