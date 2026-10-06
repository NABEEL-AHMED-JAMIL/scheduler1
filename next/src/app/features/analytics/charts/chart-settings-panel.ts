import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { SidePanel } from '../../../shared/ui/side-panel';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ThemePicker } from '../../../shared/charts/echart/theme-picker';
import { PaletteOrder } from '../../../shared/charts/echart/palette-order';
import { ChartThemes } from '../../../shared/charts/echart/chart-themes';
import { themeLabel, toHex, toRgb } from '../../../shared/charts/echart/echart-theme';
import { ChartTokens } from '../../../shared/charts/echart/chart-tokens';
import { WidgetChart } from '../widget-chart';
import type { WidgetView } from '../dashboard';
import { kindInfo } from '../widget-kinds';
import { AxisSettings, ChartSettings, LabelColor, NumberStyle, SettingGroup, compactSettings, parseSettings, settingGroups } from './chart-settings';

export interface ChartSettingsData {
  title: string;
  view: WidgetView;
  kind: string;
  settings: ChartSettings;
  /** The board's theme, which the widget inherits unless it overrides it. */
  boardTheme: string | null;
}

type Tab = 'look' | 'data' | 'axes' | 'series' | 'behaviour';

const TAB_GROUPS: Record<Tab, SettingGroup[]> = {
  look: ['title', 'legend', 'colors'],
  data: ['labels', 'tooltip', 'sortTop', 'refLines'],
  axes: ['grid', 'axes'],
  series: ['line', 'bar', 'pie'],
  behaviour: ['zoom', 'animation', 'renderer', 'toolbox'],
};
const TAB_LABELS: Record<Tab, string> = { look: 'Look', data: 'Data', axes: 'Axes', series: 'Series', behaviour: 'Behaviour' };

export const NUMBER_STYLES: { id: NumberStyle; label: string }[] = [
  { id: 'auto', label: 'As the table (1,234.5)' },
  { id: 'compact', label: 'Compact (1.2K)' },
  { id: 'fixed0', label: 'Whole (1,235)' },
  { id: 'fixed2', label: 'Two places (1,234.50)' },
  { id: 'percent', label: 'Percent (12.5%)' },
  { id: 'plain', label: 'Plain (1234.5)' },
];

