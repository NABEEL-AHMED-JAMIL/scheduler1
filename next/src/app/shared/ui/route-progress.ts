import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router,
} from '@angular/router';

/**
 * Drives the top-of-page progress bar (styled as `.route-progress`) from the router's
 * navigation lifecycle: it starts on NavigationStart and finishes on the terminal event,
 * whether that is success, cancel or error -- a cancel or error must still clear the bar,
 * or a failed navigation would leave it stuck part-way.
 *
 * The width "trickles" toward 90% while the route resolves rather than sitting still, so a
 * slow load looks like progress instead of a hang, then snaps to 100% and fades once the
 * page lands. A minimum on-screen time keeps an instant client-side navigation from
 * flashing the bar for a single frame -- it gets a quick, deliberate sweep instead.
 */
@Component({
  selector: 'app-route-progress',
  template: `
    <div class="route-progress" [class.is-active]="active()" [style.width.%]="width()"
         role="progressbar" aria-hidden="true"></div>
  `,
})
export class RouteProgress {
  private readonly router = inject(Router);

  readonly active = signal(false);
  readonly width = signal(0);

  /** Shortest time the bar stays up, so a sub-frame navigation still reads as a sweep. */
  private static readonly MIN_VISIBLE_MS = 400;

  private startedAt = 0;
  private trickleId?: ReturnType<typeof setInterval>;
  private finishId?: ReturnType<typeof setTimeout>;
  private hideId?: ReturnType<typeof setTimeout>;

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationStart) {
        this.start();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.finish();
      }
    });
  }

  private start(): void {
    this.clearTimers();
    this.startedAt = Date.now();
    this.active.set(true);
    this.width.set(12);
    // Asymptotic trickle: quick at first, easing off as it nears 90% so it never claims to be
    // done before the route actually is.
    this.trickleId = setInterval(() => {
      const w = this.width();
      if (w < 90) this.width.set(w + Math.max(0.4, (90 - w) * 0.06));
    }, 180);
  }

  private finish(): void {
    if (this.trickleId) clearInterval(this.trickleId);
    const elapsed = Date.now() - this.startedAt;
    const wait = Math.max(0, RouteProgress.MIN_VISIBLE_MS - elapsed);
    this.finishId = setTimeout(() => this.complete(), wait);
  }

  private complete(): void {
    this.width.set(100);
    // Let the fill reach 100% and the bar fade before resetting, so it doesn't jump back to 0
    // while still visible.
    this.hideId = setTimeout(() => {
      this.active.set(false);
      this.width.set(0);
    }, 280);
  }

  private clearTimers(): void {
    if (this.trickleId) clearInterval(this.trickleId);
    if (this.finishId) clearTimeout(this.finishId);
    if (this.hideId) clearTimeout(this.hideId);
  }
}
