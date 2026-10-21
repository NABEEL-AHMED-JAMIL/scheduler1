import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Icon } from '../../shared/ui/icon';
import { ToastService } from '../../shared/ui/toast.service';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ReportStudioApi, studioError } from './report-studio.api';
import { PageLimit } from './report-studio.model';

/** Who can raise a workspace's limit, in words. */
export function raiseWords(p: Pick<PageLimit, 'raisedBy' | 'ceiling' | 'hardMax'>): string {
  if (p.raisedBy === 'WORKSPACE_ADMIN') return `Your administrator can raise it up to ${p.ceiling.toLocaleString('en-US')} pages.`;
  if (p.raisedBy === 'PLATFORM_ADMIN') return 'Only the platform administrator can raise it further.';
  return `${p.hardMax.toLocaleString('en-US')} pages is the most the platform allows.`;
}

/** A whole number of pages from 1 to max, or null when the box does not hold one. */
export function pagesIn(value: unknown, max: number): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

/**
 * Report Studio › Settings, "Most pages in one report" (owner 2026-10-21): the workspace's own limit, which its
 * administrators set from 1 up to the workspace's ceiling (unset: the ceiling, the platform's 300 by default); everyone
 * else of the workspace reads it. A platform administrator picks a workspace and sets its ceiling instead -- above the
 * platform's or below it, up to the hard maximum -- and is told what a higher one costs media. Every page counts, a long
 * table's too, in Generate, a preview and a pipeline's Generate report step.
 */
