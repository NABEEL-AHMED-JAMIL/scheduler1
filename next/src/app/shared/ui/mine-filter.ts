import { Component, computed, inject, model } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from './icon';

/**
 * "Only mine" -- narrows a list to what the signed-in person created.
 *
 * Aimed at the platform admin, who sees every tenant's work at once and otherwise has no quick
 * way to pick their own out of it. Everyone else benefits too, so it is not gated by role.
 *
 * Matched on the author's id rather than their display name: two people can share a name, and a
 * filter that matched on text would quietly show somebody else's work as yours.
 *
 * Deliberately not persisted. A filter that silently survives a reload is how someone concludes
 * their data has gone missing.
 */
@Component({
  selector: 'app-mine-filter',
  imports: [Icon],
  template: `
    <button type="button" class="btn btn-sm" [class.btn-primary]="only()"
            [class.btn-default]="!only()"
            [attr.aria-pressed]="only()"
            [title]="only()
              ? 'Showing only what you created — click to show everything'
              : 'Show only what you created'"
            (click)="only.set(!only())">
      <app-icon [name]="only() ? 'check' : 'user'" />
      Only mine
      @if (only() && hidden() > 0) {
        <span class="text-[11px] opacity-75">({{ hidden() }} hidden)</span>
      }
    </button>
  `,
})
export class MineFilter {
  private readonly auth = inject(AuthService);

  readonly only = model(false);
  /** How many rows the filter is holding back, so the count is never a mystery. */
  readonly hidden = model(0);

  readonly myId = computed(() => this.auth.user()?.appUserId ?? null);
}

/** Shared by the screens that offer the filter, so the rule is written once. */
export function isMine(row: { createdBy?: number | null }, myId: number | null): boolean {
  return myId != null && row.createdBy === myId;
}