/**
 * The "Chart settings" panel: everything about how one chart is drawn, with the chart drawn
 * live above the controls as they change.
 *
 * Only the sections that change how THIS kind is drawn are offered (settingGroups): a pie has no
 * axes, a treemap no legend, and the console's own SVG kinds take a colour theme and nothing
 * else. Closing with Save hands back the settings, compacted to what differs from the defaults;
 * Reset puts every control back to its default without closing.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-chart-settings-panel',
  imports: [SidePanel, Segmented, ThemePicker, PaletteOrder, WidgetChart],
  template: `
    <app-side-panel heading="Chart settings" [subtitle]="data.title + ' · ' + kindLabel">
      <div class="flex flex-col gap-4 min-w-0">
        <div class="settings-preview" aria-label="Preview">
          <app-widget-chart [view]="data.view" [kind]="data.kind" [settings]="draft()" [boardTheme]="data.boardTheme" [height]="240" [interactive]="false" />
        </div>
        @if (tabs().length > 1) {
          <app-segmented [options]="tabs()" [value]="tab()" (valueChange)="tab.set($event)" ariaLabel="Settings section" />
        }

        <div class="flex flex-col gap-4 min-w-0">
          @if (shows('title')) {
            <section class="settings-section">
              <h3 class="settings-heading">Title</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Title</span><input class="input input-sm" [value]="draft().title?.text ?? ''" (input)="patch({ title: { ...draft().title, text: text($event) } })" /></label>
                <label class="settings-field"><span>Subtitle</span><input class="input input-sm" [value]="draft().title?.subtext ?? ''" (input)="patch({ title: { ...draft().title, subtext: text($event) } })" /></label>
              </div>
            </section>
          }
          @if (shows('legend')) {
            <section class="settings-section">
              <h3 class="settings-heading">Legend</h3>
              <div class="settings-grid">
                <label class="settings-check"><input type="checkbox" [checked]="draft().legend?.show ?? true" (change)="patch({ legend: { ...draft().legend, show: checked($event) } })" />Show the legend</label>
                <label class="settings-check"><input type="checkbox" [checked]="draft().legend?.scroll ?? true" (change)="patch({ legend: { ...draft().legend, scroll: checked($event) } })" />Scroll when long</label>
                <label class="settings-field"><span>Position</span>
                  <select class="input input-sm" (change)="patch({ legend: { ...draft().legend, position: pick($event) } })">
                    @for (side of sides; track side) { <option [value]="side" [selected]="(draft().legend?.position ?? 'top') === side">{{ side }}</option> }
                  </select></label>
                <label class="settings-field"><span>Orientation</span>
                  <select class="input input-sm" (change)="patch({ legend: { ...draft().legend, orient: pick($event) } })">
                    <option value="" [selected]="!draft().legend?.orient">Follow the position</option>
                    <option value="horizontal" [selected]="draft().legend?.orient === 'horizontal'">Horizontal</option>
                    <option value="vertical" [selected]="draft().legend?.orient === 'vertical'">Vertical</option>
                  </select></label>
              </div>
            </section>
          }
          @if (shows('colors')) {
            <section class="settings-section">
              <h3 class="settings-heading">Colours</h3>
              <app-theme-picker [value]="draft().colors?.theme ?? null" [inheritLabel]="'As the board (' + boardThemeLabel + ')'"
                                (changed)="patch({ colors: { ...draft().colors, theme: $event ?? undefined } })" />
              <p class="field-note text-[color:var(--text-muted)] mt-2">Series take the colours in this order. Click a colour to make it the first.</p>
              <app-palette-order [colors]="themeColors()" [order]="draft().colors?.order" (orderChange)="patch({ colors: { ...draft().colors, order: $event } })" />
            </section>
          }
          @if (shows('labels')) {
            <section class="settings-section">
              <h3 class="settings-heading">Data labels</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Show</span>
                  <select class="input input-sm" (change)="patch({ labels: { ...draft().labels, show: tri($event) } })">
                    <option value="" [selected]="draft().labels?.show === undefined">As the chart decides</option>
                    <option value="true" [selected]="draft().labels?.show === true">Always</option>
                    <option value="false" [selected]="draft().labels?.show === false">Never</option>
                  </select></label>
                <label class="settings-field"><span>Position</span>
                  <select class="input input-sm" (change)="patch({ labels: { ...draft().labels, position: pick($event) } })">
                    @for (place of ['auto', 'inside', 'outside', 'top']; track place) { <option [value]="place" [selected]="(draft().labels?.position ?? 'auto') === place">{{ place }}</option> }
                  </select></label>
                <label class="settings-field"><span>Format</span>
                  <select class="input input-sm" (change)="patch({ labels: { ...draft().labels, format: pick($event) } })">
                    @for (style of styles; track style.id) { <option [value]="style.id" [selected]="(draft().labels?.format ?? 'compact') === style.id">{{ style.label }}</option> }
                  </select></label>
                <!-- Auto is the default and the safe one: inside a bar or a slice the label is black or white,
                     whichever reads on that fill at 4.5:1; beside a mark it is the theme's text colour. -->
                <label class="settings-field"><span>Text</span>
                  <select class="input input-sm settings-label-colour" (change)="setLabelColour(pick($event))">
                    <option value="auto" [selected]="labelColourMode() === 'auto'">Auto (contrast with the mark)</option>
                    <option value="theme" [selected]="labelColourMode() === 'theme'">Theme text colour</option>
                    <option value="custom" [selected]="labelColourMode() === 'custom'">Custom colour</option>
                  </select></label>
                @if (labelColourMode() === 'custom') {
                  <label class="settings-field"><span>Colour</span>
                    <input type="color" class="input input-sm h-7 p-0.5" aria-label="Label colour" [value]="customColour()"
                           (change)="patch({ labels: { ...draft().labels, color: $any($event.target).value } })" /></label>
                }
                <label class="settings-field"><span>Size</span>
                  <select class="input input-sm" (change)="patch({ labels: { ...draft().labels, size: pick($event) } })">
                    @for (size of labelSizes; track size.id) { <option [value]="size.id" [selected]="(draft().labels?.size ?? 'normal') === size.id">{{ size.label }}</option> }
                  </select></label>
              </div>
            </section>
          }
          @if (shows('tooltip')) {
            <section class="settings-section">
              <h3 class="settings-heading">Tooltip</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Shows</span>
                  <select class="input input-sm" (change)="patch({ tooltip: { ...draft().tooltip, trigger: pick($event) } })">
                    <option value="" [selected]="!draft().tooltip?.trigger">As the chart decides</option>
                    <option value="axis" [selected]="draft().tooltip?.trigger === 'axis'">Every series at a point</option>
                    <option value="item" [selected]="draft().tooltip?.trigger === 'item'">The one mark under the pointer</option>
                  </select></label>
                <label class="settings-field"><span>Number format</span>
                  <select class="input input-sm" (change)="patch({ tooltip: { ...draft().tooltip, format: pick($event) } })">
                    @for (style of styles; track style.id) { <option [value]="style.id" [selected]="(draft().tooltip?.format ?? 'auto') === style.id">{{ style.label }}</option> }
                  </select></label>
              </div>
            </section>
          }
          @if (shows('sortTop')) {
            <section class="settings-section">
              <h3 class="settings-heading">Sort and top N</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Sort</span>
                  <select class="input input-sm" (change)="patch({ sort: pick($event) })">
                    <option value="none" [selected]="(draft().sort ?? 'none') === 'none'">As the result</option>
                    <option value="desc" [selected]="draft().sort === 'desc'">Largest first</option>
                    <option value="asc" [selected]="draft().sort === 'asc'">Smallest first</option>
                  </select></label>
                <label class="settings-field"><span>Top N</span><input class="input input-sm" type="number" min="1" max="500" placeholder="All" [value]="draft().topN ?? ''" (input)="patch({ topN: number($event) })" /></label>
                <label class="settings-check"><input type="checkbox" [checked]="draft().other ?? true" (change)="patch({ other: checked($event) })" />Add the rest as "Other"</label>
              </div>
              @if (data.view.chart?.additive !== true && draft().topN) {
                <p class="field-note text-[color:var(--text-muted)]">These figures do not add up, so the rest are left out rather than added into "Other".</p>
              }
            </section>
          }
          @if (shows('refLines')) {
            <section class="settings-section">
              <h3 class="settings-heading">Reference lines</h3>
              <div class="settings-grid">
                <label class="settings-check"><input type="checkbox" [checked]="!!draft().refLines?.average" (change)="patch({ refLines: { ...draft().refLines, average: checked($event) } })" />Average</label>
                <label class="settings-check"><input type="checkbox" [checked]="!!draft().refLines?.min" (change)="patch({ refLines: { ...draft().refLines, min: checked($event) } })" />Minimum</label>
                <label class="settings-check"><input type="checkbox" [checked]="!!draft().refLines?.max" (change)="patch({ refLines: { ...draft().refLines, max: checked($event) } })" />Maximum</label>
                <label class="settings-field"><span>Target value</span><input class="input input-sm" type="number" [value]="draft().refLines?.target ?? ''" (input)="patch({ refLines: { ...draft().refLines, target: number($event) } })" /></label>
                <label class="settings-field"><span>Target label</span><input class="input input-sm" placeholder="Target" [value]="draft().refLines?.label ?? ''" (input)="patch({ refLines: { ...draft().refLines, label: text($event) } })" /></label>
              </div>
            </section>
          }
          @if (shows('grid')) {
            <section class="settings-section">
              <h3 class="settings-heading">Grid</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Padding</span>
                  <select class="input input-sm" (change)="patch({ grid: { ...draft().grid, padding: pick($event) } })">
                    @for (pad of ['compact', 'normal', 'roomy']; track pad) { <option [value]="pad" [selected]="(draft().grid?.padding ?? 'normal') === pad">{{ pad }}</option> }
                  </select></label>
                <label class="settings-check"><input type="checkbox" [checked]="draft().grid?.fitLabels ?? true" (change)="patch({ grid: { ...draft().grid, fitLabels: checked($event) } })" />Fit the axis labels inside</label>
              </div>
            </section>
          }
          @if (shows('axes')) {
            @for (axis of axes; track axis.key) {
              <section class="settings-section">
                <h3 class="settings-heading">{{ axis.label }}</h3>
                <div class="settings-grid">
                  <label class="settings-field"><span>Name</span><input class="input input-sm" [value]="axisOf(axis.key).name ?? ''" (input)="patchAxis(axis.key, { name: text($event) })" /></label>
                  <label class="settings-field"><span>Minimum</span><input class="input input-sm" type="number" placeholder="Auto" [value]="axisOf(axis.key).min ?? ''" (input)="patchAxis(axis.key, { min: number($event) })" /></label>
                  <label class="settings-field"><span>Maximum</span><input class="input input-sm" type="number" placeholder="Auto" [value]="axisOf(axis.key).max ?? ''" (input)="patchAxis(axis.key, { max: number($event) })" /></label>
                  <label class="settings-field"><span>Label angle</span><input class="input input-sm" type="number" min="-90" max="90" step="15" placeholder="0" [value]="axisOf(axis.key).rotate ?? ''" (input)="patchAxis(axis.key, { rotate: number($event) })" /></label>
                  <label class="settings-field"><span>Number format</span>
                    <select class="input input-sm" (change)="patchAxis(axis.key, { format: pick($event) })">
                      @for (style of styles; track style.id) { <option [value]="style.id" [selected]="(axisOf(axis.key).format ?? 'compact') === style.id">{{ style.label }}</option> }
                    </select></label>
                  <label class="settings-field"><span>Unit</span><input class="input input-sm" placeholder="$, %, kg" [value]="axisOf(axis.key).unit ?? ''" (input)="patchAxis(axis.key, { unit: text($event) })" /></label>
                  <label class="settings-check"><input type="checkbox" [checked]="!!axisOf(axis.key).log" (change)="patchAxis(axis.key, { log: checked($event) })" />Log scale</label>
                  <label class="settings-check"><input type="checkbox" [checked]="axisOf(axis.key).interval === 'all'" (change)="patchAxis(axis.key, { interval: checked($event) ? 'all' : undefined })" />Label every category</label>
                  <label class="settings-check"><input type="checkbox" [checked]="axisOf(axis.key).splitLines ?? axis.key === 'yAxis'" (change)="patchAxis(axis.key, { splitLines: checked($event) })" />Grid lines</label>
                </div>
              </section>
            }
          }
          @if (shows('line')) {
            <section class="settings-section">
              <h3 class="settings-heading">Lines</h3>
              <div class="settings-grid">
                <label class="settings-check"><input type="checkbox" [checked]="draft().line?.smooth ?? false" (change)="patch({ line: { ...draft().line, smooth: checked($event) } })" />Smooth</label>
                <label class="settings-check"><input type="checkbox" [checked]="draft().line?.step ?? false" (change)="patch({ line: { ...draft().line, step: checked($event) } })" />Stepped</label>
                <label class="settings-check"><input type="checkbox" [checked]="draft().line?.symbols ?? true" (change)="patch({ line: { ...draft().line, symbols: checked($event) } })" />Point markers</label>
                <label class="settings-field"><span>Line width</span><input class="input input-sm" type="number" min="0.5" max="8" step="0.5" placeholder="2" [value]="draft().line?.width ?? ''" (input)="patch({ line: { ...draft().line, width: number($event) } })" /></label>
                <label class="settings-field"><span>Area fill ({{ pct(draft().line?.areaOpacity) }})</span><input type="range" min="0" max="1" step="0.05" [value]="draft().line?.areaOpacity ?? 0" (input)="patch({ line: { ...draft().line, areaOpacity: number($event) } })" /></label>
              </div>
            </section>
          }
          @if (shows('bar')) {
            <section class="settings-section">
              <h3 class="settings-heading">Bars</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Stacking</span>
                  <select class="input input-sm" (change)="patch({ bar: { ...draft().bar, stack: pick($event) } })">
                    <option value="none" [selected]="(draft().bar?.stack ?? 'none') === 'none'">Side by side</option>
                    <option value="stack" [selected]="draft().bar?.stack === 'stack'">Stacked</option>
                    <option value="percent" [selected]="draft().bar?.stack === 'percent'">100% stacked</option>
                  </select></label>
                <label class="settings-field"><span>Bar width (% of slot)</span><input class="input input-sm" type="number" min="10" max="100" step="5" placeholder="Auto" [value]="draft().bar?.width ?? ''" (input)="patch({ bar: { ...draft().bar, width: number($event) } })" /></label>
                <label class="settings-field"><span>Corner radius</span><input class="input input-sm" type="number" min="0" max="12" placeholder="3" [value]="draft().bar?.radius ?? ''" (input)="patch({ bar: { ...draft().bar, radius: number($event) } })" /></label>
              </div>
            </section>
          }
          @if (shows('pie')) {
            <section class="settings-section">
              <h3 class="settings-heading">Pie</h3>
              <div class="settings-grid">
                <label class="settings-field"><span>Inner radius (%)</span><input class="input input-sm" type="number" min="0" max="90" placeholder="Auto" [value]="draft().pie?.inner ?? ''" (input)="patch({ pie: { ...draft().pie, inner: number($event) } })" /></label>
                <label class="settings-field"><span>Outer radius (%)</span><input class="input input-sm" type="number" min="20" max="100" placeholder="Auto" [value]="draft().pie?.outer ?? ''" (input)="patch({ pie: { ...draft().pie, outer: number($event) } })" /></label>
                <label class="settings-check"><input type="checkbox" [checked]="draft().pie?.rose ?? data.kind === 'rose'" (change)="patch({ pie: { ...draft().pie, rose: checked($event) } })" />Rose: radius follows the value</label>
              </div>
            </section>
          }
          @if (shows('zoom') || shows('animation') || shows('renderer') || shows('toolbox')) {
            <section class="settings-section">
              <h3 class="settings-heading">Behaviour</h3>
              <div class="settings-grid">
                @if (shows('zoom')) {
                  <label class="settings-field"><span>Zoom</span>
                    <select class="input input-sm" (change)="patch({ zoom: tri($event) })">
                      <option value="" [selected]="draft().zoom === undefined">When there are too many points to fit</option>
                      <option value="true" [selected]="draft().zoom === true">Always</option>
                      <option value="false" [selected]="draft().zoom === false">Never</option>
                    </select></label>
                }
                @if (shows('animation')) {
                  <label class="settings-check"><input type="checkbox" [checked]="draft().animation ?? true" (change)="patch({ animation: checked($event) })" />Animate changes</label>
                }
                @if (shows('renderer')) {
                  <label class="settings-field"><span>Renderer</span>
                    <select class="input input-sm" (change)="patch({ renderer: pick($event) })">
                      <option value="canvas" [selected]="(draft().renderer ?? 'canvas') === 'canvas'">Canvas: fastest for many points</option>
                      <option value="svg" [selected]="draft().renderer === 'svg'">SVG: crisp, for small charts</option>
                    </select></label>
                }
                @if (shows('toolbox')) {
                  <label class="settings-check"><input type="checkbox" [checked]="draft().toolbox?.saveImage ?? true" (change)="patch({ toolbox: { ...draft().toolbox, saveImage: checked($event) } })" />Offer "Save as PNG"</label>
                  <label class="settings-check"><input type="checkbox" [checked]="draft().toolbox?.dataView ?? true" (change)="patch({ toolbox: { ...draft().toolbox, dataView: checked($event) } })" />Offer "Data view"</label>
                }
              </div>
            </section>
          }
          @if (!svgOnly && !visibleGroups().length) {
            <p class="text-sm text-[color:var(--text-muted)]">Nothing in this section applies to this chart.</p>
          }
          @if (svgOnly) {
            <p class="field-note text-[color:var(--text-muted)]">This kind is drawn by the console's own chart, which takes a colour theme. The other settings apply to the kinds drawn with ECharts.</p>
          }
        </div>
      </div>
      <div foot class="flex flex-wrap items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="draft.set({})">Reset to defaults</button>
        <span class="ms-auto"></span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" (click)="save()">Save</button>
      </div>
    </app-side-panel>
  `,
  styles: [`
    .settings-preview { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 0.75rem; background: var(--surface-raised); }
    .settings-section { display: flex; flex-direction: column; gap: 0.5rem; min-width: 0; }
    .settings-heading { font-size: 0.75rem; font-weight: 600; color: var(--text-secondary); }
    .settings-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr)); gap: 0.625rem 0.75rem; align-items: end; }
    .settings-field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; font-size: 0.75rem; color: var(--text-secondary); }
    .settings-check { display: flex; align-items: center; gap: 0.5rem; font-size: 0.75rem; color: var(--text-primary); min-height: 2rem; }
  `],
})
export class ChartSettingsPanel {
  readonly ref = inject<DialogRef<ChartSettings | undefined>>(DialogRef);
  readonly data = inject<ChartSettingsData>(DIALOG_DATA);
  private readonly themes = inject(ChartThemes);
  private readonly chartTokens = inject(ChartTokens);

  readonly draft = signal<ChartSettings>(parseSettings(this.data.settings));
  readonly groups = settingGroups(this.data.kind);
  readonly svgOnly = kindInfo(this.data.kind)?.engine === 'svg';
  readonly kindLabel = kindInfo(this.data.kind)?.label ?? 'Table';
  readonly boardThemeLabel = themeLabel(this.data.boardTheme);
  readonly sides = ['top', 'bottom', 'left', 'right'] as const;
  readonly styles = NUMBER_STYLES;
  readonly axes = [{ key: 'xAxis' as const, label: 'Across (x axis)' }, { key: 'yAxis' as const, label: 'Up (y axis)' }];

  readonly tabs = computed<SegmentOption<Tab>[]>(() => (Object.keys(TAB_GROUPS) as Tab[])
    .filter(tab => TAB_GROUPS[tab].some(group => this.groups.includes(group)))
    .map(tab => ({ id: tab, label: TAB_LABELS[tab] })));
  readonly tab = signal<Tab>('look');

  /** The groups on the open tab that apply to this kind. */
  readonly visibleGroups = computed(() => {
    const onTab = this.tabs().length > 1 ? TAB_GROUPS[this.tab()] : this.groups;
    return this.groups.filter(group => onTab.includes(group));
  });

  /** The colours of the theme this chart would draw in, in theme order, for the order editor. */
  readonly themeColors = computed(() =>
    this.themes.swatches(this.draft().colors?.theme ?? this.data.boardTheme ?? 'console').colors);

  shows(group: SettingGroup): boolean {
    return this.visibleGroups().includes(group);
  }

  axisOf(key: 'xAxis' | 'yAxis'): AxisSettings {
    return this.draft()[key] ?? {};
  }

  patch(change: Partial<ChartSettings>): void {
    this.draft.update(current => ({ ...current, ...change }));
  }

  patchAxis(key: 'xAxis' | 'yAxis', change: Partial<AxisSettings>): void {
    this.patch({ [key]: { ...this.axisOf(key), ...change } });
  }

  text(event: Event): string | undefined {
    const value = (event.target as HTMLInputElement).value;
    return value.trim() ? value : undefined;
  }

  number(event: Event): number | undefined {
    const value = (event.target as HTMLInputElement).value;
    return value.trim() === '' || !Number.isFinite(Number(value)) ? undefined : Number(value);
  }

  checked(event: Event): boolean {
    return (event.target as HTMLInputElement).checked;
  }

  /** A select's value, typed by the caller's field; '' means "the default". */
  pick<T>(event: Event): T {
    const value = (event.target as HTMLSelectElement).value;
    return (value === '' ? undefined : value) as T;
  }

  /** '', 'true' or 'false' as undefined, true or false. */
  tri(event: Event): boolean | undefined {
    const value = (event.target as HTMLSelectElement).value;
    return value === '' ? undefined : value === 'true';
  }

  /** The custom colour, or -- before one is picked -- the theme's text colour on screen, as a colour input needs it. */
  customColour(): string {
    const chosen = this.draft().labels?.color;
    if (chosen?.startsWith('#')) return chosen;
    const text = toRgb(this.chartTokens.tokens().text);
    return text ? toHex(text) : toHex([51, 51, 51]);
  }

  readonly labelSizes = [
    { id: 'small', label: 'Small' }, { id: 'normal', label: 'Normal' }, { id: 'large', label: 'Large' },
  ];

  /** Which of the three the Text choice is: a stored #rrggbb is "custom". */
  labelColourMode(): 'auto' | 'theme' | 'custom' {
    const colour = this.draft().labels?.color;
    return !colour || colour === 'auto' ? 'auto' : colour === 'theme' ? 'theme' : 'custom';
  }

  setLabelColour(mode: 'auto' | 'theme' | 'custom' | undefined): void {
    const keep = this.draft().labels?.color;
    const color = mode === 'custom' ? (keep && keep.startsWith('#') ? keep : this.customColour()) : mode === 'theme' ? 'theme' : undefined;
    this.patch({ labels: { ...this.draft().labels, color: color as LabelColor | undefined } });
  }

  pct(value: number | undefined): string {
    return `${Math.round((value ?? 0) * 100)}%`;
  }

  save(): void {
    this.ref.close(compactSettings(this.draft()) ?? {});
  }
}
