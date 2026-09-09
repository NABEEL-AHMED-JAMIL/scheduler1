import { Component, input } from '@angular/core';

/**
 * The "ETL Console" mark shown in every page header -- five screens had this hand-copied
 * (shell, landing, docs, the tenant-request workspace, login), one of them with its own
 * arbitrary `text-[15px]` instead of the standard type scale. This is now the one place
 * that pixel value lived; it renders at `text-sm` like everywhere else.
 */
@Component({
  selector: 'app-brand-mark',
  host: { class: 'flex items-center gap-2 shrink-0' },
  template: `
    @if (subtitle()) {
      <div class="size-9 rounded-lg bg-brand-500 grid place-items-center text-white font-bold">E</div>
      <div>
        <div class="font-semibold leading-tight">ETL Console</div>
        <div class="text-xs text-[color:var(--text-muted)]">{{ subtitle() }}</div>
      </div>
    } @else {
      <div class="size-7 rounded-md bg-brand-500 grid place-items-center text-white text-sm font-bold">E</div>
      <span class="font-semibold text-sm tracking-tight"
            [class.hidden]="hideOnMobile()" [class.sm:block]="hideOnMobile()">ETL Console</span>
    }
  `,
})
export class BrandMark {
  /** Login's variant: a bigger mark plus a two-line block with a subtitle underneath. */
  readonly subtitle = input('');
  /** The shell header hides the wordmark below the sm breakpoint to save space; nobody else does. */
  readonly hideOnMobile = input(false);
}
