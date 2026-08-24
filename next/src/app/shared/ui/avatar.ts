import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from '../../core/api/api.config';

/**
 * Someone's picture, or their initials when there is none.
 *
 * The picture lives behind storage.json/previewObject, which needs the bearer token -- a
 * plain <img src> is an unauthenticated request the browser then blocks outright. So it is
 * fetched through HttpClient, where the interceptor attaches the token, and bound as a blob
 * URL. Each instance revokes its own URL, otherwise a list of users leaks one per row.
 */
@Component({
  selector: 'app-avatar',
  template: `
    @if (url()) {
      <img [src]="url()" [alt]="name()" class="avatar-img" [style.width.rem]="size()" [style.height.rem]="size()" />
    } @else {
      <span class="avatar-initials" [style.width.rem]="size()" [style.height.rem]="size()"
            [style.font-size.rem]="size() * 0.38" [title]="name()">{{ initials() }}</span>
    }
  `,
})
export class Avatar {
  readonly bucket = input<string | null | undefined>(null);
  readonly key = input<string | null | undefined>(null);
  readonly name = input('');
  /** Rendered size in rem, so one input drives width, height and the initials' type size. */
  readonly size = input(2.25);

  private readonly http = inject(HttpClient);
  private readonly objectUrl = signal('');
  readonly url = this.objectUrl.asReadonly();

  readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    const letters = parts.length > 1
      ? parts[0][0] + parts[parts.length - 1][0]
      : parts[0].slice(0, 2);
    return letters.toUpperCase();
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      const current = untracked(() => this.objectUrl());
      if (current) URL.revokeObjectURL(current);
    });

    effect(() => {
      const bucket = this.bucket();
      const key = this.key();

      const previous = untracked(() => this.objectUrl());
      if (previous) URL.revokeObjectURL(previous);
      this.objectUrl.set('');
      if (!bucket || !key) return;

      this.http.get(`${API_BASE}/storage.json/previewObject`, {
        params: { bucket, key }, responseType: 'blob',
      }).subscribe({
        next: blob => this.objectUrl.set(URL.createObjectURL(blob)),
        // A missing or unreadable picture falls back to initials rather than a broken image.
        error: () => this.objectUrl.set(''),
      });
    });
  }
}
