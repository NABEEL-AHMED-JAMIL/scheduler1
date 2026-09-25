import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { DictationService } from './dictation.service';
import { ToastService } from './toast.service';

/** A stand-in for the browser's SpeechRecognition that records what was asked of it. */
class FakeRecognition {
  static last: FakeRecognition;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onresult: ((e: unknown) => void) | null = null;
  aborted = false;
  constructor() { FakeRecognition.last = this; }
  start() { this.onstart?.(); }
  stop() {}
  abort() { this.aborted = true; }
  say(text: string) { this.onresult?.({ results: [[{ transcript: text }]] }); }
}

/**
 * A composer that goes away mid-sentence -- a panel closed, a route left -- must drop the
 * microphone at once and must not have words land in a field that no longer exists.
 */
describe('DictationService.abort', () => {
  const original = (window as any).SpeechRecognition;
  afterEach(() => { (window as any).SpeechRecognition = original; });

  function service() {
    (window as any).SpeechRecognition = FakeRecognition;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [{ provide: ToastService, useValue: { error: vi.fn() } }] });
    return TestBed.inject(DictationService);
  }

  it('aborts the session, frees the microphone and drops any late words', () => {
    const dictation = service();
    const heard: string[] = [];
    dictation.toggle('chat', said => heard.push(said));
    const session = FakeRecognition.last;
    expect(dictation.listeningFor('chat')).toBe(true);

    dictation.abort('chat');

    expect(session.aborted).toBe(true);
    expect(dictation.listeningFor('chat')).toBe(false);
    session.say('too late');
    expect(heard).toEqual([]);
  });

  it('leaves another composer\'s session alone', () => {
    const dictation = service();
    dictation.toggle('assistant', () => {});
    const session = FakeRecognition.last;
    dictation.abort('chat');
    expect(session.aborted).toBe(false);
    expect(dictation.listeningFor('assistant')).toBe(true);
  });

  it('aborts whatever is listening when no composer is named', () => {
    const dictation = service();
    dictation.toggle('assistant', () => {});
    dictation.abort();
    expect(FakeRecognition.last.aborted).toBe(true);
    expect(dictation.listeningFor('assistant')).toBe(false);
  });

  it('does nothing when nothing is listening', () => {
    expect(() => service().abort()).not.toThrow();
  });
});
