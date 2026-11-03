import { computed, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { TranscriptApi } from './transcript.api';

/**
 * A recording's playback, for the list's panel and the transcript's page (tools Option A): the audio read once from
 * /recordings/{id}/audio as bytes the browser can seek in, where it is, whether it plays, and how fast. A part of a split
 * recording plays from its offset in the file; times are the part's own. The page owns the <audio> element and gives it.
 */
export class Playback {
  readonly url = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly playing = signal(false);
  /** Seconds into the recording (the part's own). */
  readonly current = signal(0);
  readonly rate = signal(1);
  readonly offset = signal(0);
  readonly duration = signal(0);
  readonly position = computed(() => (this.duration() ? Math.min(1, this.current() / this.duration()) : 0));
  private read: Subscription | null = null;
  private id: number | null = null;

  constructor(private readonly el: () => HTMLAudioElement | undefined) {}

  /** Reads the recording's audio, once per recording. */
  load(api: TranscriptApi, id: number, offset: number, duration: number): void {
    this.offset.set(offset || 0);
    this.duration.set(duration || 0);
    if (this.id === id && (this.url() || this.loading())) return;
    this.reset();
    this.id = id;
    this.loading.set(true);
    this.read = api.audio(id).subscribe({
      next: blob => { this.loading.set(false); if (this.id === id) this.url.set(URL.createObjectURL(blob)); },
      error: () => { this.loading.set(false); this.error.set('The recording could not be loaded for playback. The transcript is all here.'); },
    });
  }

  /** Lets go of the audio (another recording, or leaving). */
  reset(): void {
    this.read?.unsubscribe();
    this.read = null;
    this.el()?.pause();
    const url = this.url();
    if (url) URL.revokeObjectURL(url);
    this.url.set(null);
    this.id = null;
    this.loading.set(false);
    this.error.set('');
    this.playing.set(false);
    this.current.set(0);
  }

  toggle(): void {
    const el = this.el();
    if (!el || !this.url()) return;
    if (el.paused) void el.play(); else el.pause();
  }

  pause(): void {
    this.el()?.pause();
  }

  seekTo(seconds: number): void {
    const el = this.el();
    const t = Math.max(0, Math.min(this.duration() || seconds, seconds));
    this.current.set(t);
    if (el) el.currentTime = this.offset() + t;
  }

  seekFraction(f: number): void {
    this.seekTo(f * this.duration());
  }

  skip(by: number): void {
    this.seekTo(this.current() + by);
  }

  /** Plays from a moment (a segment's start): seeks, and starts when it was not playing. */
  playFrom(seconds: number): void {
    this.seekTo(seconds);
    const el = this.el();
    if (el && el.paused && this.url()) void el.play();
  }

  setRate(rate: number): void {
    this.rate.set(rate);
    const el = this.el();
    if (el) el.playbackRate = rate;
  }

  onTime(): void {
    const el = this.el();
    if (!el) return;
    const t = el.currentTime - this.offset();
    if (this.duration() && t >= this.duration()) el.pause();
    this.current.set(Math.max(0, t));
  }

  onLoaded(): void {
    const el = this.el();
    if (!el) return;
    el.playbackRate = this.rate();
    el.currentTime = this.offset() + this.current();
  }
}
