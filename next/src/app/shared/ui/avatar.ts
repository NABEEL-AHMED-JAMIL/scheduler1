import { Component, DestroyRef, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from '../../core/api/api.config';

/**
 * Someone's picture, or their initials when there is none.
 *
 * Two ways in. Given an `appUserId` it asks appUser.json/avatar, which resolves the key from that
 * person's row on the server; given a bucket and key it reads the object directly. The first is
 * for other people, because platform buckets are no longer readable by whoever can guess a key --
 * the ids in those keys run in sequence -- and the second is for your own picture, which the
 * storage guard still lets you read.
 *
 * Either way it goes through HttpClient rather than a plain <img src>: the request needs the
 * bearer token the interceptor attaches, and an unauthenticated one is blocked outright. The blob
 * URL is revoked per instance, otherwise a list of users leaks one per row.
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
  /** Preferred for anyone but the signed-in user: the server decides which key to read. */
  readonly appUserId = input<number | null | undefined>(null);
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
      const appUserId = this.appUserId();
      const bucket = this.bucket();
      const key = this.key();

      const previous = untracked(() => this.objectUrl());
      if (previous) URL.revokeObjectURL(previous);
      this.objectUrl.set('');
      if (!appUserId && (!bucket || !key)) return;

      const request = appUserId
        ? this.http.get(`${API_BASE}/appUser.json/avatar`,
            { params: { appUserId }, responseType: 'blob' })
        : this.http.get(`${API_BASE}/storage.json/previewObject`,
            { params: { bucket: bucket!, key: key! }, responseType: 'blob' });

      request.subscribe({
        next: blob => this.objectUrl.set(URL.createObjectURL(blob)),
        // A missing or unreadable picture falls back to initials rather than a broken image.
        error: () => this.objectUrl.set(''),
      });
    });
  }
}
