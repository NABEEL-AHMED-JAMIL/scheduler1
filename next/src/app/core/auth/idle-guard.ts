import { Component, DestroyRef, NgZone, computed, inject, signal } from '@angular/core';
import { AuthService, IDLE_REASON, LAST_ACTIVITY_KEY, isIdleRefusal } from './auth.service';
import { API_SUCCESS } from '../api/api.config';
import { Icon } from '../../shared/ui/icon';

/** What counts as using the console. Pointer movement too, but read at most every few seconds. */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove'] as const;
/** How often a stream of activity (a moving pointer) is written down; a click or a key is written at once. */
const ACTIVITY_THROTTLE_MS = 5_000;
/** How long before the sign-out the warning shows. */
export const WARNING_MS = 60_000;
/** The idle minutes when the session says none (the platform's default). */
const DEFAULT_IDLE_MINUTES = 30;

function readNumber(key: string): number {
  try {
    return Number(localStorage.getItem(key)) || 0;
  } catch {
    return 0;
  }
}

function writeNumber(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Storage refused: this tab still counts its own activity.
  }
}

/**
 * MIG-353 part 3: idle sign-out in the console. The workspace's idle minutes come with the session; activity in any tab
 * (shared through localStorage) keeps it alive. A minute before the end the person is warned, with a countdown and a
 * button to stay; at the end the console signs out and says why.
 *
 * The console is only half of it: the server holds the session's refresh token to the same deadline (every refresh sends
 * the last activity), so a tab that is closed, asleep or tampered with cannot keep a session alive either. While the
 * person is active this keeps the server's deadline ahead of them with a refresh when it is half spent -- typing a long
 * form makes no requests, and the access token alone (5 minutes) would not carry them.
 *
 * Loaded after the shell's first paint (@defer), so none of it is in the initial bundle.
 */
@Component({
  selector: 'app-idle-guard',
  imports: [Icon],
  template: `
    @if (warning()) {
      <div class="fixed inset-x-0 bottom-4 z-[70] flex justify-center px-4 pointer-events-none">
        <div role="alertdialog" aria-labelledby="idle-title" aria-describedby="idle-body" data-test="idle-warning"
             class="card shadow-2xl pointer-events-auto w-full max-w-md p-4 flex items-start gap-3">
          <app-icon name="clock" class="icon-warn mt-0.5 shrink-0" size="1.2em" />
          <div class="min-w-0 flex-1">
            <h2 id="idle-title" class="text-sm font-semibold">Still there?</h2>
            <p id="idle-body" class="text-sm text-[color:var(--text-secondary)] mt-0.5">
              You'll be signed out in <span class="tabular font-medium text-[color:var(--text-primary)]">{{ countdown() }}</span>
              because the console has not been used for {{ idleMinutes() }} minutes.
            </p>
            <div class="flex gap-2 mt-3">
              <button type="button" class="btn btn-primary btn-sm" (click)="stay()">Stay signed in</button>
              <button type="button" class="btn btn-default btn-sm" (click)="signOut()">Sign out now</button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class IdleGuard {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);

  readonly idleMinutes = computed(() => this.auth.user()?.idleMinutes || DEFAULT_IDLE_MINUTES);
  private readonly remaining = signal(Number.POSITIVE_INFINITY);
  readonly warning = computed(() => this.remaining() <= WARNING_MS && this.remaining() > 0);
  readonly countdown = computed(() => {
    const seconds = Math.max(0, Math.ceil(this.remaining() / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  });

  private lastWritten = 0;
  private lastKeepAlive = 0;
  private signedOut = false;

  constructor() {
    // A session that has just begun counts as activity, not as a console idle since its last tab closed.
    this.markActive(true);
    const onActivity = (event: Event) => this.markActive(event.type !== 'pointermove');
    const onStorage = (event: StorageEvent) => {
      if (event.key === LAST_ACTIVITY_KEY) this.zone.run(() => this.tick());
    };
    let timer = 0;
    this.zone.runOutsideAngular(() => {
      for (const type of ACTIVITY_EVENTS) document.addEventListener(type, onActivity, { passive: true, capture: true });
      window.addEventListener('storage', onStorage);
      timer = window.setInterval(() => this.zone.run(() => this.tick()), 1000);
    });
    inject(DestroyRef).onDestroy(() => {
      for (const type of ACTIVITY_EVENTS) document.removeEventListener(type, onActivity, { capture: true });
      window.removeEventListener('storage', onStorage);
      window.clearInterval(timer);
    });
  }

  /** "Stay signed in": activity now, and the server's deadline moved with it. */
  stay(): void {
    this.markActive(true);
    this.keepAlive(true);
  }

  signOut(): void {
    this.signedOut = true;
    this.auth.logout();
  }

  private markActive(force: boolean): void {
    const now = Date.now();
    if (!force && now - this.lastWritten < ACTIVITY_THROTTLE_MS) return;
    this.lastWritten = now;
    writeNumber(LAST_ACTIVITY_KEY, now);
    if (this.remaining() <= WARNING_MS) this.zone.run(() => this.tick());
    this.keepAlive(false);
  }

  /**
   * While the person is active, a refresh once the server's deadline is half spent: the session lives as long as they
   * work, whether or not their work makes requests. At most once a minute.
   */
  private keepAlive(now: boolean): void {
    const user = this.auth.user();
    if (!user?.refreshToken || this.signedOut) return;
    const deadline = user.idleExpiresAt ? Date.parse(user.idleExpiresAt) : 0;
    const halfLife = this.idleMinutes() * 30_000;
    // No deadline known yet (a session from before it was sent): the next refresh, on the access token's expiry, brings one.
    const due = !!deadline && deadline - Date.now() < halfLife;
    if (!now && (!due || Date.now() - this.lastKeepAlive < 60_000)) return;
    this.lastKeepAlive = Date.now();
    this.auth.refresh().subscribe({
      next: response => {
        // Refused (the server's deadline passed, or the session was ended elsewhere): out, saying why when it was idle.
        if (response.status !== API_SUCCESS && !this.signedOut) {
          this.signedOut = true;
          this.auth.logout(isIdleRefusal(response.message) ? IDLE_REASON : undefined);
        }
      },
      error: () => { /* unreachable: the next request's 401 decides */ },
    });
  }

  private tick(): void {
    if (this.signedOut || !this.auth.isLoggedIn()) return;
    const last = readNumber(LAST_ACTIVITY_KEY) || Date.now();
    const left = last + this.idleMinutes() * 60_000 - Date.now();
    this.remaining.set(left);
    if (left <= 0) {
      this.signedOut = true;
      this.auth.logout(IDLE_REASON);
    }
  }
}
