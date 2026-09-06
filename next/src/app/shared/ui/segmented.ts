import { Component, input, model } from '@angular/core';
import { Icon } from './icon';

export interface SegmentOption<T extends string> {
  id: T;
  label: string;
  icon?: string;
}

/**
 * Generic one-of-N segmented control -- upload-vs-bucket, timeline/table/console, any future
 * pill-row choice. Extracted after the same `.seg` markup was hand-rolled three times across
 * two screens (Document Converter's source toggle, Audio Transcript's own source toggle, and
 * Audio Transcript's transcript-view toggle), and had already drifted once: Transcript's source
 * toggle used plain btn-primary/btn-default buttons instead of `.seg`, so it read as a
 * different control from every other one-of-N choice in the app, including its own view toggle
 * a few lines below it in the same template. `ViewToggle` stays a separate, narrower component --
 * it also persists the choice per screen, which is specific to the table/cards convention, not
 * a general segmented-control concern.
 */
@Component({
  selector: 'app-segmented',
  imports: [Icon],
  template: `
    <div class="seg" role="group" [attr.aria-label]="ariaLabel()">
      @for (option of options(); track option.id) {
        <button type="button" class="seg-btn" [class.seg-on]="value() === option.id"
                [attr.aria-pressed]="value() === option.id"
                (click)="value.set(option.id)">
          @if (option.icon) { <app-icon [name]="option.icon" size="0.9em" /> }
          {{ option.label }}
        </button>
      }
    </div>
  `,
})
export class Segmented<T extends string> {
  readonly value = model.required<T>();
  readonly options = input.required<SegmentOption<T>[]>();
  readonly ariaLabel = input('Choose an option');
}
