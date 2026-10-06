import { Component, TemplateRef, computed, input, output, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { CATEGORIES, KINDS, KindInfo, kindInfo } from '../widget-kinds';
import { KIND_ICONS } from './kind-icons';

/** The context the preview template is handed: the kind being shown. */
export interface KindPreviewContext { $implicit: string; }

/**
 * Every chart kind, by category, with a glyph, a search box, and why a kind does not fit.
 *
 * The same picker in three places -- the add-widget form, a tile's "Choose a chart" panel and
 * the Studio's Charts tab -- so a kind is found the same way wherever a person is. A kind that
 * cannot draw the result stays in the list, marked and inert, with the reason on it: what does
 * not fit is a fact about the reader's own data, and seeing it teaches what would.
 *
 * The preview is the host's: it passes a template, the picker renders it for the kind hovered
 * (or focused) and otherwise for the one chosen. The Studio passes none and redraws its own chart
 * from `hovered` instead.
 *
 * Buttons are aria-disabled rather than disabled, so an unavailable kind can still be hovered and
 * focused to read its reason -- a disabled button receives neither.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-kind-picker',
  imports: [NgTemplateOutlet],
  template: `
    <div class="flex flex-col gap-3 min-w-0">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0">
        <input type="search" class="input input-sm w-full max-w-xs" placeholder="Search chart types" aria-label="Search chart types"
               [value]="query()" (input)="query.set($any($event.target).value)" />
        @if (issues()) {
          <label class="flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)]">
            <input type="checkbox" [checked]="onlyFitting()" (change)="onlyFitting.set($any($event.target).checked)" />
            Only what fits ({{ fitting() }} of {{ total }})
          </label>
        }
      </div>
      <div class="kind-picker-body" [class.has-preview]="!!preview()">
        <div class="kind-picker-list min-w-0">
          @for (group of groups(); track group.category) {
            <section class="mb-3" [attr.aria-label]="group.category">
              <h4 class="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)] mb-1.5">{{ group.category }}</h4>
              <div class="kind-grid">
                @for (kind of group.kinds; track kind.id) {
                  @let why = reason(kind.id);
                  <button type="button" class="kind-option" [attr.data-kind]="kind.id"
                          [class.is-on]="kind.id === selected()" [class.is-off]="!!why"
                          [attr.aria-pressed]="kind.id === selected()" [attr.aria-disabled]="why ? true : null"
                          [title]="why || kind.needs"
                          (mouseenter)="hovered.set(kind.id); hover.emit(kind.id)" (focus)="hovered.set(kind.id); hover.emit(kind.id)"
                          (mouseleave)="hovered.set(null); hover.emit(null)" (click)="choose(kind)">
                    <svg viewBox="0 0 24 24" class="kind-glyph" aria-hidden="true"><path [attr.d]="icon(kind.id)" /></svg>
                    <span class="min-w-0">
                      <span class="block text-xs font-medium leading-tight">{{ kind.label }}</span>
                      @if (why) { <span class="block text-[11px] leading-snug text-[color:var(--text-muted)] kind-why">{{ why }}</span> }
                    </span>
                  </button>
                }
              </div>
            </section>
          } @empty {
            <p class="text-sm text-[color:var(--text-muted)]">No chart type matches "{{ query() }}".</p>
          }
        </div>
        @if (preview(); as template) {
          @let shown = shownKind();
          <aside class="kind-preview min-w-0" aria-live="polite">
            @if (info(shown); as kind) {
              <p class="text-sm font-semibold">{{ kind.label }}</p>
              <p class="text-[11px] text-[color:var(--text-muted)] mb-2">Needs {{ kind.needs.charAt(0).toLowerCase() + kind.needs.slice(1) }}.</p>
              @if (reason(shown); as why) {
                <p class="text-xs text-[color:var(--warn-text)]">Doesn't fit because {{ why.charAt(0).toLowerCase() + why.slice(1) }}</p>
              } @else {
                <ng-container [ngTemplateOutlet]="template" [ngTemplateOutletContext]="{ $implicit: shown }" />
              }
            }
          </aside>
        }
      </div>
    </div>
  `,
  styles: [`
    .kind-picker-body { display: grid; gap: 1rem; min-width: 0; }
    .kind-picker-body.has-preview { grid-template-columns: minmax(0, 1fr); }
    @media (min-width: 1100px) { .kind-picker-body.has-preview { grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr); } }
    .kind-picker-list { max-height: 28rem; overflow-y: auto; padding-right: 0.25rem; }
    .kind-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); gap: 0.375rem; }
    .kind-option { display: flex; align-items: flex-start; gap: 0.5rem; padding: 0.375rem 0.5rem; text-align: left;
      border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-raised);
      color: var(--text-primary); transition: background-color 120ms, border-color 120ms; }
    .kind-option:hover, .kind-option:focus-visible { background: var(--surface-sunken); }
    .kind-option:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .kind-option.is-on { border-color: var(--accent-text); background: var(--accent-soft); }
    .kind-option.is-off { color: var(--text-muted); cursor: not-allowed; }
    .kind-option.is-off .kind-glyph { opacity: 0.5; }
    .kind-glyph { width: 1.5rem; height: 1.5rem; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6;
      stroke-linecap: round; stroke-linejoin: round; }
    .kind-why { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .kind-preview { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 0.75rem;
      background: var(--surface-inset); align-self: start; position: sticky; top: 0; }
  `],
})
export class KindPicker {
  /** Why each kind cannot draw the result, or null when there is no result yet (nothing is refused). */
  readonly issues = input<Partial<Record<string, string>> | null>(null);
  readonly selected = input<string | null>(null);
  /** The kinds offered; every kind by default. */
  readonly kinds = input<KindInfo[]>(KINDS);
  readonly preview = input<TemplateRef<KindPreviewContext> | null>(null);

  readonly chosen = output<string>();
  readonly hover = output<string | null>();

  readonly query = signal('');
  readonly onlyFitting = signal(false);
  readonly hovered = signal<string | null>(null);
  readonly total = KINDS.length;

  reason(id: string): string {
    return this.issues()?.[id] ?? '';
  }

  icon(id: string): string {
    return KIND_ICONS[id as keyof typeof KIND_ICONS] ?? '';
  }

  info(id: string | null): KindInfo | undefined {
    return kindInfo(id);
  }

  readonly fitting = computed(() => this.kinds().filter(kind => !this.reason(kind.id)).length);

  /** The kinds by category, narrowed by the search (label, category or what it needs) and the toggle. */
  readonly groups = computed(() => {
    const needle = this.query().trim().toLowerCase();
    const only = this.onlyFitting() && !!this.issues();
    const kinds = this.kinds().filter(kind =>
      (!needle || `${kind.label} ${kind.category} ${kind.needs} ${kind.id}`.toLowerCase().includes(needle))
      && (!only || !this.reason(kind.id)));
    return CATEGORIES
      .map(category => ({ category, kinds: kinds.filter(kind => kind.category === category) }))
      .filter(group => group.kinds.length);
  });

  /** The kind the preview shows: the one under the pointer, else the one chosen. */
  readonly shownKind = computed(() => this.hovered() ?? this.selected() ?? 'table');

  choose(kind: KindInfo): void {
    if (this.reason(kind.id)) return;
    this.chosen.emit(kind.id);
  }
}
