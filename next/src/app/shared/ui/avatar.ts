import { ChangeDetectionStrategy, Component, Injectable, Signal, WritableSignal, computed, inject, input, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE } from '../../core/api/api.config';

/**
 * The initials a person is shown by without a picture: the first and last word's first letters, or a one-word name's
 * first two. A bracketed word is a note, not a name ("Acceptance Test User (synthetic)" read "A("), and a word's
 * leading punctuation is not its initial. "?" when nothing is left. The one rule for every avatar, the header's too.
 */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/)
    .filter(word => !/^[([{]/.test(word))
    .map(word => word.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter(Boolean);
  if (!parts.length) return '?';
  const letters = parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2);
  return letters.toUpperCase();
}

/** How many colours initials are drawn on: the categorical chart ramp, --chart-0 to --chart-7. */
export const AVATAR_TONES = 8;

/**
 * Which of the eight colours a person's initials sit on: fixed by their id, so they are the same colour on every screen
 * and every visit. A multiplicative hash rather than id % 8, so neighbours (people added one after another) spread
 * across the ramp. Without an id the name decides, the same way.
 *
 * The ramp is the chart palette, which holds every slot at 5:1 or better against the raised surface in both themes; the
 * initials are drawn in the surface colour on it, so the same pair reads in light (white on a mid tone) and in dark
 * (navy on the lifted tone).
 */
export function avatarTone(appUserId: number | null | undefined, name?: string | null): number {
  if (appUserId != null && Number.isFinite(appUserId)) {
    return Math.imul(Math.trunc(appUserId), 0x9e3779b1) >>> 29;
  }
  let hash = 0x811c9dc5;
  for (const ch of (name ?? '').trim().toLowerCase()) hash = Math.imul(hash ^ ch.charCodeAt(0), 0x01000193);
  return hash >>> 29;
}

/**
 * Every picture the console has fetched, once per person, size and version, shared by every avatar that shows it -- a
 * list of fifty rows by one person asks once, not fifty times.
 *
 * A known version is fetched with ?v=, which the server caches for a year as immutable (a new picture is a new
 * version, so a new URL). An unknown one (a screen whose data names the person but not their picture) is asked
 * without, once per session -- "no picture" included, so initials do not re-ask on every screen; the server's own
 * five-minute cache covers a reload.
 *
 * The pictures come back as blobs through HttpClient: an <img src> cannot carry the bearer token. The cache owns the
 * blob URLs and releases the oldest past {@link MAX}.
 */
@Injectable({ providedIn: 'root' })
export class AvatarCache {
  static readonly MAX = 300;

  private readonly http = inject(HttpClient);
  private readonly entries = new Map<string, WritableSignal<string | null | undefined>>();

  /** The picture's blob URL: undefined while it loads, null when there is none or it cannot be read. */
  picture(appUserId: number, px: 64 | 256, version: string | undefined): Signal<string | null | undefined> {
    const key = `${appUserId}:${px}:${version ?? ''}`;
    let url = this.entries.get(key);
    if (!url) {
      const made = (url = signal<string | null | undefined>(undefined));
      this.entries.set(key, made);
      this.http.get(`${API_BASE}/appUser.json/avatar?appUserId=${appUserId}&size=${px}${version ? '&v=' + version : ''}`,
        { responseType: 'blob' }).subscribe({
        // Kept only while still cached: a picture evicted mid-flight would make a URL nothing releases.
        next: blob => {
          if (this.entries.get(key) === made) made.set(blob instanceof Blob && blob.size ? URL.createObjectURL(blob) : null);
        },
        error: () => made.set(null),
      });
      while (this.entries.size > AvatarCache.MAX) this.drop(this.entries.keys().next().value as string);
    }
    return url;
  }

  /** Forgets what is known about one person's picture, as after they change it. */
  forget(appUserId: number): void {
    for (const key of [...this.entries.keys()]) if (key.startsWith(`${appUserId}:`)) this.drop(key);
  }

  private drop(key: string): void {
    const url = this.entries.get(key)?.();
    if (url) URL.revokeObjectURL(url);
    this.entries.delete(key);
  }
}

/**
 * A person: their picture, or their initials on their own colour. The one way the console shows anyone -- the top bar,
 * Profile, Users, the access grid, the inbox, reviews, activity lists, file chat.
 *
 * Give it the person's id and, when the data has it, their avatarVersion: a version fetches that picture (cached for
 * good), null says they have none (nothing is asked), and leaving it out asks once per session for whatever they have.
 * Its colour is a class, .avatar-tone-0 to -7 (styles.css), on the chart ramp. The initials are drawn from
 * data-initials by CSS, so a sentence that names someone beside their avatar ("Approved by ...") reads as written.
 */
@Component({
  selector: 'app-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url()) {
      <img [src]="url()" [alt]="label()" class="avatar-img" decoding="async" [attr.title]="label() || null"
           [style.width.rem]="size()" [style.height.rem]="size()" />
    } @else {
      <span [class]="'avatar-initials avatar-tone-' + tone()" [attr.role]="label() ? 'img' : null"
            [style.width.rem]="size()" [style.height.rem]="size()" [style.font-size.rem]="size() * 0.38"
            [attr.aria-label]="label() || null" [attr.aria-hidden]="label() ? null : 'true'" [attr.title]="label() || null" [attr.data-initials]="initials()"></span>
    }
  `,
})
export class Avatar {
  readonly appUserId = input<number | null | undefined>(null);
  /** The person's avatarVersion: a version, null for none, or left out when the data does not say. */
  readonly version = input<string | null | undefined>(undefined);
  readonly name = input<string | null | undefined>('');
  /** Rendered size in rem, so one input drives width, height and the initials' type size. */
  readonly size = input(2.25);
  /** True where the name is printed beside it: then the picture is not announced a second time. */
  readonly decorative = input(false);

  private readonly cache = inject(AvatarCache);

  readonly initials = computed(() => initialsOf(this.name()));
  readonly label = computed(() => (this.decorative() ? '' : this.name() ?? ''));
  readonly tone = computed(() => avatarTone(this.appUserId(), this.name()));

  private readonly picture = computed(() => {
    const id = this.appUserId();
    const version = this.version();
    // 64 px covers anything up to 2rem on a 2x screen; larger avatars take the 256 px picture.
    const px = this.size() > 2 ? 256 : 64;
    // Untracked: the cache's own bookkeeping (and the request it may start) is not this avatar's dependency.
    return !id || version === null || version === '' ? null : untracked(() => this.cache.picture(id, px, version));
  });

  readonly url = computed(() => this.picture()?.() ?? '');
}
