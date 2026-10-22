import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { Problem } from './report-studio.model';

/**
 * What validation found (spec section 22), blocking errors first: each with its code, the component or path it is about,
 * and the sentence -- never a value from the data. Errors stop a report from being made; warnings do not.
 */
@Component({
  selector: 'app-report-problems',
  imports: [Icon],
  template: `
    @if (summary()) {
    <div class="flex flex-wrap items-center gap-1.5 text-xs">
      <span class="pill" [class.pill-crit]="errors().length" [class.pill-neutral]="!errors().length">
        {{ errors().length }} blocking
      </span>
      <span class="pill" [class.pill-warn]="warnings().length" [class.pill-neutral]="!warnings().length">
        {{ warnings().length }} warning{{ warnings().length === 1 ? '' : 's' }}
      </span>
      @if (!problems().length) { <span class="text-[color:var(--ok-text)] inline-flex items-center gap-1"><app-icon name="checkCircle" />Every check passed</span> }
    </div>
    }
    @if (problems().length) {
      <ul class="rs-problems">
        @for (p of ordered(); track $index) {
          <li [class.rs-problem-error]="p.severity === 'ERROR'" [class.rs-problem-warn]="p.severity !== 'ERROR'" [title]="p.code">
            <app-icon name="alert" [class]="p.severity === 'ERROR' ? 'icon-crit' : 'icon-warn'" />
            <div class="min-w-0">
              <div class="rs-problem-title">{{ titleOf(p) }}</div>
              <div class="text-sm">{{ p.message }}</div>
              @if (p.componentId) { <div class="text-xs text-[color:var(--text-muted)] mono">{{ p.componentId }}</div> }
              @if (fixText() && p.severity === 'ERROR' && $first) {
                <button type="button" class="link-inline text-sm mt-1" (click)="fix.emit(p)">{{ fixText() }}</button>
              }
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .rs-problems { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
    .rs-problems li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.5rem; padding: 0.5rem 0.625rem;
                      border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
    /* Drawing 5: a blocking problem is a red box with its title in red, a warning an amber one. */
    .rs-problems li.rs-problem-error { border-color: color-mix(in oklab, var(--crit-text) 55%, var(--border-subtle));
      background: color-mix(in oklab, var(--crit-text) 8%, var(--surface-raised)); }
    .rs-problems li.rs-problem-warn { border-color: color-mix(in oklab, var(--warn-text) 55%, var(--border-subtle));
      background: color-mix(in oklab, var(--warn-text) 9%, var(--surface-raised)); }
    .rs-problem-title { font-size: 0.875rem; font-weight: 600; overflow-wrap: anywhere; }
    .rs-problem-error .rs-problem-title { color: var(--crit-text); }
    .rs-problem-warn .rs-problem-title { color: var(--warn-text); }
  `,
})
export class ProblemList {
  readonly problems = input<Problem[]>([]);
  /** The counts above the list; off where the page shows its own (Create report's checks). */
  readonly summary = input(true);
  readonly errors = computed(() => this.problems().filter(p => p.severity === 'ERROR'));
  readonly warnings = computed(() => this.problems().filter(p => p.severity !== 'ERROR'));
  readonly ordered = computed(() => [...this.errors(), ...this.warnings()]);
  /** A way out shown inside the first blocking problem ("Fix the data mapping →"); none when empty. */
  readonly fixText = input('');
  readonly fix = output<Problem>();

  titleOf(p: Problem): string {
    return problemTitle(p);
  }
}

const TITLES: Record<string, string> = {
  REQUIRED_FIELD_MISSING: 'Required field missing', BINDING_NOT_RESOLVED: 'A field is not in the data', DATA_SCHEMA_MISMATCH: 'The data has another shape',
  VALUE_FORMAT_MISMATCH: 'A value is not the type the template expects', EMPTY_TABLE: 'A table has no rows', LONG_TABLE_APPENDED: 'A long table goes on extra pages',
  SORT_SKIPPED: 'A table could not be sorted', LOW_CONTRAST: 'Text may be hard to read', FONT_SUBSTITUTED: 'A font was replaced',
  BRANDING_FALLBACK: 'The brand profile could not be used', ASSET_RETIRED: 'A picture is retired', ASSET_NOT_APPROVED: 'A picture is not approved',
  ASSET_NOT_FOUND: 'A picture is missing', IMAGE_UNREADABLE: 'A picture could not be read', UNSUPPORTED_COMPONENT: 'A block is not supported yet',
  CONTENT_IGNORED: 'Some content is left out', CHART_FIELD_TYPE_INVALID: 'A chart field has the wrong type', EXPRESSION_INVALID: 'A formula is not valid',
  TEMPLATE_INVALID: 'The template has a problem', SNAPSHOT_TOO_LARGE: 'The data is too large', LIMIT_EXCEEDED: 'Over a limit',
};

/** A problem's title, as the drawing heads each box ("Required field missing: quality.readmission_target"). */
export function problemTitle(p: Problem): string {
  const base = TITLES[p.code] ?? (p.code ? p.code.charAt(0) + p.code.slice(1).toLowerCase().replace(/_/g, ' ') : (p.severity === 'ERROR' ? 'Problem' : 'Warning'));
  return p.path ? `${base}: ${p.path}` : base;
}
