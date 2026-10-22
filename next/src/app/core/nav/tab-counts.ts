import { Injectable, signal } from '@angular/core';

/**
 * A number beside a hub tab's name ("Templates 12", Report Studio's approved drawings): the page that knows it sets it by
 * the tab's path, and the tab strip (tab-hub.ts) shows it. A tab nobody has counted shows its name alone.
 */
@Injectable({ providedIn: 'root' })
export class TabCounts {
  readonly counts = signal<Readonly<Record<string, number>>>({});

  set(values: Record<string, number | null | undefined>): void {
    const next: Record<string, number> = { ...this.counts() };
    for (const [path, n] of Object.entries(values)) {
      if (typeof n === 'number' && Number.isFinite(n)) next[path] = n; else delete next[path];
    }
    this.counts.set(next);
  }

  of(path: string): number | null {
    return this.counts()[path] ?? null;
  }
}
