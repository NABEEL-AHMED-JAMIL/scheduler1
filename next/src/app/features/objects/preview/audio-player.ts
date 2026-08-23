import { Component, ElementRef, computed, effect, input, signal, viewChild } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';

/**
 * Audio controls that match the rest of the product.
 *
 * The native <audio> widget is styled by the browser, so it looked like a fragment of a
 * different application inside the viewer and could not follow the theme at all.
 */
@Component({
  selector: 'app-audio-player',
  imports: [Icon],
  template: `
    <div class="card p-4">
      <audio #el [src]="src()" preload="metadata"
             (loadedmetadata)="onMeta()" (timeupdate)="onTime()"
             (play)="playing.set(true)" (pause)="playing.set(false)"
             (ended)="playing.set(false)" class="hidden"></audio>

      <div class="flex items-center gap-3">
        <button type="button" class="audio-play" (click)="toggle()"
                [attr.aria-label]="playing() ? 'Pause' : 'Play'">
          <app-icon [name]="playing() ? 'pause' : 'play'" size="1.05em" />
        </button>

        <span class="text-xs tabular text-[color:var(--text-muted)] w-10 shrink-0">
          {{ clock(current()) }}
        </span>

        <input type="range" class="audio-range flex-1" min="0" step="0.1"
               [max]="duration() || 0" [value]="current()"
               aria-label="Seek"
               (input)="seek($any($event.target).value)" />

        <span class="text-xs tabular text-[color:var(--text-muted)] w-10 shrink-0 text-right">
          {{ clock(duration()) }}
        </span>

        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="cycleRate()"
                [title]="'Playback speed — ' + rate() + 'x'">
          <span class="text-xs tabular font-medium">{{ rate() }}x</span>
        </button>

        <button type="button" class="btn btn-ghost btn-icon btn-sm" (click)="toggleMute()"
                [attr.aria-label]="muted() ? 'Unmute' : 'Mute'">
          <app-icon [name]="muted() ? 'volumeOff' : 'volume'" size="0.95em" />
        </button>
      </div>
    </div>
  `,
})
export class AudioPlayer {
  readonly src = input.required<string | null>();
  private readonly el = viewChild.required<ElementRef<HTMLAudioElement>>('el');

  readonly playing = signal(false);
  readonly current = signal(0);
  readonly duration = signal(0);
  readonly muted = signal(false);
  readonly rate = signal(1);

  private audio(): HTMLAudioElement { return this.el().nativeElement; }

  onMeta(): void {
    const value = this.audio().duration;
    this.duration.set(Number.isFinite(value) ? value : 0);
  }

  onTime(): void { this.current.set(this.audio().currentTime); }

  toggle(): void {
    const audio = this.audio();
    audio.paused ? audio.play() : audio.pause();
  }

  seek(value: string): void {
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return;
    this.audio().currentTime = seconds;
    this.current.set(seconds);
  }

  toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    this.audio().muted = next;
  }

  cycleRate(): void {
    const rates = [1, 1.25, 1.5, 2, 0.75];
    const next = rates[(rates.indexOf(this.rate()) + 1) % rates.length];
    this.rate.set(next);
    this.audio().playbackRate = next;
  }

  clock(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const mins = Math.floor(total / 60);
    const secs = `${total % 60}`.padStart(2, '0');
    if (mins < 60) return `${mins}:${secs}`;
    return `${Math.floor(mins / 60)}:${`${mins % 60}`.padStart(2, '0')}:${secs}`;
  }
}
