import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { ReadAloudService, wordLengthAt } from './read-aloud.service';
import { ToastService } from './toast.service';

/**
 * A fake speech engine, because jsdom has none.
 *
 * It records what it was asked to say and hands back the utterance, so a test can drive the
 * callbacks the real engine would fire -- boundary, end, error -- in whatever order it likes.
 * That order is the whole difficulty in this service: cancel() delivers an end event for the
 * utterance it stopped, and it arrives after the next reading has started.
 */
class FakeSynth {
  spoken: any[] = [];
  cancelled = 0;
  paused = false;
  resumed = 0;

  speak(utterance: any): void {
    this.spoken.push(utterance);
    utterance.onstart?.();
  }
  cancel(): void { this.cancelled++; }
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; this.resumed++; }

  get last(): any { return this.spoken[this.spoken.length - 1]; }
  /** The text of everything said so far, in order. */
  get texts(): string[] { return this.spoken.map(u => u.text); }
}

describe('ReadAloudService', () => {
  let synth: FakeSynth;
  let service: ReadAloudService;
  let errors: string[];

  beforeEach(() => {
    synth = new FakeSynth();
    (window as any).speechSynthesis = synth;
    (window as any).SpeechSynthesisUtterance = class {
      text: string;
      rate = 1;
      onstart: any; onend: any; onboundary: any; onerror: any;
      constructor(text: string) { this.text = text; }
    };

    errors = [];
    TestBed.configureTestingModule({
      providers: [{ provide: ToastService, useValue: { error: (m: string) => errors.push(m), success: () => {} } }],
    });
    service = TestBed.inject(ReadAloudService);
  });

  it('speaks one passage at a time rather than the whole text at once', () => {
    service.play(['first line', 'second line', 'third line']);

    // Only the first has been handed over; the rest follow as each ends. A single utterance of
    // the lot would be truncated by Chrome past a few hundred characters, and would report
    // boundary offsets into the concatenation rather than into a passage.
    expect(synth.texts).toEqual(['first line']);

    synth.last.onend();
    expect(synth.texts).toEqual(['first line', 'second line']);
  });

  it('reports the word being spoken as an offset into its own passage', () => {
    service.play(['the quick brown fox']);

    synth.last.onboundary({ name: 'word', charIndex: 4, charLength: 5 });

    expect(service.progress()).toEqual({ passage: 0, charIndex: 4, charLength: 5 });
  });

  it('measures the word itself when the engine reports no length', () => {
    // Safari sends charIndex without charLength. Trusting the absent value collapsed the
    // highlight to a single letter.
    service.play(['the quick brown fox']);

    synth.last.onboundary({ name: 'word', charIndex: 4 });

    expect(service.progress()?.charLength).toBe(5);
  });

  it('marks the first word without waiting for a boundary event', () => {
    // Some engines send nothing until the second word, which left the first word of every
    // passage unhighlighted.
    service.play(['hello there']);

    expect(service.progress()).toEqual({ passage: 0, charIndex: 0, charLength: 5 });
  });

  it('counts the passage index against the caller list, blanks included', () => {
    // The index positions the highlight in the caller's own list, so a blank segment has to
    // occupy its place rather than being squeezed out.
    service.play(['', 'spoken words']);

    expect(synth.texts).toEqual(['spoken words']);
    expect(service.progress()?.passage).toBe(1);
  });

  it('keeps reading past a blank passage instead of stopping on it', () => {
    service.play(['first', '   ', 'third']);

    synth.last.onend();

    expect(synth.texts).toEqual(['first', 'third']);
    expect(service.state()).toBe('playing');
  });

  it('ignores an end event from a reading that was superseded', () => {
    service.play(['a', 'b', 'c']);
    const abandoned = synth.last;

    service.play(['x', 'y']);
    // The cancelled utterance's end arrives now, after the new reading has begun.
    abandoned.onend();

    // 'y' would mean the stale event advanced the new reading past its first passage.
    expect(synth.texts).toEqual(['a', 'x']);
  });

  it('ignores a boundary event from a reading that was superseded', () => {
    service.play(['abandoned passage']);
    const abandoned = synth.last;
    service.play(['current passage']);

    abandoned.onboundary({ name: 'word', charIndex: 10, charLength: 7 });

    expect(service.progress()?.charIndex).toBe(0);
  });

  it('only moves the highlight on word boundaries', () => {
    service.play(['one. two.']);
    synth.last.onboundary({ name: 'word', charIndex: 5, charLength: 3 });

    synth.last.onboundary({ name: 'sentence', charIndex: 0 });

    // A sentence boundary would drag the highlight back to punctuation, which reads as the
    // highlight losing its place.
    expect(service.progress()?.charIndex).toBe(5);
  });

  it('stop clears where it had reached', () => {
    service.play(['something to say']);
    // play() cancels first -- one voice, and queueing a second reading behind the first is never
    // what pressing play means -- so the count is compared before and after rather than absolutely.
    const before = synth.cancelled;

    service.stop();

    expect(service.state()).toBe('idle');
    expect(service.progress()).toBeNull();
    expect(synth.cancelled).toBe(before + 1);
  });

  it('resumes a paused engine before cancelling it', () => {
    // Cancelling while paused leaves some engines unable to speak again until resumed, which
    // presents as a play button that does nothing at all.
    service.play(['text']);
    service.pause();

    service.stop();

    expect(synth.resumed).toBeGreaterThan(0);
  });

  it('pause and resume move between playing and paused', () => {
    service.play(['text']);
    expect(service.state()).toBe('playing');

    service.pause();
    expect(service.state()).toBe('paused');

    service.resume();
    expect(service.state()).toBe('playing');
  });

  it('re-reads the current passage at a new speed rather than waiting for the next', () => {
    service.play(['first', 'second']);
    synth.last.onend();
    expect(synth.texts).toEqual(['first', 'second']);

    service.rate.set(1.5);
    service.restartCurrentPassage();

    expect(synth.texts).toEqual(['first', 'second', 'second']);
    expect(synth.last.rate).toBe(1.5);
  });

  it('does nothing on restart when nothing is being read', () => {
    service.restartCurrentPassage();

    expect(synth.spoken).toHaveLength(0);
  });

  it('refuses text with nothing in it to say', () => {
    service.play(['', '   ']);

    expect(synth.spoken).toHaveLength(0);
    expect(errors).toContain('There is nothing here to read.');
  });

  it('starts from a chosen passage', () => {
    service.play(['one', 'two', 'three'], 2);

    expect(synth.texts).toEqual(['three']);
    expect(service.progress()?.passage).toBe(2);
  });

  it('stays in range when asked to start past the end', () => {
    service.play(['one', 'two'], 99);

    expect(synth.texts).toEqual(['two']);
  });

  it('goes idle and reports a genuine engine failure', () => {
    service.play(['text']);

    synth.last.onerror({ error: 'synthesis-failed' });

    expect(service.state()).toBe('idle');
    expect(errors).toContain('The reading stopped unexpectedly.');
  });

  it('says nothing about an error that is just the stop button', () => {
    service.play(['text']);

    synth.last.onerror({ error: 'interrupted' });

    expect(errors).toEqual([]);
  });

  it('goes idle once the last passage ends', () => {
    service.play(['only one']);

    synth.last.onend();

    expect(service.state()).toBe('idle');
    expect(service.progress()).toBeNull();
  });
});

describe('wordLengthAt', () => {
  it('prefers the length the engine reported', () => {
    expect(wordLengthAt('the quick brown', 4, 5)).toBe(5);
  });

  it('treats a reported zero as no answer at all', () => {
    // An engine that knows the offset but not the extent sends 0; trusting it collapses the
    // highlight to nothing.
    expect(wordLengthAt('the quick brown', 4, 0)).toBe(5);
  });

  it('measures to the next space when nothing was reported', () => {
    expect(wordLengthAt('the quick brown', 10)).toBe(5);
  });

  it('counts trailing punctuation as part of the word', () => {
    // Splitting on whitespace is what the engine's own offsets are aligned to; excluding the
    // full stop would leave it unhighlighted between two highlighted words.
    expect(wordLengthAt('hello, world', 0)).toBe(6);
  });

  it('never returns zero, so a highlight is always visible', () => {
    expect(wordLengthAt('hello ', 5)).toBe(1);
    expect(wordLengthAt('', 0)).toBe(1);
  });
});
