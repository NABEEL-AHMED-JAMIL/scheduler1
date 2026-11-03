import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, convertToParamMap } from '@angular/router';
import { EMPTY, Observable } from 'rxjs';
import { ImageList } from './image-list';
import { PhotoPage, PhotoTab } from './photo-page';
import { ImageTypesPage } from './image-types-page';

const TABS: PhotoTab[] = ['measurement', 'description', 'ask', 'compare', 'privacy', 'details'];

/**
 * Image review (the third Tools page, owner-approved design 2026-11-03), one address: /tools/images is the list of photos (with
 * ?new=1 the upload open over it), and /tools/images?id=N is photo N's own page (&tab=compare opens that tab) -- the links
 * people keep. /tools/images?view=types is Image types, the catalog (design types-catalog), reached from the list's header.
 */
@Component({
  selector: 'app-image-review',
  imports: [ImageList, PhotoPage, ImageTypesPage],
  template: `
    @if (id(); as id) {
      <app-photo-page [id]="id" [initialTab]="tab()" />
    } @else if (types()) {
      <app-image-types-page />
    } @else {
      <app-image-list [openNew]="newAsked()" />
    }
  `,
})
export class ImageReview {
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly params = toSignal(this.route?.queryParamMap ?? (EMPTY as Observable<ParamMap>), { initialValue: convertToParamMap({}) });
  readonly id = computed(() => { const n = Number(this.params().get('id')); return n > 0 ? n : null; });
  readonly newAsked = computed(() => this.params().get('new') === '1');
  readonly types = computed(() => this.params().get('view') === 'types');
  readonly tab = computed<PhotoTab>(() => { const t = this.params().get('tab') as PhotoTab; return TABS.includes(t) ? t : 'measurement'; });
}
