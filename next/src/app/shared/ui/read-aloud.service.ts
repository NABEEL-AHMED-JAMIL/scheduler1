import { Injectable, inject, signal } from '@angular/core';
import { ToastService } from './toast.service';

/** Where the voice has reached: which passage, and the word inside it being said now. */
export interface ReadAloudProgress {
  /** Index into the passages handed to play(). */
  passage: number;
  /** Start of the spoken word within that passage's own text. */
  charIndex: number;
  /** Length of the spoken word. */
  charLength: number;
}

export type ReadAloudState = 'idle' | 'playing' | 'paused';

/**
 * Reading text back aloud, and saying where the voice has got to so a caller can follow along.
 *
 * The counterpart of [DictationService], which turns speech into text; this turns text into
 * speech. Kept beside it, and as a service rather than in the one screen that reads transcripts,
 * because following along is useful anywhere there is a wall of extracted text -- a converted
 * document reads exactly the same way.
 *
 * <b>One passage is spoken at a time, not the whole text in a single utterance.</b> The boundary
 * events that make the highlight possible report a character offset, and an offset into one
 * passage is directly usable while an offset into a concatenation of forty of them has to be
 * mapped back. Speaking passage by passage also survives the long-utterance truncation that
 * Chrome applies somewhere past a few hundred characters, and it gives the caller the current
 * passage for free.
 *
 * Signals make the browser's callbacks safe without NgZone: setting one schedules its own change
 * detection.
 */
@Injectable({ providedIn: 'root' })
export class ReadAloudService {
  private readonly toast = inject(ToastService);

  /** Not every browser can speak, and the control should not appear where it cannot. */
  readonly supported =
    typeof window !== 'undefined' && !!window.speechSynthesis
    && typeof (window as any).SpeechSynthesisUtterance === 'function';

  readonly state = signal<ReadAloudState>('idle');
  readonly progress = signal<ReadAloudProgress | null>(null);

  /** Speaking rate. Applied to each new passage, so a change takes effect from the next one. */
  readonly rate = signal(1);

  /**
   * Which run of playback this is.
   *
   * cancel() delivers an end event for the utterance it stopped, and that event arrives after
   * the next run may already have started -- the same shape of trap DictationService documents
   * for handing over the microphone. An end event from a superseded run must not advance the new
   * run's position or clear its state, so every callback checks its own generation first.
   */
  private generation = 0;

  private passages: string[] = [];
  private at = 0;

  /**
   * Holds the utterance being spoken.
   *
   * Chrome collects an utterance that nothing references while it is still being spoken, and the
   * speech stops partway with no error and no end event. The reference is what prevents that, so
   * it is deliberate rather than leftover.
   */
  private current: SpeechSynthesisUtterance | null = null;

  /**
   * Reads `passages` in order, starting at `from`.
   *
   * Anything already being spoken is stopped first: the browser has one voice, and queueing a
   * second reading behind the first is never what pressing play means.
   */
  play(passages: string[], from = 0): void {
    if (!this.supported) {
      this.toast.error('This browser cannot read text aloud.');
      return;
    }
    const spoken = passages.map(text => (text ?? '').trim());
    // Blank passages are kept rather than filtered, so an index still lines up with the caller's
    // own list -- it is what the highlight is positioned by. They are skipped when reached.
    if (!spoken.some(Boolean)) {
      this.toast.error('There is nothing here to read.');
      return;
    }
    this.halt();
    this.generation++;
    this.passages = spoken;
    this.at = Math.max(0, Math.min(from, spoken.length - 1));
    this.speakFromCursor();
  }

  pause(): void {
    if (this.state() !== 'playing') return;
    window.speechSynthesis.pause();
    this.state.set('paused');
  }

  resume(): void {
    if (this.state() !== 'paused') return;
    window.speechSynthesis.resume();
    this.state.set('playing');
  }

  /** Stops, and forgets where it had reached. */
  stop(): void {
    this.generation++;
    this.halt();
    this.state.set('idle');
    this.progress.set(null);
  }

  /**
   * Re-reads the passage now being spoken.
   *
   * How a rate change takes effect: an utterance's rate is fixed once it is speaking, so the only
   * way to apply a new one without waiting for the next passage is to say this one again at it.
   */
  restartCurrentPassage(): void {
    if (this.state() === 'idle' || !this.passages.length) return;
    const resumeAt = this.at;
    this.generation++;
    this.halt();
    this.at = resumeAt;
    this.speakFromCursor();
  }

  /**
   * Cancels any speech without touching the generation.
   *
   * Separate from stop() because the callers differ in what should happen next: stop() is
   * finished, while play() and restartCurrentPassage() are about to speak again.
   */
  private halt(): void {
    if (!this.supported) return;
    this.current = null;
    // Cancelling while paused leaves some engines unable to speak again until they are resumed,
    // which presents as a play button that does nothing at all.
    if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    window.speechSynthesis.cancel();
  }

  private speakFromCursor(): void {
    const mine = this.generation;
    // Skip past anything blank -- a timestamp with no speech after it is a real segment in a
    // transcript, and stopping on it would end the reading early.
    while (this.at < this.passages.length && !this.passages[this.at]) this.at++;
    if (this.at >= this.passages.length) {
      this.state.set('idle');
      this.progress.set(null);
      return;
    }

    const index = this.at;
    const text = this.passages[index];
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.rate();

    utterance.onstart = () => {
      if (mine !== this.generation) return;
      this.state.set('playing');
      // Positioned at the start immediately. Some engines send no boundary event until the
      // second word, and without this the first word of every passage went unhighlighted.
      this.progress.set({ passage: index, charIndex: 0, charLength: wordLengthAt(text, 0) });
    };

    utterance.onboundary = event => {
      if (mine !== this.generation) return;
      // Non-word boundaries (sentence, in engines that send them) would move the highlight to
      // punctuation, which reads as the highlight briefly losing its place.
      if (event.name && event.name !== 'word') return;
      const charIndex = event.charIndex ?? 0;
      this.progress.set({
        passage: index,
        charIndex,
        // charLength is optional in the spec and Safari omits it; measuring the word at the
        // offset is what keeps the highlight the width of a word rather than a single letter.
        charLength: wordLengthAt(text, charIndex, (event as any).charLength),
      });
    };

    utterance.onend = () => {
      if (mine !== this.generation) return;
      this.at = index + 1;
      this.speakFromCursor();
    };

    utterance.onerror = event => {
      if (mine !== this.generation) return;
      // Cancelling raises an error rather than an end on some engines, and it is not a fault
      // worth telling anyone about -- it is what stop() does.
      if ((event as any)?.error === 'interrupted' || (event as any)?.error === 'canceled') return;
      this.state.set('idle');
      this.progress.set(null);
      this.toast.error('The reading stopped unexpectedly.');
    };

    this.current = utterance;
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * The length of the word at `index`, preferring what the engine reported.
 *
 * A reported length of zero is treated as absent: it is what an engine sends when it knows the
 * offset but not the extent, and trusting it collapses the highlight to nothing.
 */
export function wordLengthAt(text: string, index: number, reported?: number): number {
  if (typeof reported === 'number' && reported > 0) return reported;
  const match = /^\S+/.exec(text.slice(index));
  return match ? match[0].length : 1;
}
