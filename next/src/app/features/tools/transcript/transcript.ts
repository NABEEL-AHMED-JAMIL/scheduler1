import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, convertToParamMap } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';
import { TranscriptList } from './transcript-list';
import { TranscriptPage } from './transcript-page';

/**
 * Audio Transcript (tools Option A, owner 2026-11-02), one address: /tools/transcript is the list of recordings (with
 * ?new=1 the new transcript open over it), and /tools/transcript?id=N is recording N's own page -- the links people keep.
 */
@Component({
  selector: 'app-transcript',
  imports: [TranscriptList, TranscriptPage],
  template: `
    @if (id(); as id) {
      <app-transcript-page [id]="id" />
    } @else {
      <app-transcript-list [openNew]="newAsked()" />
    }
  `,
})
export class Transcript {
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly params = toSignal(this.route?.queryParamMap ?? (EMPTY as Observable<ParamMap>), { initialValue: convertToParamMap({}) });
  readonly id = computed(() => { const n = Number(this.params().get('id')); return n > 0 ? n : null; });
  readonly newAsked = computed(() => this.params().get('new') === '1');
}
