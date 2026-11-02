import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Icon } from '../../../shared/ui/icon';
import { FormatFamily } from './converter.model';

/** The families whose input or output formats, or label, hold the search: ".vsdx" and "vsdx" both find Visio. */
export function matchFamilies(families: FormatFamily[], query: string): FormatFamily[] {
  const q = query.trim().toLowerCase().replace(/^\./, '');
  if (!q) return families;
  return families.filter(f => f.label.toLowerCase().includes(q)
    || f.inputFormats.some(x => x.includes(q)) || f.outputFormats.some(x => x.includes(q)));
}

/**
 * Supported formats (tools redesign): a side sheet with a search, rather than a tall grid that pushed the drop zone below
 * the fold at 1024. Each family: what it converts from, and to.
 */
@Component({
  selector: 'app-formats-sheet',
  imports: [SidePanel, Icon],
  styles: `
    .family { display: grid; gap: 0.375rem; padding: 0.75rem 0; border-bottom: 1px solid var(--border-subtle); }
    .family:last-child { border-bottom: 0; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem; font-size: 0.75rem; }
    .row > span:first-child { width: 2.5rem; color: var(--text-muted); }
  `,
  template: `
    <app-side-panel heading="Supported formats" [subtitle]="data.families.length + ' families · what each converts from and to'">
      <div class="search-field mb-2">
        <app-icon name="search" size="0.95em" />
        <input class="input" placeholder="Search a format, for example .vsdx" [value]="query()" aria-label="Search formats"
               (input)="query.set($any($event.target).value)" data-test="formats-search" />
      </div>
      @for (family of shown(); track family.key) {
        <div class="family" [attr.data-family]="family.key">
          <div class="text-sm font-medium">{{ family.label }}</div>
          <div class="row"><span>From</span>
            @for (f of family.inputFormats; track f) { <span class="pill pill-neutral mono">{{ f }}</span> }
          </div>
          <div class="row"><span>To</span>
            @for (f of family.outputFormats; track f) { <span class="pill pill-brand mono">{{ f }}</span> }
          </div>
        </div>
      } @empty {
        <p class="text-sm text-[color:var(--text-muted)] py-3">No family reads or writes "{{ query() }}".</p>
      }
      <ng-container foot>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class FormatsSheet {
  readonly ref = inject(DialogRef);
  readonly data = inject<{ families: FormatFamily[] }>(DIALOG_DATA);
  readonly query = signal('');
  readonly shown = computed(() => matchFamilies(this.data.families, this.query()));
}
