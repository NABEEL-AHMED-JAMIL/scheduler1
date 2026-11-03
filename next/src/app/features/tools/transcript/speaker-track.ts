import { Component, computed, input, output } from '@angular/core';
import { Segment, trackSpans } from './transcript.model';

/**
 * The player's one track (tools Option A, owner 2026-11-02): who speaks when, each stretch in its speaker's colour, what was
 * played full and what is to come lighter, the search's hits marked above it, and the playhead. A click or an arrow key
 * seeks. Replaces the waveform and a lane per speaker.
 */
@Component({
  selector: 'app-speaker-track',
  styles: `
    :host { display: block; flex: 1 1 auto; min-width: 6rem; }
    .st { position: relative; height: 1.25rem; cursor: pointer; display: flex; align-items: center; }
    .st:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-sm); }
    .st-bar { position: relative; width: 100%; height: 0.625rem; border-radius: var(--radius-full); background: var(--surface-sunken); overflow: hidden; }
    .st-bar i { position: absolute; top: 0; bottom: 0; background: var(--spk); opacity: 0.35; }
    .st-bar i.played { opacity: 1; }
    .st-hit { position: absolute; top: -0.125rem; width: 0.1875rem; height: 0.25rem; margin-left: -0.09375rem; border-radius: var(--radius-sm);
      background: var(--color-warn-500); }
    .st-head { position: absolute; top: 0; width: 0.25rem; height: 1.25rem; margin-left: -0.125rem; border-radius: var(--radius-sm);
      background: var(--text-primary); box-shadow: 0 0 0 2px var(--surface-raised); pointer-events: none; }
    .spk-0 { --spk: var(--chart-0); } .spk-1 { --spk: var(--chart-2); } .spk-2 { --spk: var(--chart-4); }
    .spk-3 { --spk: var(--chart-3); } .spk-4 { --spk: var(--chart-5); } .spk-5 { --spk: var(--chart-6); }
  `,
  template: `
    <div class="st" role="slider" tabindex="0" [attr.aria-label]="label()" aria-valuemin="0" aria-valuemax="100"
         [attr.aria-valuenow]="round(position() * 100)" (click)="click($event)" (keydown)="key($event)" data-test="speaker-track">
      <div class="st-bar">
        @for (s of spans(); track $index) {
          <i [class]="'spk-' + (s.speaker % 6)" [class.played]="s.left < position() * 100" [style.left.%]="s.left" [style.width.%]="s.width"></i>
        }
      </div>
      @for (m of hits(); track $index) { <span class="st-hit" [style.left.%]="m * 100"></span> }
      <span class="st-head" [style.left.%]="position() * 100"></span>
    </div>
  `,
})
export class SpeakerTrack {
  readonly segments = input<Segment[]>([]);
  /** The recording's length, in seconds. */
  readonly duration = input(0);
  /** Where playback is, 0..1. */
  readonly position = input(0);
  /** Search hits, as fractions of the recording. */
  readonly hits = input<number[]>([]);
  readonly label = input('Position in the recording');
  readonly seek = output<number>();
  readonly spans = computed(() => trackSpans(this.segments(), this.duration() * 1000));
  readonly round = Math.round;

  click(event: MouseEvent): void {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    if (box.width > 0) this.seek.emit(Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  }

  key(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' ? 0.02 : event.key === 'ArrowLeft' ? -0.02 : 0;
    if (!step) return;
    event.preventDefault();
    event.stopPropagation();
    this.seek.emit(Math.min(1, Math.max(0, this.position() + step)));
  }
}