@Component({
  selector: 'app-page-limit-card',
  imports: [FormsModule, Icon, WorkspaceSelect],
  styles: `
    .plc-row { display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: flex-end; padding: 0.75rem 0; border-top: 1px solid var(--border-subtle); }
    .plc-row:first-of-type { border-top: 0; }
    .plc-why { font-size: 0.8125rem; color: var(--text-muted); flex-basis: 100%; }
    .plc-now { font-variant-numeric: tabular-nums; }
  `,
  template: `
    <section class="card p-4 mt-4" aria-labelledby="plc-title" data-test="settings-page-limit">
      <div class="flex flex-wrap items-start gap-3 mb-1">
        <div class="min-w-0 flex-1">
          <h2 class="section-title" id="plc-title">Report size</h2>
          <p class="text-sm text-[color:var(--text-muted)]">Every page counts, a long table's too. A report over the limit is not made: whoever
            generated it, or the pipeline's run, is told this limit, who can raise it and what to do instead. Previews follow it as well.</p>
        </div>
        @if (platformAdmin()) {
          <!-- Its own box: the selector puts itself first among its siblings (order: -2), as in a page header. -->
          <div class="flex items-center gap-2 min-w-0"><app-workspace-select [(value)]="tenantId" (valueChange)="load()" /></div>
        }
      </div>

      @if (platformAdmin() && !tenantId()) {
        <p class="text-sm text-[color:var(--text-muted)]" data-test="page-limit-pick">Pick a workspace to see its page limit and set its ceiling.</p>
      } @else if (error()) {
        <p class="text-sm text-crit-500" role="alert">{{ error() }}</p>
      } @else if (limit(); as p) {
        <div class="plc-row">
          <label class="flex flex-col gap-1"><span class="label">Most pages in one report</span>
            <input class="input w-32" type="number" min="1" [max]="p.ceiling" step="1" [ngModel]="pages()" (ngModelChange)="pages.set($event)"
                   [disabled]="!p.editable || saving()" data-test="max-pages" aria-describedby="plc-now" /></label>
          @if (p.editable) {
            <button type="button" class="btn btn-primary btn-sm" [disabled]="!pagesValid() || !pagesDirty() || saving()" (click)="save(pagesValid())"
                    data-test="max-pages-save"><app-icon name="check" />Save</button>
            @if (p.workspaceLimit !== null) {
              <button type="button" class="btn btn-default btn-sm" [disabled]="saving()" (click)="save(null)" data-test="max-pages-default">
                Use the default ({{ p.ceiling.toLocaleString('en-US') }})</button>
            }
          }
          <p class="plc-why" id="plc-now" data-test="page-limit-now">
            <span class="plc-now">Now {{ p.limit.toLocaleString('en-US') }} pages{{ p.workspaceLimit === null ? ', the default' : '' }}</span>,
            at most {{ p.ceiling.toLocaleString('en-US') }} for this workspace. {{ raise() }}
            @if (pageError()) { <span class="text-crit-500" role="alert"> {{ pageError() }}</span> }
          </p>
        </div>

        @if (p.ceilingEditable) {
          <div class="plc-row" data-test="page-ceiling">
            <label class="flex flex-col gap-1"><span class="label">This workspace's ceiling</span>
              <input class="input w-32" type="number" min="1" [max]="p.hardMax" step="1" [ngModel]="ceiling()" (ngModelChange)="ceiling.set($event)"
                     [disabled]="saving()" data-test="page-ceiling-input" aria-describedby="plc-ceiling-why" /></label>
            <button type="button" class="btn btn-primary btn-sm" [disabled]="!ceilingValid() || !ceilingDirty() || saving()" (click)="saveCeiling(ceilingValid())"
                    data-test="page-ceiling-save"><app-icon name="check" />Save ceiling</button>
            @if (p.ceilingOverride !== null) {
              <button type="button" class="btn btn-default btn-sm" [disabled]="saving()" (click)="saveCeiling(null)" data-test="page-ceiling-default">
                Use the platform's ({{ p.platformCeiling.toLocaleString('en-US') }})</button>
            }
            <p class="plc-why" id="plc-ceiling-why">The most its administrators may set: the platform's {{ p.platformCeiling.toLocaleString('en-US') }} pages unless
              you set another, up to {{ p.hardMax.toLocaleString('en-US') }} (MEDIA_RENDER_MAX_PDF_PAGES_HARD). Above {{ p.platformCeiling.toLocaleString('en-US') }},
              a report's laid-out pages hold more of media's memory while they are drawn; a higher ceiling suits reports that are mostly long tables.</p>
          </div>
        }
      } @else {
        <div class="flex justify-center py-4"><span class="spinner" role="status" aria-label="Loading"></span></div>
      }
    </section>
  `,
})
export class PageLimitCard implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly workspaces = inject(WorkspaceDirectory);

  readonly platformAdmin = computed(() => this.auth.isPlatformAdmin() && !this.auth.isManagedSession?.());
  readonly tenantId = signal<number | null>(null);
  readonly limit = signal<PageLimit | null>(null);
  readonly error = signal('');
  readonly pageError = signal('');
  readonly saving = signal(false);
  readonly pages = signal<number | string | null>(null);
  readonly ceiling = signal<number | string | null>(null);

  readonly raise = computed(() => { const p = this.limit(); return p ? raiseWords(p) : ''; });
  readonly pagesValid = computed(() => { const p = this.limit(); return p ? pagesIn(this.pages(), p.ceiling) : null; });
  readonly pagesDirty = computed(() => { const p = this.limit(); return !!p && this.pagesValid() !== p.limit; });
  readonly ceilingValid = computed(() => { const p = this.limit(); return p ? pagesIn(this.ceiling(), p.hardMax) : null; });
  readonly ceilingDirty = computed(() => { const p = this.limit(); return !!p && this.ceilingValid() !== p.ceiling; });

  ngOnInit(): void {
    if (this.platformAdmin()) this.tenantId.set(this.workspaces.remembered());
    this.load();
  }

  load(): void {
    this.error.set('');
    this.pageError.set('');
    if (this.platformAdmin() && !this.tenantId()) { this.limit.set(null); return; }
    this.api.pageLimit(this.platformAdmin() ? this.tenantId() : null).subscribe({
      next: p => this.apply(p),
      error: e => this.error.set(studioError(e, 'The page limit could not be read.').message),
    });
  }

  private apply(p: PageLimit): void {
    this.limit.set(p);
    this.pages.set(p.limit);
    this.ceiling.set(p.ceiling);
  }

  /** The workspace's own number, or back to the ceiling (null). */
  save(value: number | null): void {
    const p = this.limit();
    if (!p) return;
    this.saving.set(true);
    this.pageError.set('');
    this.api.savePageLimit(value, p.rowVersion).subscribe({
      next: saved => {
        this.saving.set(false);
        this.apply(saved);
        this.toast.success(`Reports of this workspace are at most ${saved.limit.toLocaleString('en-US')} pages now.`);
      },
      error: e => { this.saving.set(false); this.pageError.set(studioError(e).message); },
    });
  }

  /** A platform administrator's ceiling for the picked workspace, or back to the platform's (null). */
  saveCeiling(value: number | null): void {
    const p = this.limit();
    const tenant = this.tenantId();
    if (!p || !tenant) return;
    this.saving.set(true);
    this.pageError.set('');
    this.api.savePageCeiling(tenant, value, p.rowVersion).subscribe({
      next: saved => {
        this.saving.set(false);
        this.apply(saved);
        this.toast.success(`${this.workspaces.nameOf(tenant)}: reports may have up to ${saved.ceiling.toLocaleString('en-US')} pages now.`);
      },
      error: e => { this.saving.set(false); this.pageError.set(studioError(e).message); },
    });
  }
}
