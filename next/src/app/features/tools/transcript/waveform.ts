import { Component, computed, input, output } from '@angular/core';
import { barsOf } from './transcript.model';

/**
 * A recording's waveform (tools redesign): its loudness as bars, what was played darker than what is to come, a playhead,
 * and the search's hits marked above. A click or a key seeks. The peaks come from the transcriber (0..1).
 */
@Component({
  selector: 'app-waveform',
  styles: `
    :host { display: block; position: relative; }
    .wf { position: relative; height: 4rem; cursor: pointer; }
    .wf:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; border-radius: var(--radius-sm); }
    svg { width: 100%; height: 100%; display: block; }
    .bar { fill: var(--color-info-300); }
    .bar.played { fill: var(--color-info-600); }
    .hit { fill: var(--color-warn-500); }
    .head { position: absolute; top: -0.25rem; bottom: -0.25rem; width: 2px; background: var(--text-primary); pointer-events: none; }
    .head::before { content: ""; position: absolute; top: -0.25rem; left: -0.25rem; width: 0.625rem; height: 0.625rem;
                    border-radius: var(--radius-full); background: var(--text-primary); }
    .flat { position: absolute; left: 0; right: 0; top: 50%; height: 1px; background: var(--border-strong); }
  `,
  template: `
    <div class="wf" role="slider" tabindex="0" aria-label="Position in the recording" aria-valuemin="0" aria-valuemax="100"
         [attr.aria-valuenow]="round(position() * 100)" (click)="click($event)" (keydown)="key($event)" data-test="waveform">
      @if (bars().length) {
        <svg [attr.viewBox]="'0 0 ' + bars().length * 3 + ' 64'" preserveAspectRatio="none" aria-hidden="true">
          @for (h of bars(); track $index) {
            <rect class="bar" [class.played]="$index / bars().length < position()" [attr.x]="$index * 3" [attr.width]="2"
                  [attr.y]="32 - max(1, h * 30)" [attr.height]="max(2, h * 60)" />
          }
          @for (m of hits(); track $index) {
            <rect class="hit" [attr.x]="m * bars().length * 3 - 1" y="0" width="3" height="5" />
          }
        </svg>
      } @else {
        <div class="flat"></div>
      }
      <div class="head" [style.left.%]="position() * 100"></div>
    </div>
  `,
})
export class Waveform {
  readonly peaks = input<number[]>([]);
  /** Where playback is, 0..1. */
  readonly position = input(0);
  /** Search hits, as fractions of the recording. */
  readonly hits = input<number[]>([]);
  readonly seek = output<number>();
  readonly bars = computed(() => barsOf(this.peaks(), 240));
  readonly max = Math.max;
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
