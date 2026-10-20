import { Component, input } from '@angular/core';

/**
 * The "ETL Console" mark shown in every page header -- five screens had this hand-copied
 * (shell, landing, docs, the tenant-request workspace, login), one of them with its own
 * arbitrary `text-[15px]` instead of the standard type scale. This is now the one place
 * that pixel value lived; it renders at `text-sm` like everywhere else. Owner 2026-10-20: the mark's letter is H, not E
 * (public/favicon.svg draws the same H).
 */
@Component({
  selector: 'app-brand-mark',
  host: { class: 'flex items-center gap-2 shrink-0' },
  template: `
    @if (subtitle()) {
      <div class="size-9 rounded-lg grid place-items-center font-bold bg-[var(--btn-primary-bg)] text-[color:var(--btn-primary-fg)]">H</div>
      <div>
        <div class="font-semibold leading-tight">ETL Console</div>
        <div class="text-xs text-[color:var(--text-muted)]">{{ subtitle() }}</div>
      </div>
    } @else {
      <div class="brand-e size-7 rounded-md grid place-items-center text-sm font-bold bg-[var(--btn-primary-bg)] text-[color:var(--btn-primary-fg)]">H</div>
      <span class="brand-word font-semibold text-sm tracking-tight whitespace-nowrap"
            [class.hidden]="hideOnMobile()" [class.sm:block]="hideOnMobile()"
            [class]="hideBesideNav() ? 'nav:hidden wide:block' : ''">ETL Console</span>
    }
  `,
})
export class BrandMark {
  /** Login's variant: a bigger mark plus a two-line block with a subtitle underneath. */
  readonly subtitle = input('');
  /** The shell header hides the wordmark below the sm breakpoint to save space; nobody else does. */
  readonly hideOnMobile = input(false);
  /**
   * The shell header also hides it from 1180px to 1440px, where the menu's groups are on the bar; from 1440px the menu
   * is the sidebar (UX review 2026-10-12) and the wordmark has the bar's room again. The "H" mark stays.
   */
  readonly hideBesideNav = input(false);
}
