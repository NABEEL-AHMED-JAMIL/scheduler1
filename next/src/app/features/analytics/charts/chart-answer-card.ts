import { Component, computed, inject, input, linkedSignal, output } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Icon } from '../../../shared/ui/icon';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import type { PinnedChart, WidgetVisualization } from '../analytics.service';
import { WidgetChart } from '../widget-chart';
import { kindInfo } from '../widget-kinds';
import { ChartAnswer, answerSettings, answerView, fitKind } from './chart-answer';
import type { ChartSettings } from './chart-settings';
import { ChartSettingsData, ChartSettingsPanel } from './chart-settings-panel';
import { KIND_ICONS } from './kind-icons';
import { kindMenu } from './kind-menu';
import { KindPickerData, KindPickerPanel } from './kind-picker-panel';
import { PinChartData, PinChartPanel } from './pin-chart-panel';

/**
 * MIG-357: one chart answer drawn -- Ask your data's answers, the AI Assistant's Chart tab, Visualise -- with the
 * dashboards' chart engine (app-widget-chart) over the rows the query returned, and the three things a tile offers:
 * Change chart (the Show-as suggestions, then every kind), Chart settings, and Pin to dashboard.
 *
 * The kind the answer asked for is drawn only when the fit rules say it can draw these rows; otherwise the best that can
 * is, and the reason is said under the title (fitKind). A kind the person picks is theirs, and is never second-guessed.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-chart-answer',
  imports: [WidgetChart, Icon, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  template: `
    <section class="card p-4 flex flex-col gap-3 min-w-0" data-test="chart-answer" [attr.data-kind]="kind()" aria-label="Chart">
      <div class="flex flex-wrap items-start justify-between gap-2">
        <div class="min-w-64 flex-1">
          <p class="font-semibold text-sm break-words" data-test="chart-title">{{ title() }}</p>
          @if (showCaption() && caption()) { <p class="text-xs text-[color:var(--text-secondary)] break-words mt-0.5" data-test="chart-caption">{{ caption() }}</p> }
        </div>
        <div class="flex flex-wrap items-center gap-1.5" role="toolbar" aria-label="Chart actions">
          <button type="button" class="btn btn-default btn-sm" data-test="change-chart" [cdkMenuTriggerFor]="kinds">
            <svg viewBox="0 0 24 24" class="answer-glyph" aria-hidden="true"><path [attr.d]="icon(kind())" /></svg>Change chart
          </button>
          <ng-template #kinds>
            <div cdkMenu class="card shadow-xl text-sm py-1 min-w-56" data-test="change-chart-menu">
              <p class="px-2 pt-1 pb-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">Suggested for this data</p>
              @for (tile of suggested(); track tile.kind.id) {
                <button cdkMenuItem class="menu-item w-full" [attr.data-kind]="tile.kind.id" [class.is-on]="tile.current" (cdkMenuItemTriggered)="choose(tile.kind.id)">
                  <svg viewBox="0 0 24 24" class="answer-glyph" aria-hidden="true"><path [attr.d]="icon(tile.kind.id)" /></svg>
                  <span class="flex-1 text-left">{{ tile.kind.label }}</span>
                  @if (tile.current) { <app-icon name="check" size="0.8em" /> }
                </button>
              }
              <div class="my-1 border-t border-subtle"></div>
              <button cdkMenuItem class="menu-item w-full" data-test="all-charts" (cdkMenuItemTriggered)="openPicker()"><app-icon name="chart" />All charts, with a preview…</button>
            </div>
          </ng-template>
          <button type="button" class="btn btn-default btn-sm" data-test="chart-settings" (click)="openSettings()"><app-icon name="settings" />Chart settings</button>
          @if (pinnable()) {
            <button type="button" class="btn btn-default btn-sm" data-test="pin-chart" [disabled]="!canPin()"
                    [title]="canPin() ? 'Keep this chart as a tile on a dashboard' : pinBlocked()" (click)="openPin()"><app-icon name="plus" />Pin to dashboard</button>
          }
        </div>
      </div>
      @if (fallback(); as why) {
        <p class="text-xs rounded-lg px-2.5 py-1.5 bg-accent-soft flex items-start gap-1.5" data-test="chart-fallback">
          <app-icon name="info" size="0.9em" class="mt-0.5 shrink-0" />{{ why }}
        </p>
      }
      <div class="min-w-0" data-test="chart-drawing">
        <app-widget-chart [view]="view()" [kind]="kind()" [settings]="settings()" [height]="height()" [interactive]="true" layout="row" [name]="title()" />
      </div>
      <p class="text-[11px] text-[color:var(--text-muted)]" data-test="chart-rows">
        {{ rowsNote() }}
      </p>
    </section>
  `,
  styles: `
    .answer-glyph { width: 1rem; height: 1rem; flex: none; fill: none; stroke: currentColor; stroke-width: 1.6;
      stroke-linecap: round; stroke-linejoin: round; }
  `,
})
export class ChartAnswerCard {
  private readonly dialog = inject(Dialog);

  readonly answer = input.required<ChartAnswer>();
  /** Whether Pin to dashboard is offered at all (a table in hand has no query to pin). */
  readonly pinnable = input(true);
  /** Whether this person may pin; when not, the button stays, disabled, with pinBlocked as its reason. */
  readonly canPin = input(true);
  readonly pinBlocked = input('Your access does not let you change dashboards.');
  readonly height = input(320);
  /** Off where the caption is already the answer's sentence above the card (Ask your data). */
  readonly showCaption = input(true);
  readonly pinnedTo = output<PinnedChart>();

  readonly view = computed(() => answerView(this.answer()));
  /** The fit rules' verdict on the kind the answer asked for. */
  readonly fitted = computed(() => fitKind(this.view(), this.answer().chart?.kind || null));
  /** The kind drawn: the person's choice once they made one, else the fitted one. Reset when the answer changes. */
  readonly kind = linkedSignal<string>(() => this.fitted().kind);
  readonly settings = linkedSignal<ChartSettings>(() => answerSettings(this.answer().chart));

  readonly title = computed(() => this.settings().title?.text || this.answer().chart?.title || this.answer().dataset.name);
  readonly caption = computed(() => this.answer().chart?.caption || '');
  /** The fallback's reason, while the fitted kind is still the one drawn. */
  readonly fallback = computed(() => {
    const f = this.fitted();
    return f.fellBack && f.asked && this.kind() === f.kind ? f.reason : '';
  });
  readonly suggested = computed(() => kindMenu(this.view(), this.kind()).suggested);
  readonly rowsNote = computed(() => {
    const a = this.answer();
    const shown = a.rows.length;
    const from = a.sql ? `the query over "${a.dataset.name}"` : `"${a.dataset.name}"`;
    return `${shown.toLocaleString()} row${shown === 1 ? '' : 's'} from ${from}${a.truncated ? ', cut at the row limit' : ''}. `
      + 'Every figure is from those rows.';
  });

  icon(kind: string): string {
    return KIND_ICONS[kind as keyof typeof KIND_ICONS] ?? KIND_ICONS.table;
  }

  choose(kind: string): void {
    if (kindInfo(kind) && !this.view().issues[kind as WidgetVisualization]) this.kind.set(kind);
  }

  openPicker(): void {
    const data: KindPickerData = { title: this.title(), view: this.view(), kind: this.kind(), settings: this.settings(), boardTheme: null };
    this.dialog.open<string | undefined, KindPickerData>(KindPickerPanel, sidePanelConfig(data, 'wide'))
      .closed.subscribe(kind => { if (kind) this.choose(kind); });
  }

  openSettings(): void {
    const data: ChartSettingsData = { title: this.title(), view: this.view(), kind: this.kind(), settings: this.settings(), boardTheme: null };
    this.dialog.open<ChartSettings | undefined, ChartSettingsData>(ChartSettingsPanel, sidePanelConfig(data, 'wide'))
      .closed.subscribe(settings => { if (settings) this.settings.set(settings); });
  }

  openPin(): void {
    if (!this.canPin()) return;
    const data: PinChartData = { answer: this.answer(), kind: this.kind(), settings: this.settings(), title: this.title() };
    this.dialog.open<PinnedChart | undefined, PinChartData>(PinChartPanel, sidePanelConfig(data))
      .closed.subscribe(pinned => { if (pinned) this.pinnedTo.emit(pinned); });
  }
}
