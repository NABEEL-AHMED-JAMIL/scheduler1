import { Component, computed, input } from '@angular/core';
import { Icon } from './icon';

/** One place that decides what a status looks like, so Failed is the same red everywhere. */
@Component({
  selector: 'app-status',
  imports: [Icon],
  template: `
    <span [class]="cls()">
      @if (showIcon() && glyph()) { <app-icon [name]="glyph()" size="0.85em" /> }
      {{ label() || '—' }}
    </span>
  `,
})
export class StatusPill {
  readonly label = input<string | undefined | null>('');
  /** Shape as well as colour: red and green alone are the one pairing many people cannot separate. */
  readonly showIcon = input(true);

  private readonly tone = computed(() => {
    switch ((this.label() || '').toLowerCase()) {
      case 'active':
      case 'completed':
      case 'success':
      case 'ok':        return 'ok';
      case 'failed':
      case 'interrupt':
      case 'delete':    return 'crit';
      case 'missed':
      case 'skip':
      case 'suspended':
      case 'inactive':  return 'warn';
      case 'running':
      case 'start':
      case 'queue':     return 'brand';
      default:          return 'neutral';
    }
  });

  readonly cls = computed(() => `pill pill-${this.tone()}`);

  readonly glyph = computed(() => {
    switch (this.tone()) {
      case 'ok':    return 'checkCircle';
      case 'crit':  return 'xCircle';
      case 'warn':  return 'alert';
      case 'brand': return 'clock';
      // A neutral pill has no state to signal. A glyph here would invent one -- "Stored"
      // with a minus in front of it reads as the opposite of what it means.
      default:      return '';
    }
  });
}
