import { Component, computed, input } from '@angular/core';

/** One place that decides what a status looks like, so Failed is the same red everywhere. */
@Component({
  selector: 'app-status',
  template: `<span [class]="cls()">{{ label() || '—' }}</span>`,
})
export class StatusPill {
  readonly label = input<string | undefined | null>('');

  readonly cls = computed(() => {
    switch ((this.label() || '').toLowerCase()) {
      case 'active':
      case 'completed':
      case 'success':
      case 'ok':        return 'pill pill-ok';
      case 'failed':
      case 'interrupt':
      case 'delete':    return 'pill pill-crit';
      case 'missed':
      case 'skip':
      case 'inactive':  return 'pill pill-warn';
      case 'running':
      case 'start':
      case 'queue':     return 'pill pill-brand';
      default:          return 'pill pill-neutral';
    }
  });
}
