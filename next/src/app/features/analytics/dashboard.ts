import { PageHeader } from '../../shared/ui/page-header';
import { Crumb } from '../../core/nav/nav-tree';
import { AuthService } from '../../core/auth/auth.service';
import { Component, DestroyRef, Injector, LOCALE_ID, OnDestroy, OnInit, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription, catchError, from, mergeMap, of } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { Field } from '../../shared/ui/field';
import { confirmWith } from '../../shared/ui/confirm';
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router';
import { CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { LoadError } from '../../shared/ui/load-error';
import { WidgetTableDialog, WidgetTableData } from './widget-table';
import { KINDS } from './widget-kinds';
import { AnalyticsWidget, WidgetState as TileState } from './analytics-widget';
import { ECHART_HEIGHT, WidgetChart, WIDGET_HEIGHT, WIDGET_HEIGHT_MAX, WIDGET_HEIGHT_MIN } from './widget-chart';
import { FilterBuilder, countFilterClauses, describeClause, emptyFilterGroup, pruneFilters } from './filter-builder';
import { AnalysisRequest, AnalyticsService, Dashboard, DashboardWidget, DatasetColumn, FilterGroup, SavedAnalysis, SavedQuery, WidgetVisualization, EChartKind } from './analytics.service';
import { tableOf } from './charts/chart-table';
import { rowsDrawn } from './charts/chart-fit';
import { BoardSettings, ChartSettings, boardSettingsString, parseBoardSettings, parseSettings } from './charts/chart-settings';
import { KindPicker } from './charts/kind-picker';
import { ChartSettingsData, ChartSettingsPanel } from './charts/chart-settings-panel';
import { KindPickerData, KindPickerPanel } from './charts/kind-picker-panel';
import { ThemePicker } from '../../shared/charts/echart/theme-picker';
import { themeLabel } from '../../shared/charts/echart/echart-theme';
import { sidePanelConfig } from '../../shared/ui/side-panel';
import { kindInfo } from './widget-kinds';
import { KindMenu, kindMenu } from './charts/kind-menu';
import { KIND_ICONS } from './charts/kind-icons';
import { ToastService } from '../../shared/ui/toast.service';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { BoardFilterBar } from './board/board-filter-bar';
import { BoardFilterEditor, BoardFilterEditorData, FilterSourceOption } from './board/board-filter-editor';
import { BoardTable, TableRead, TableSource } from './board/board-table';
import {
  BoardFilterDef, BoardFilterState, crossFilterOf, defaultRange, emptyFilterState, parseFilterDefs, restoreState, saveState,
  stateFromParams, stateKey, stateToParams, tileFilterNote, toggleValue, wireFilters, withCrossFilterOperands,
} from './board/board-filters';
import { BoardSection, parseSections, sectionsByWidget, segmentsOf, withSection } from './board/board-sections';
import { colorKeysOf } from './charts/board-colors';
import { CHART_SLOTS } from '../../shared/charts/status-color';
import { Mark, widgetConfigOf, widgetConfigString, WidgetView, combineFilters, analysisView, queryView, WidgetRun, SavedAnalysisConfig, mintQueryId, TILE_ROWS, WidgetSpan, fillRows, SM_SPAN, LG_SPAN, ROW_KINDS, SEARCH_FROM, fileName, SPANS } from './widget-view';

/**
 * How many of a board's tiles run at once (owner 2026-10-12: tiles load in parallel). Three of the four permits the
 * analytics governor admits, so one board never holds them all.
 */
const BOARD_PARALLEL = 3;
/** The governor's "too busy right now" refusal, which a tile retries once rather than shows. */
const BUSY = /Too many analytics queries are running/i;

// The pure view-model (widget-view.ts) and the dataset registry (dataset-registry.ts) live in files of their own, so a
// screen that needs only them (Analytics) does not load the Dashboards component with them.
export * from './widget-view';
export { DatasetRegistry } from './dataset-registry';

/**
 * Dashboards: pages of saved work, re-run every time they are opened.
 *
 * <b>THE ONE DECISION THIS SCREEN IS BUILT AROUND: a widget stores a REFERENCE and never a
 * result.</b> A tile names a saved analysis or a saved query, and opening the board runs it. The
 * alternative -- storing the rows the tile last showed -- is what makes most dashboards lie: the
 * file behind a number changes, the number does not, and nothing on screen can tell the reader
 * which of the two they are looking at. This module has spent its whole design refusing to show
 * a figure it cannot stand behind, and a cached tile would be the first place it did.
 *
 * <b>AND THAT COSTS PERMITS, so here is what a board costs and what was done about it.</b> Every
 * analytics query in this application passes one JVM-wide fair Semaphore, admitting four at once
 * (analytics.query.max-concurrent, default 4) across every user AND the ETL work sharing the
 * box. A ten-widget board is ten real queries -- ten locked-down DuckDB sessions, ten scans of
 * whatever those datasets are. Fired together, one person opening one page would hold the whole
 * ceiling and queue everyone else behind it, and a board of a hundred tiles would be a denial of
 * service written in a UI.
 *
 * So the tiles run AT MOST THREE AT ONCE (BOARD_PARALLEL; owner 2026-10-12: tiles load in parallel,
 * with skeletons), in display order, and the queue is visible while it drains. A board therefore
 * holds at most three of the four permits no matter how many tiles are on it, and always leaves
 * one for somebody else; a tile the governor turns away for being busy retries once. The exchange
 * is stated on the board itself, and there are three ways out of the wait -- Stop abandons the rest
 * and cancels what is in flight, each tile re-runs on its own, and adding a tile runs only that
 * tile rather than the board again. A table widget pages itself (board/board-table.ts) and is not
 * queued at all. The filter bar (board/board-filters.ts) travels with every run; the server applies it.
 *
 * Changing a tile's chart kind runs NOTHING. It draws the result already in hand a different
 * way, which is the whole reason a widget is a reference plus a visualization choice and not a
 * saved picture.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-dashboards',
  imports: [PageHeader, Icon, LoadError, RouterLink, CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuItemRadio, CdkMenuTrigger, FilterBuilder, AnalyticsWidget, WidgetChart, Field, ServerTimePipe, KindPicker, ThemePicker, BoardFilterBar, BoardTable],
  templateUrl: './dashboard.html',
  styleUrls: ['./dashboard.css', './board/board.css'],
})
export class Dashboards implements OnInit, OnDestroy {

  private readonly analytics = inject(AnalyticsService);
  private readonly auth = inject(AuthService);
  /**
   * UX review 2026-10-12: whether the reader may change the boards -- a new board, a tile added, re-charted, re-set or
   * removed, the board's theme, a board deleted. A viewer's profile holds Saved Analyses only: they read the boards, run
   * and filter them, and the gateway refuses every write with a 403 besides.
   */
  readonly canEdit = computed(() => this.auth.canEditDashboards());

  // ---- the filter bar (board/board-filters.ts) ----------------------------------------------------------------------
  //
  // A board's editor defines its filters (a date range, and dimensions with their values); a reader sets them. They
  // travel with every tile's run and the SERVER applies them -- before the tile's own statement, its values bound, under
  // masking -- and says per tile what each did. The state is in the URL (a filtered board is a link) and kept per viewer.

  /** The board's settings, read once per change of the board. */
  private readonly boardSettings = computed(() => parseBoardSettings(this.board()?.dashboardConfig));
  readonly filterDefs = computed<BoardFilterDef[]>(() => parseFilterDefs(this.boardSettings().filters));
  readonly filterState = signal<BoardFilterState>(emptyFilterState());
  /** What every tile's run carries: the filters that are on. */
  readonly filterWire = computed(() => wireFilters(this.filterDefs(), this.filterState()));
  /** The board's section headings, by the widget each stands before. */
  readonly sections = computed(() => parseSections(this.boardSettings().sections));
  private readonly sectionMap = computed(() => sectionsByWidget(this.sections()));
  /** One colour per value across the board's tiles, from its filters' saved value order (charts/board-colors.ts). */
  readonly colorKeys = computed<ReadonlyMap<string, number> | null>(() => {
    if (this.boardSettings().colorByValue === false) return null;
    const keys = colorKeysOf(this.filterDefs().map(def => def.colorOrder ?? []), CHART_SLOTS);
    return keys.size ? keys : null;
  });
  /** Bumped to read every table widget again; one entry per table to read just that one. */
  private readonly tableEpoch = signal(0);
  private readonly tableBumps = signal<Record<number, number>>({});
  /** What each table widget last said: running, done (with what the filters did), failed. */
  readonly tableReads = signal<Record<number, TableRead>>({});
  /** When the board's run started, for the facts line's load time. */
  private runStartedAt = 0;
  readonly loadMs = signal<number | null>(null);
  private readonly viewerId = computed(() => this.auth.user()?.appUserId ?? null);
  /** Server times, read and written as the rest of the console does. */
  private readonly serverTime = new ServerTimePipe(inject(LOCALE_ID));
  /** A time in the given format, or the text as it came when it is not a time at all. */
  private timeOf(raw: string | Date, format: string): string {
    try { return this.serverTime.transform(raw, format) ?? String(raw); } catch { return String(raw); }
  }
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  /** The board's breadcrumb: See results › Dashboards (the cards, on this same address without a board). */
  readonly boardTrail: Crumb[] = [{ label: 'See results' }, { label: 'Dashboards', link: this.router.url.split(/[?#]/)[0] || '/' }];
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly heightMin = WIDGET_HEIGHT_MIN;
  readonly heightMax = WIDGET_HEIGHT_MAX;
  readonly searchFrom = SEARCH_FROM;

  /**
   * A chart's value label, formatted the way the table formats a cell.
   *
   * A bound arrow rather than a method, because it is passed AS a function to the chart -- a
   * method reference would lose `this` the moment the chart called it.
   */

  /**
   * A segment of a 100% stack, written as the percentage it is.
   *
   * One decimal place, because the parts of a group routinely differ by less than a whole point
   * and rounding them all to integers makes two visibly different segments read the same. The
   * bar's own total formats as "100%", which is true and is why the figure above the bar is
   * suppressed rather than formatted differently.
   */

  /** The key a dataset is identified by in the bar. A NUL cannot occur in either half. */
  private static datasetKey(connection: string, path: string): string {
    return connection + '\u0000' + path;
  }

  /**
   * The board filter, but only for a widget that reads the dataset it was written against.
   *
   * Null everywhere else, which is what keeps a board of mixed datasets from filling with
   * refusals. The tile says why it was not narrowed rather than staying silent -- a board that
   * looks uniformly narrowed and is not is the failure this whole scoping exists to prevent.
   */
  private boardFilterFor(saved: SavedAnalysis): FilterGroup | null {
    const on = this.boardFilterOn();
    if (!on) return null;
    return Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath) === on
      ? this.boardFilter() : null;
  }

  /** Every distinct dataset the board's analysis-backed widgets read. */
  readonly boardDatasets = computed(() => {
    const seen = new Map<string, { key: string; label: string }>();
    for (const widget of this.widgets()) {
      const saved = this.analyses().find(
        candidate => candidate.analyticsAnalysisId === widget.analyticsAnalysisId);
      if (!saved) continue;
      const key = Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath);
      if (!seen.has(key)) {
        seen.set(key, { key, label: saved.connectionAlias + '/' + saved.datasetPath });
      }
    }
    return Array.from(seen.values());
  });

  /**
   * Chooses which dataset the bar filters, and fetches its columns.
   *
   * LAZILY, and only on a change: a schema read is a governed DuckDB session and one of the four
   * permits this JVM has, so fetching one per board open would spend a permit on a bar nobody
   * touched. Changing the dataset CLEARS the filter, because the columns a condition may name
   * have just changed underneath it.
   */
  chooseFilterDataset(key: string): void {
    if (key === this.boardFilterOn()) return;
    this.boardFilterOn.set(key);
    this.boardFilter.set(emptyFilterGroup());
    this.boardColumns.set([]);
    this.boardColumnsError.set('');
    if (!key) return;

    const cut = key.indexOf('\u0000');
    const connection = key.slice(0, cut);
    const path = key.slice(cut + 1);
    this.boardColumnsLoading.set(true);
    this.analytics.schema(connection, path).subscribe({
      next: response => {
        this.boardColumnsLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.boardColumnsError.set(response.message || 'That dataset could not be read.');
          return;
        }
        this.boardColumns.set(response.data.columns ?? []);
      },
      error: err => {
        this.boardColumnsLoading.set(false);
        this.boardColumnsError.set(err?.error?.message || 'That dataset could not be read.');
      },
    });
  }

  /**
   * Applies the bar to the board.
   *
   * An explicit press, never on every keystroke. Ten widgets is ten governed queries, and a bar
   * that re-ran as somebody typed would be the denial of service this component's serial queue
   * exists to prevent. It reuses runAll() rather than growing a second queue.
   */
  applyBoardFilter(): void {
    this.holdTileHeights();
    this.runAll();
  }

  // ---- tile heights held while the board is narrowed -----------------------------------------

  /**
   * Each tile's height, in px, held while a board filter re-runs and stays on. Without it a click
   * on a mark moved the board: the narrowed results are shorter (six horizontal bars become one,
   * a ranked list of ten becomes one row) and every tile below a shorter row moved up -- and back
   * down on Clear. Held, a narrowed tile keeps its size and its chart sits in the same box (a
   * longer result scrolls inside it). Let go once the filter is off and the board has re-run, when
   * the tiles are back at the sizes that were held; and per tile when its reader changes its
   * layout (another kind, its chart settings, Show all).
   */
  readonly heldHeights = signal<ReadonlyMap<number, number>>(new Map());
  /** Each tile's width, held with its height (spanOf). */
  private readonly heldSpans = signal<ReadonlyMap<number, WidgetSpan>>(new Map());

  heldHeight(widget: DashboardWidget): number | null {
    return this.heldHeights().get(widget.analyticsDashboardWidgetId ?? -1) ?? null;
  }

  /** Reads each tile's height off the page and holds it; a height already held is kept. */
  private holdTileHeights(): void {
    if (typeof document === 'undefined') return;
    const held = new Map(this.heldHeights());
    document.querySelectorAll<HTMLElement>('app-analytics-widget[data-widget]').forEach(tile => {
      const id = Number(tile.dataset['widget']);
      const height = tile.getBoundingClientRect().height;
      if (Number.isFinite(id) && height > 0 && !held.has(id)) held.set(id, height);
    });
    const spans = new Map(this.heldSpans());
    for (const widget of this.widgets()) {
      const id = widget.analyticsDashboardWidgetId;
      if (id !== undefined && !spans.has(id)) spans.set(id, this.spanOf(widget));
    }
    this.heldSpans.set(spans);
    this.heldHeights.set(held);
  }

  private letGoOf(widget: DashboardWidget): void {
    const id = widget.analyticsDashboardWidgetId;
    if (id === undefined || !this.heldHeights().has(id)) return;
    const held = new Map(this.heldHeights());
    held.delete(id);
    this.heldHeights.set(held);
    const spans = new Map(this.heldSpans());
    spans.delete(id);
    this.heldSpans.set(spans);
  }

  /** The filter off and the board re-run: the tiles are back at their own sizes, so nothing is held. */
  /** The board's load time: from the start of its run to the last tile and table landing (the facts line says it). */
  protected readonly measureLoad = effect(() => {
    const busy = this.running() || Object.values(this.tableReads()).some(read => read.state === 'running');
    if (!busy && this.runStartedAt && this.board()) {
      this.loadMs.set(Math.round(performance.now() - this.runStartedAt));
      this.runStartedAt = 0;
    }
  });

  protected readonly releaseHeights = effect(() => {
    if (!this.running() && !this.boardFilterCount() && (this.heldHeights().size || this.heldSpans().size)) {
      this.heldHeights.set(new Map());
      this.heldSpans.set(new Map());
    }
  });

  /**
   * What this tile has to say about the board filter, or '' when there is nothing to say.
   *
   * Three outcomes, and the two that are not "narrowed" are the ones worth a sentence:
   *
   *   narrowed          the conditions, in the same words the Canvas uses for a chip.
   *   another dataset   named, because "why is this tile different" is otherwise unanswerable
   *                     from the screen.
   *   a saved query     the query endpoint takes SQL and nothing else. There is no filter to give
   *                     it, and composing a WHERE around somebody's own statement is precisely
   *                     the string-building the structured path exists to avoid.
   */
  boardFilterNote(widget: DashboardWidget): string {
    if (!this.boardFilterCount()) return '';
    if (widget.analyticsQueryId) {
      return 'The board filter is not applied here: this tile runs a saved statement, and that '
        + 'endpoint takes SQL and nothing else.';
    }
    const saved = this.analyses().find(
      candidate => candidate.analyticsAnalysisId === widget.analyticsAnalysisId);
    if (!saved) return '';
    if (Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath) !== this.boardFilterOn()) {
      const on = this.boardFilterOn().replace('\u0000', '/');
      return `The board filter is on ${on}. This tile reads `
        + `${saved.connectionAlias}/${saved.datasetPath}, so it is not narrowed.`;
    }
    return 'Board filter: ' + this.boardFilterWords().join(' · ');
  }

  /** The dataset a widget reads, as a board-filter key, or '' when it is not an analysis. */
  private datasetKeyFor(widget: DashboardWidget): string {
    if (widget.analyticsQueryId) return '';
    const saved = this.analyses().find(
      candidate => candidate.analyticsAnalysisId === widget.analyticsAnalysisId);
    return saved ? Dashboards.datasetKey(saved.connectionAlias, saved.datasetPath) : '';
  }

  /**
   * Whether clicking a mark on THIS tile can narrow the board.
   *
   * Drives the chart's own `clickable`, so a bar that cannot narrow is not a button at all --
   * neither a mouse target nor a tab stop. A chart that accepted every click and then explained
   * itself afterwards would be teaching the reader which bars are real by making them fail.
   *
   * <b>Some of the marks is enough, and the inert ones are inert individually.</b> Requiring all
   * of them was the first shape of this and it was wrong: a Top-N result carries one rolled-up
   * "Other" row that is legitimately not a category, so "every mark or nothing" would have taken
   * the feature away from most of the reports that have it. The Canvas already makes exactly this
   * row inert on its own, one row at a time, with a note under the table saying why -- and a tile
   * whose note says "14 values were rolled into Other" is a tile that has already explained which
   * bar will not click.
   */
  narrows(widget: DashboardWidget, view: WidgetView): boolean {
    // The filter bar's cross-filter: a mark whose column is one of the board's filters sets that filter.
    const defs = this.filterDefs();
    if (defs.length && view.marks.some(mark => !!crossFilterOf(defs, mark))) return true;
    if (!this.datasetKeyFor(widget)) return false;
    return view.marks.some(mark => !!mark.operands?.length);
  }

  /**
   * Narrows the whole board to the group that was clicked.
   *
   * The click IS the apply, and that is not a contradiction of the rule beside applyBoardFilter.
   * That rule exists because a bar that re-ran as somebody typed would be ten governed queries per
   * keystroke; one deliberate click is one apply, which is the same cost as pressing the button
   * next to it.
   *
   * It fills the bar rather than filtering behind it, and says so in the facts line, which opens
   * the bar: the reader ends up with an ordinary board filter they can read, edit, extend or
   * clear, instead of a hidden narrowing whose only trace is that the numbers moved. Every tile on another dataset
   * then says on its face that it was NOT narrowed, which is the same promise the bar already
   * makes.
   *
   * A click while the board is running is ignored: runAll() abandons the run in flight, so a
   * second click during a ten-widget pass would throw away nine answers to ask a question the
   * reader has not finished asking.
   */
  narrowTo(widget: DashboardWidget, mark: Mark): void {
    // A board with a filter bar: the click toggles that value in the bar's filter (a second click takes it off).
    const hit = crossFilterOf(this.filterDefs(), mark);
    if (hit) {
      this.setFilterState(toggleValue(this.filterState(), hit.key, hit.value));
      return;
    }
    const operands = mark.operands;
    // Defensive rather than expected -- `narrows` above already un-buttons these -- but the Other
    // row a chart rolls up on its own has no operands and reaches here if a max is ever set.
    if (!operands?.length || this.running()) return;
    const key = this.datasetKeyFor(widget);
    if (!key) return;

    // Switching datasets CLEARS the filter and fetches the new columns, which is exactly what
    // should happen: the conditions that were there named columns this dataset may not have.
    if (key !== this.boardFilterOn()) this.chooseFilterDataset(key);
    this.boardFilter.set({
      op: 'AND',
      clauses: operands.map(operand => ({
        field: operand.field,
        operator: 'EQ' as const,
        value: operand.value ?? '',
      })),
    });
    // The editor is NOT opened here (owner, 2026-10-06, "the panel dances"): a card appearing
    // above the board on a click pushed every tile down mid-click. The facts line says "1 filter
    // on" -- a button that opens the editor -- with a Clear beside it, and each tile's foot says
    // what narrowed it; all three sit in lines that are already there.
    this.holdTileHeights();
    this.runAll();
  }

  /** Takes the board filter off and runs the board again: the undo of a click on a mark. */
  clearBoardFilter(): void {
    this.holdTileHeights();
    this.boardFilter.set(emptyFilterGroup());
    this.runAll();
  }

  // ---- the filter bar: open, change, edit ----------------------------------------------------------------------------

  /** The state a board opens on: the link's, else this viewer's last on this board, else the board's defaults. */
  private openFilters(board: Dashboard): void {
    const defs = parseFilterDefs(parseBoardSettings(board.dashboardConfig).filters);
    const id = board.analyticsDashboardId;
    if (!defs.length || id === undefined) {
      this.filterState.set(emptyFilterState());
      return;
    }
    const fromUrl = stateFromParams(defs, this.route.snapshot.queryParamMap);
    const state = fromUrl ?? restoreState(stateKey(id, this.viewerId()), defs) ?? { values: {}, range: defaultRange(defs) };
    this.filterState.set(state);
    if (!fromUrl) this.writeFilterUrl(defs, state);
  }

  /** A link to the same board with other filters (pasted, or Back): the board follows it. */
  private followFilters(params: ParamMap): void {
    const defs = this.filterDefs();
    if (!defs.length || !this.board()) return;
    const fromUrl = stateFromParams(defs, params);
    if (!fromUrl || JSON.stringify(wireFilters(defs, fromUrl)) === JSON.stringify(this.filterWire())) return;
    this.filterState.set(fromUrl);
    this.runAll();
  }

  /** The reader changed the bar (or clicked a mark): kept, put in the URL, and the board runs again under it. */
  setFilterState(next: BoardFilterState): void {
    const board = this.board();
    if (!board?.analyticsDashboardId) return;
    this.filterState.set(next);
    saveState(stateKey(board.analyticsDashboardId, this.viewerId()), next);
    this.writeFilterUrl(this.filterDefs(), next);
    this.holdTileHeights();
    this.runAll();
  }

  private writeFilterUrl(defs: BoardFilterDef[], state: BoardFilterState): void {
    if (!defs.length) return;
    this.router.navigate([], { relativeTo: this.route, queryParams: stateToParams(defs, state), queryParamsHandling: 'merge', replaceUrl: true })
      .catch(() => {});
  }

  /** The datasets the board's tiles read: where a filter's values may come from. */
  filterSources(): FilterSourceOption[] {
    const seen = new Map<string, FilterSourceOption>();
    const add = (connection?: string | null, path?: string | null) => {
      if (!connection || !path) return;
      const key = connection + '\u0000' + path;
      if (!seen.has(key)) seen.set(key, { connection, path, label: `${fileName(path)} · ${connection}` });
    };
    for (const widget of this.widgets()) {
      if (widget.analyticsAnalysisId) {
        const saved = this.analyses().find(a => a.analyticsAnalysisId === widget.analyticsAnalysisId);
        add(saved?.connectionAlias, saved?.datasetPath);
      } else {
        const saved = this.queries().find(q => q.analyticsQueryId === widget.analyticsQueryId);
        add(saved?.connectionAlias, saved?.datasetPath);
        add(saved?.secondConnectionAlias, saved?.secondDatasetPath);
      }
    }
    return [...seen.values()];
  }

  /** "Edit filters": what the bar offers every reader, saved on the board. */
  openFilterEditor(): void {
    const ref = this.dialog.open<BoardFilterDef[], BoardFilterEditorData>(BoardFilterEditor,
      sidePanelConfig({ defs: this.filterDefs(), sources: this.filterSources() }, 'wide', 'right'));
    ref.closed.subscribe(defs => {
      if (defs) this.saveBoardSettings({ filters: defs.length ? defs : undefined }, 'The filters could not be saved.', true);
    });
  }

  /**
   * One part of the board's settings changed and saved, the rest kept as they are -- a theme change never drops the
   * filters or the sections. `rerun` when the change alters what the tiles are asked.
   */
  saveBoardSettings(change: Partial<BoardSettings>, failure: string, rerun = false): void {
    const board = this.board();
    if (!board?.analyticsDashboardId) return;
    const previous = board.dashboardConfig ?? null;
    // '{}' rather than null when nothing is left: the server keeps a stored value a save leaves out.
    const config = boardSettingsString({ ...parseBoardSettings(previous), ...change }) ?? '{}';
    this.board.update(open => open ? { ...open, dashboardConfig: config } : open);
    if (rerun) {
      this.openFilters({ ...board, dashboardConfig: config });
      this.runAll();
    }
    this.analytics.saveDashboard({ ...board, dashboardConfig: config }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.board.update(open => open ? { ...open, dashboardConfig: previous } : open);
          this.widgetError.set(response.message || failure);
        }
      },
      error: err => {
        this.board.update(open => open ? { ...open, dashboardConfig: previous } : open);
        this.widgetError.set(err?.error?.message || failure);
      },
    });
  }

  // ---- sections ------------------------------------------------------------------------------------------------------

  /** The heading that opens a section at this widget, if one does. */
  sectionBefore(widget: DashboardWidget): BoardSection | null {
    return this.sectionMap().get(widget.analyticsDashboardWidgetId ?? -1) ?? null;
  }

  /** The widget whose heading is being edited (a new heading starts in this state). */
  readonly editingSection = signal<number | null>(null);

  editSection(widget: DashboardWidget): void {
    this.editingSection.set(widget.analyticsDashboardWidgetId ?? null);
  }

  /** Saves a heading's words; an empty title removes it. */
  saveSection(widget: DashboardWidget, title: string, subtitle: string): void {
    const before = widget.analyticsDashboardWidgetId;
    this.editingSection.set(null);
    if (before === undefined) return;
    const next = withSection(this.sections(), { before, title, subtitle: subtitle.trim() || undefined });
    this.saveBoardSettings({ sections: next.length ? next : undefined }, 'The heading could not be saved.');
  }

  // ---- table widgets: paged by the server -----------------------------------------------------------------------------

  /**
   * The statement a table widget pages through, or null when the widget is not one. A saved query drawn as a table is
   * paged, sorted and filtered by the server (board/board-table.ts) instead of being run whole into the browser.
   */
  private readonly tableSources = computed(() => {
    const sources = new Map<number, TableSource>();
    for (const widget of this.widgets()) {
      if (widget.visualizationType !== 'table' || !widget.analyticsQueryId || widget.analyticsDashboardWidgetId === undefined) continue;
      const saved = this.queries().find(q => q.analyticsQueryId === widget.analyticsQueryId);
      if (!saved) continue;
      sources.set(widget.analyticsDashboardWidgetId, {
        connection: saved.connectionAlias, path: saved.datasetPath, sql: saved.queryText,
        connection2: saved.secondDatasetPath ? saved.secondConnectionAlias : null, path2: saved.secondDatasetPath || null,
      });
    }
    return sources;
  });

  pagedTable(widget: DashboardWidget): TableSource | null {
    return this.tableSources().get(widget.analyticsDashboardWidgetId ?? -1) ?? null;
  }

  tableReload(widget: DashboardWidget): number {
    return this.tableEpoch() + (this.tableBumps()[widget.analyticsDashboardWidgetId ?? -1] ?? 0);
  }

  tableKey(widget: DashboardWidget): string {
    return `etl.board-table.${this.openId() ?? 0}.${widget.analyticsDashboardWidgetId}.${this.viewerId() ?? 'anon'}`;
  }

  onTableRead(widget: DashboardWidget, read: TableRead): void {
    const id = widget.analyticsDashboardWidgetId;
    if (id === undefined) return;
    this.tableReads.update(all => ({ ...all, [id]: read }));
  }

  /** What the board's filters did to this tile: its "Filtered" marker and the filters that could not land. */
  tileNote(widget: DashboardWidget): { filtered: boolean; label: string; notApplied: string[] } | null {
    if (!this.filterWire().length) return null;
    const id = widget.analyticsDashboardWidgetId ?? -1;
    const outcomes = this.pagedTable(widget) ? this.tableReads()[id]?.outcomes : this.runs()[id]?.outcomes;
    return outcomes ? tileFilterNote(this.filterDefs(), outcomes) : null;
  }

  /** A tile's width in the board's twelve columns, or back to the width its kind takes (null). */
  setWidth(widget: DashboardWidget, span: number | null): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id) return;
    const config = widgetConfigOf(widget);
    const next = widgetConfigString({ ...config, span: span ?? undefined });
    this.letGoOf(widget);
    this.analytics.saveWidget({ ...widget, widgetConfig: next }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.widgetError.set(response.message || 'That width could not be saved.');
          return;
        }
        const saved = response.data;
        this.board.update(board => board ? {
          ...board, widgets: (board.widgets ?? []).map(item => item.analyticsDashboardWidgetId === id ? { ...item, ...saved } : item),
        } : board);
      },
      error: err => this.widgetError.set(err?.error?.message || 'That width could not be saved.'),
    });
  }

  /** The widths a tile's menu offers. */
  readonly widths = SPANS.map(span => ({ span, label: ({ 3: 'A quarter', 4: 'A third', 6: 'Half', 8: 'Two thirds', 9: 'Three quarters', 12: 'The whole row' } as Record<number, string>)[span] }));

  ownWidth(widget: DashboardWidget): number | null {
    return widgetConfigOf(widget).span ?? null;
  }

  readonly dashboards = signal<Dashboard[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  /** The list read was refused (403). */
  readonly refused = signal(false);

  /** Narrows the cards by name or description. Only offered past SEARCH_FROM boards. */
  readonly listFilter = signal('');

  // ---- the board filter ---------------------------------------------------------------------
  //
  // SESSION-ONLY, deliberately, and it is the smaller honest change by a wide margin. Persisting
  // it costs a migration, a column, an entity field, a validator and two client shapes -- and it
  // would narrow the board silently for the next person who opens it, when a dashboard is
  // described in its own schema as "the one thing here made to be shown to somebody who did not
  // build it". Every board opens showing everything; narrowing is something the reader did and
  // can see they did. If a narrowed board should be shareable later, the URL is the next step,
  // not a column.

  readonly boardFilter = signal<FilterGroup>(emptyFilterGroup());

  /**
   * The dataset the bar's conditions are written against, as "connection\u0000path".
   *
   * <b>Scoped to ONE dataset, because a filter cannot be applied blind.</b> A board's widgets may
   * read different files, and a condition naming a column another file does not have is a hard
   * refusal from the server -- "This dataset has no column called region" -- so an unscoped board
   * filter would turn half a board into error tiles. Every tile on the chosen dataset is narrowed;
   * every other tile says on its face that it was not, and why.
   */
  readonly boardFilterOn = signal('');

  /** The chosen dataset's columns, fetched once when the bar is opened. */
  readonly boardColumns = signal<DatasetColumn[]>([]);
  readonly boardColumnsLoading = signal(false);
  readonly boardColumnsError = signal('');
  readonly filterOpen = signal(false);

  /** Conditions typed but not finished, and therefore not sent. Said rather than swallowed. */
  readonly unfinishedBoardFilters = computed(() =>
    countFilterClauses(this.boardFilter())
      - countFilterClauses(pruneFilters(this.boardFilter())));

  /** How many board conditions are actually being applied. */
  readonly boardFilterCount = computed(() =>
    countFilterClauses(pruneFilters(this.boardFilter())));

  /** The board filter in words, for the line under a narrowed tile. */
  readonly boardFilterWords = computed(() =>
    pruneFilters(this.boardFilter()).clauses
      .map(node => (node as any).clauses ? '(a group)' : describeClause(node as any)));

  // ---- favourites and groups (UX review B5, SA1) ------------------------------------------------
  /** Each viewer's starred boards, kept in this browser under their own key. */
  private readonly favouritesKey = `etl.dashboards.favourites.${typeof this.auth.user === 'function' ? this.auth.user()?.appUserId ?? 'anon' : 'anon'}`;
  readonly favourites = signal<ReadonlySet<number>>(readFavourites(this.favouritesKey));
  /** The pipelines each board's files come from (dashboard id -> pipeline names), as the server says. */
  readonly boardPipelines = computed<ReadonlyMap<number, string[]>>(() => new Map(this.dashboards()
    .filter(d => d.analyticsDashboardId != null && d.pipelines?.length)
    .map(d => [d.analyticsDashboardId!, d.pipelines!.map(p => p.name || `Schedule #${p.jobId}`)])));

  /** "Made by": the open board's newest feeding pipeline and its run, linked to the run page (B5, B1). */
  readonly madeBy = computed(() => {
    const pipelines = this.board()?.pipelines ?? [];
    const first = pipelines[0];
    if (!first) return null;
    return {
      name: first.name || `Schedule #${first.jobId}`,
      run: first.lastRunId,
      link: first.lastRunId ? ['/pipelines/schedules', first.jobId, 'runs', first.lastRunId] : ['/pipelines/schedules', first.jobId, 'executions'],
      more: pipelines.length - 1,
      all: pipelines.map(p => (p.name || `Schedule #${p.jobId}`) + (p.lastRunId ? ` · run #${p.lastRunId}` : '')).join('\n'),
    };
  });

  isFavourite(item: Dashboard): boolean { return item.analyticsDashboardId != null && this.favourites().has(item.analyticsDashboardId); }

  toggleFavourite(item: Dashboard, event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    const id = item.analyticsDashboardId;
    if (id == null) return;
    const next = new Set(this.favourites());
    if (next.has(id)) next.delete(id); else next.add(id);
    this.favourites.set(next);
    try { localStorage.setItem(this.favouritesKey, JSON.stringify([...next])); } catch { /* not remembered */ }
  }

  /**
   * The cards in groups: the viewer's favourites first, then by the pipeline whose output each board reads (a board
   * reading two pipelines' files sits under the first), then the boards no pipeline feeds. Without the pipelines known
   * it is one group. A search narrows every group.
   */
  readonly dashboardGroups = computed(() => groupDashboards(this.visibleDashboards(), this.favourites(), this.boardPipelines()));

  readonly visibleDashboards = computed(() => {
    const needle = this.listFilter().trim().toLowerCase();
    if (!needle) return this.dashboards();
    return this.dashboards().filter(item =>
      (item.dashboardName ?? '').toLowerCase().includes(needle)
      || (item.dashboardDescription ?? '').toLowerCase().includes(needle));
  });

  readonly newName = signal('');
  readonly newDescription = signal('');
  readonly creating = signal(false);
  readonly createError = signal('');

  /**
   * The board being looked at, or null for the cards. Set before the board has arrived, so the
   * page shows the board view (loading, then the board or why it could not be read) from the
   * click on; `board()` is what the server sent. Mirrored in the URL as ?board=, so a board can
   * be linked to and Back returns to the cards.
   */
  readonly openId = signal<number | null>(null);
  readonly board = signal<Dashboard | null>(null);
  readonly boardLoading = signal(false);
  readonly boardError = signal('');
  /** UX review 2026-10-12: the board read was refused (403): the page says so, with whom to ask, and offers no retry. */
  readonly boardRefused = signal(false);
  readonly widgetError = signal('');

  /**
   * The saved work a widget can point at.
   *
   * Both lists are metadata reads -- no session, no permit -- and they are held for the whole
   * visit rather than re-fetched per board: they are the reader's own saved work across every
   * dataset, and a board that re-read them would spend a database round trip to be told what
   * this screen is already holding.
   */
  readonly analyses = signal<SavedAnalysis[]>([]);
  readonly queries = signal<SavedQuery[]>([]);
  readonly sourcesReady = signal(false);
  readonly sourcesError = signal('');

  readonly addOpen = signal(false);
  readonly addTitle = signal('');
  readonly addKindOfSource = signal<'analysis' | 'query'>('analysis');
  readonly addSourceId = signal('');
  readonly addVisualization = signal<WidgetVisualization>('table');
  /** Blank means "the default height" -- stored as absent rather than as the default value. */
  readonly addHeight = signal('');
  readonly addCaption = signal('');
  readonly adding = signal(false);
  readonly addError = signal('');

  readonly runs = signal<Record<number, WidgetRun>>({});
  /** Widget ids still waiting. The head of it is what runs next, when fewer than BOARD_PARALLEL are running. */
  readonly queue = signal<number[]>([]);
  /** The widgets running now, at most BOARD_PARALLEL of them. */
  readonly runningIds = signal<number[]>([]);
  /** The first of them: what the progress line names. */
  readonly runningId = computed(() => this.runningIds()[0] ?? null);
  /**
   * How many widgets THIS pass set out to run.
   *
   * Not widgets().length, which is a different number whenever the pass is not the whole board:
   * re-running one tile of five would otherwise count itself as "5 of 5", which reads as a board
   * being redrawn and would have a reader waiting for four tiles that were never queued.
   */
  private readonly batch = signal(0);

  /**
   * The epoch a run belongs to.
   *
   * Every in-flight response carries the epoch it was started under and is DROPPED if that is no
   * longer the current one. Stopping, opening another board and re-running all bump it, so a
   * response that was already on the wire when the reader moved on cannot land on a tile that
   * has since been re-queued -- which would show a figure under a board it was not read for.
   */
  private epoch = 0;
  /** The board read that is allowed to land. See loadBoard. */
  private boardToken = 0;
  private readonly inFlight = new Map<number, Subscription>();
  /** The tiles retried once after the governor turned them away for being busy, in this pass. */
  private readonly retried = new Set<number>();
  /** Set once the board is loaded and waiting for the sources it needs to run its widgets. */
  private pending: 'all' | number[] | null = null;

  readonly widgets = computed<DashboardWidget[]>(() => this.board()?.widgets ?? []);

  /**
   * Each board's widgets, for the counts on its card. The listing carries no widgets, so each
   * board is read once by id: metadata only, no session and no query permit (see
   * fetchDashboardById). Kept up to date when a board is opened, added to or trimmed.
   */
  readonly cardWidgets = signal<Record<number, DashboardWidget[]>>({});

  /** Widgets whose table shows every row rather than the first TILE_ROWS. */
  readonly expanded = signal<ReadonlySet<number>>(new Set());

  /** The files the open board reads, for the facts line and "Files this board reads". */
  readonly boardFiles = computed(() => this.filesOf(this.widgets()));
  /** Whether the create form is open; a header button, not a permanent pair of inputs. */
  readonly createOpen = signal(false);
  readonly ranCount = computed(() => Object.values(this.runs()).filter(run => run.state === 'done').length);
  readonly failedCount = computed(() => Object.values(this.runs()).filter(run => run.state === 'failed').length);
  /** When the last tile landed, for the head's tile. */
  readonly lastRunText = computed(() => {
    const at = Math.max(0, ...Object.values(this.runs()).map(run => run.view?.ranAt ?? 0));
    return at ? 'last ran ' + this.clock(at) : '';
  });

  /** How the last pass went, for the board's facts line: "6 of 7 drew, 1 failed". */
  readonly lastRun = computed(() => {
    if (this.running()) return this.progress();
    // A table widget reads its own pages (board-table): it counts as drawn once its page is in.
    const reads = Object.values(this.tableReads());
    const drew = this.ranCount() + reads.filter(read => read.state === 'done').length;
    const failed = this.failedCount() + reads.filter(read => read.state === 'failed').length;
    if (!drew && !failed) return '';
    return `${drew} of ${this.widgets().length} drew` + (failed ? `, ${failed} failed` : '');
  });

  /** A run's state as the shared tile chrome names it; a result with no rows is 'empty'. */
  stateOf(run: WidgetRun | undefined): TileState {
    if (!run) return 'idle';
    // Re-running over a result it has: the result stays, busy (see WidgetRun.previous).
    if (this.updating(run)) return run.previous!.rowCount ? 'ready' : 'empty';
    if (run.state === 'done') return run.view && !run.view.rowCount ? 'empty' : 'ready';
    return run.state;
  }
  readonly running = computed(() => this.runningIds().length > 0 || this.queue().length > 0);

  readonly canCreate = computed(() => !!this.newName().trim() && !this.creating());

  /** An out-of-range height, said beside the box rather than silently clamped by the server. */
  readonly heightError = computed(() => {
    const raw = this.addHeight().trim();
    if (!raw) return '';
    const n = Number(raw);
    return Number.isFinite(n) && n >= this.heightMin && n <= this.heightMax
      ? '' : `Between ${this.heightMin} and ${this.heightMax} pixels, or leave it empty.`;
  });

  readonly canAdd = computed(() =>
    !!this.addTitle().trim() && !!this.addSourceId() && !this.heightError() && !this.adding() && !!this.board());

  /**
   * What opening this board costs, in the reader's own terms.
   *
   * On the board rather than in a release note, because it is the one thing about a dashboard
   * that a reader cannot see by looking at it: every tile is a live query, and ten tiles is ten
   * of them. The permit ceiling is deliberately described rather than numbered -- it is a server
   * property that this screen would otherwise be a second, silently wrong source of truth for.
   */
  readonly cost = computed(() => {
    const count = this.widgets().length;
    if (!count) return 'An empty board costs nothing to open.';
    return `${count} ${count === 1 ? 'widget' : 'widgets'}, and opening this board runs `
      + `${count === 1 ? 'it' : 'each of them'} again — nothing here is stored from last time. `
      + 'They run three at a time, in order, so this board never holds more than three of the '
      + 'server\'s four query permits however many widgets are on it.';
  });

  readonly progress = computed(() => {
    const total = this.batch();
    const left = this.queue().length + this.runningIds().length;
    const at = Math.min(Math.max(total - left + 1, 1), total);
    const current = this.widgets().find(
      widget => widget.analyticsDashboardWidgetId === this.runningId());
    return `Running ${at} of ${total}`
      + (current ? ` — ${current.widgetTitle}` : '') + '.';
  });

  ngOnInit(): void {
    this.loadDashboards();
    this.loadSources();
    // The URL says which board is open: a link to ?board=7 opens it, and Back and Forward move
    // between a board and the cards. A change this page made itself is already in openId, so it
    // is not loaded twice.
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const before = this.openId();
        this.followUrl(params.get('board'));
        if (before !== null && before === this.openId()) this.followFilters(params);
      });
  }

  /** Opens or leaves a board to match the URL's ?board=. Anything but a whole number is none. */
  private followUrl(raw: string | null): void {
    const id = raw && /^\d+$/.test(raw) ? Number(raw) : null;
    if (id === this.openId()) return;
    if (id === null) {
      this.leaveBoard();
      return;
    }
    this.enterBoard(id);
  }

  ngOnDestroy(): void {
    // A queue left draining after the screen is gone would spend permits on figures nobody can
    // see, which is the one cost that buys nothing at all.
    this.abandon();
  }

  // ---- the boards ------------------------------------------------------------------------

  loadDashboards(): void {
    this.loading.set(true);
    this.error.set('');
    this.analytics.fetchAllDashboards().subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(response.message || 'The dashboards could not be read.');
          return;
        }
        this.dashboards.set(response.data);
        this.loadCardFacts(response.data);
      },
      error: err => {
        this.loading.set(false);
        this.refused.set(err?.status === 403);
        this.error.set(err?.error?.message || 'The dashboards could not be read.');
      },
    });
  }

  /**
   * Reads the widgets of each board not already known, three at a time, for the card counts.
   * A board that cannot be read keeps a card without counts rather than an error: the card still
   * opens it, and opening says why.
   */
  private loadCardFacts(list: Dashboard[]): void {
    const known = this.cardWidgets();
    const ids = list.map(item => item.analyticsDashboardId)
      .filter((id): id is number => typeof id === 'number' && !(id in known));
    if (!ids.length) return;
    from(ids).pipe(
      // UX review 2026-10-12: one board that cannot be read (a refusal, a dropped connection) leaves its card without
      // counts; it no longer ends the reading of every card after it, as an error in mergeMap did.
      mergeMap(id => this.analytics.fetchDashboardById(id).pipe(catchError(() => of(null))), 3),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: response => {
        const id = response?.data?.analyticsDashboardId;
        if (!response || response.status !== API_SUCCESS || !id) return;
        this.cardWidgets.update(all => ({ ...all, [id]: response.data!.widgets ?? [] }));
      },
      error: () => {},
    });
  }

  /** "7 widgets · 3 files" for a card, or '' until that board's widgets are known. */
  cardFacts(item: Dashboard): string {
    const widgets = item.analyticsDashboardId ? this.cardWidgets()[item.analyticsDashboardId] : undefined;
    if (!widgets) return '';
    if (!widgets.length) return 'No widgets yet';
    const files = this.filesOf(widgets).length;
    return `${widgets.length} widget${widgets.length === 1 ? '' : 's'}`
      + (files ? ` · ${files} file${files === 1 ? '' : 's'}` : '');
  }

  /**
   * Every distinct file a set of widgets reads, saved analyses and saved queries alike (a query
   * over a join reads two). Unlike boardDatasets, which the board filter uses and which can only
   * narrow analyses, this is what the board touches.
   */
  filesOf(widgets: DashboardWidget[]): string[] {
    const seen = new Set<string>();
    for (const widget of widgets) {
      if (widget.analyticsAnalysisId) {
        const saved = this.analyses().find(item => item.analyticsAnalysisId === widget.analyticsAnalysisId);
        if (saved) seen.add(saved.connectionAlias + '/' + saved.datasetPath);
      } else if (widget.analyticsQueryId) {
        const saved = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
        if (saved) {
          seen.add(saved.connectionAlias + '/' + saved.datasetPath);
          if (saved.secondDatasetPath) seen.add((saved.secondConnectionAlias ?? saved.connectionAlias) + '/' + saved.secondDatasetPath);
        }
      }
    }
    return [...seen];
  }

  /** Opens the create form and puts the cursor in its name, from the head or the last card. */
  openCreate(): void {
    this.createOpen.set(true);
    this.createError.set('');
    setTimeout(() => (globalThis.document?.getElementById('dashName') as HTMLInputElement | null)?.focus());
  }

  createDashboard(): void {
    if (!this.canCreate()) return;
    this.creating.set(true);
    this.createError.set('');
    this.analytics.saveDashboard({
      dashboardName: this.newName().trim(),
      dashboardDescription: this.newDescription().trim() || null,
    }).subscribe({
      next: response => {
        this.creating.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.createError.set(response.message || 'The dashboard could not be created.');
          return;
        }
        this.newName.set('');
        this.newDescription.set('');
        // The form closes with the board made; left open, an empty create form sat above it.
        this.createOpen.set(false);
        this.loadDashboards();
        // Opened rather than merely listed, and it costs nothing: a board with no widgets on it
        // runs no queries, so this is the one open that is free.
        this.openDashboard(response.data);
      },
      error: err => {
        this.creating.set(false);
        this.createError.set(err?.error?.message || 'The dashboard could not be created.');
      },
    });
  }

  async removeDashboard(item: Dashboard): Promise<void> {
    const id = item.analyticsDashboardId;
    if (!id) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Delete this dashboard?',
      body: `"${item.dashboardName}" and the widgets on it will be removed. The analyses and `
        + 'queries those widgets pointed at are untouched — a dashboard is an arrangement of '
        + 'saved work, not the owner of it.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteDashboard(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.toast.error(response.message || 'The dashboard could not be deleted.');
          return;
        }
        this.cardWidgets.update(all => {
          const next = { ...all };
          delete next[id];
          return next;
        });
        if (this.openId() === id) this.closeDashboard();
        this.loadDashboards();
      },
      error: err => {
        this.toast.error(err?.error?.message || 'The dashboard could not be deleted.');
      },
    });
  }

  /** Opens a board, runs it, and puts it in the URL so the page can be linked and Back works. */
  openDashboard(item: Dashboard): void {
    const id = item.analyticsDashboardId;
    if (!id) return;
    this.enterBoard(id);
    this.setUrl(id);
  }

  /** Back to the cards: the board's run is stopped and ?board= leaves the URL. */
  closeDashboard(): void {
    this.leaveBoard();
    this.setUrl(null);
  }

  /** The "All dashboards" link navigates by itself; this only leaves the board at once. */
  leaveBoard(): void {
    if (this.openId() === null && !this.board()) return;
    this.abandon();
    this.boardToken++;
    this.openId.set(null);
    this.board.set(null);
    this.boardLoading.set(false);
    this.boardError.set('');
    this.widgetError.set('');
    this.resetBoardState();
  }

  /** Reads the open board again after it could not be read. */
  retryBoard(): void {
    const id = this.openId();
    if (id !== null) this.loadBoard(id, 'all');
  }

  private enterBoard(id: number): void {
    // Another board's tiles and filter mean nothing here; the same board opened again keeps its
    // tiles until the new run replaces them, as it always has.
    if (this.openId() !== id) {
      this.board.set(null);
      this.resetBoardState();
    }
    this.openId.set(id);
    this.loadBoard(id, 'all');
  }

  /** What belongs to one open board and must not follow the reader to the next. */
  private resetBoardState(): void {
    this.runs.set({});
    this.heldHeights.set(new Map());
    this.heldSpans.set(new Map());
    this.expanded.set(new Set());
    this.addOpen.set(false);
    this.filterOpen.set(false);
    this.boardFilterOn.set('');
    this.boardFilter.set(emptyFilterGroup());
    this.boardColumns.set([]);
    this.filterState.set(emptyFilterState());
    this.tableReads.set({});
    this.tableBumps.set({});
    this.editingSection.set(null);
    this.loadMs.set(null);
  }

  private setUrl(id: number | null): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { board: id }, queryParamsHandling: 'merge' })
      .catch(() => {});
  }

  /**
   * Reads one board and, optionally, starts running what is on it.
   *
   * `run` is a parameter rather than a rule because the three reasons to load a board are not
   * the same: opening one should draw it, reloading after a widget was removed should leave the
   * tiles that already ran alone, and adding a widget should run exactly the new one.
   */
  private loadBoard(analyticsDashboardId: number, run: 'all' | number[] | null): void {
    this.abandon();
    this.boardLoading.set(true);
    this.boardError.set('');
    this.boardRefused.set(false);
    this.widgetError.set('');
    // Two boards asked for in quick succession answer in whatever order the server manages, and
    // the one that answers last is not necessarily the one the reader is waiting for. Only the
    // most recent request is allowed to become the board on screen.
    const token = ++this.boardToken;
    this.analytics.fetchDashboardById(analyticsDashboardId).subscribe({
      next: response => {
        if (token !== this.boardToken) return;
        this.boardLoading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.boardError.set(response.message || 'The dashboard could not be read.');
          return;
        }
        this.board.set(response.data);
        this.cardWidgets.update(all => ({ ...all, [analyticsDashboardId]: response.data!.widgets ?? [] }));
        // The filters before the run: every tile's first run carries them.
        if (run === 'all') this.openFilters(response.data);
        if (run === null) return;
        this.pending = run;
        this.start();
      },
      error: err => {
        if (token !== this.boardToken) return;
        this.boardLoading.set(false);
        // UX review 2026-10-12: a refusal is said as one, not as a failure to retry.
        this.boardRefused.set(err?.status === 403);
        this.boardError.set(err?.error?.message || 'The dashboard could not be read.');
      },
    });
  }

  // ---- the sources a widget can point at --------------------------------------------------

  private loadSources(): void {
    this.sourcesError.set('');
    let arrived = 0;
    const settle = () => {
      if (++arrived < 2) return;
      this.sourcesReady.set(true);
      // A board may have finished loading while these were still on the wire. Its widgets cannot
      // run without them, so the queue it left behind starts here instead.
      this.start();
    };
    this.analytics.fetchAllAnalyses().subscribe({
      next: response => {
        if (response.status === API_SUCCESS && response.data) this.analyses.set(response.data);
        else this.sourcesError.set(response.message || 'Saved analyses could not be read.');
        settle();
      },
      error: err => {
        this.sourcesError.set(err?.error?.message || 'Saved analyses could not be read.');
        settle();
      },
    });
    this.analytics.fetchAllQueries().subscribe({
      next: response => {
        if (response.status === API_SUCCESS && response.data) this.queries.set(response.data);
        else if (!this.sourcesError()) {
          this.sourcesError.set(response.message || 'Saved queries could not be read.');
        }
        settle();
      },
      error: err => {
        if (!this.sourcesError()) {
          this.sourcesError.set(err?.error?.message || 'Saved queries could not be read.');
        }
        settle();
      },
    });
  }

  /** What a tile is pointing at, in one line: the kind, the name and where it reads. */
  /**
   * What the tile points at. The saved work's name is left out when it is the tile's own title,
   * which it almost always is: "Total revenue · Saved analysis · Total revenue · …" said the same
   * thing twice on every tile of every seeded board.
   */
  sourceOf(widget: DashboardWidget): string {
    const saved = widget.analyticsAnalysisId
      ? this.analyses().find(item => item.analyticsAnalysisId === widget.analyticsAnalysisId)
      : undefined;
    if (widget.analyticsAnalysisId) {
      if (!saved) return 'Saved analysis';
      const name = saved.analysisName === widget.widgetTitle ? '' : ` · ${saved.analysisName}`;
      return `Saved analysis${name} · ${saved.connectionAlias}/${saved.datasetPath}`;
    }
    const query = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    if (!query) return 'Saved query';
    const name = query.queryName === widget.widgetTitle ? '' : ` · ${query.queryName}`;
    return `Saved query${name} · ${query.connectionAlias}/${query.datasetPath}`;
  }

  /**
   * The one short line under a tile's title: the file it reads, and the saved work's name when
   * the tile was given a title of its own. The whole of sourceOf() is its tooltip; the full
   * path on every tile made each subtitle a line of URL.
   */
  shortSourceOf(widget: DashboardWidget): string {
    const saved = widget.analyticsAnalysisId
      ? this.analyses().find(item => item.analyticsAnalysisId === widget.analyticsAnalysisId)
      : this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    if (!saved) return widget.analyticsAnalysisId ? 'Saved analysis' : 'Saved query';
    const file = fileName(saved.datasetPath);
    const name = withoutBoardName('analysisName' in saved ? saved.analysisName : saved.queryName, this.board()?.dashboardName);
    // UX review B5 (B1, L11): "Riverside — Patient 360 — Patients in the cohort · cohort.csv" under a tile titled
    // "Patients in the cohort" on the board "Riverside — Patient 360" said the board's name and the title again.
    return !name || name === widget.widgetTitle ? file : `${name} · ${file}`;
  }

  /**
   * How many of a board's twelve columns a widget takes, by what it draws: a single figure 3, a
   * table or a cross-tab 12, any chart or summary 6. The drawn kind once it has run, and the saved
   * one before, so a tile does not jump when its result lands.
   */
  spanOf(widget: DashboardWidget): WidgetSpan {
    // Held while the board is narrowed, with the height: a narrowed answer a kind cannot draw (a
    // rose of one row) falls back to a table, a table takes the whole row, and the tiles round it
    // were reflowed into new rows (layout shift 0.11, 2026-10-06).
    const held = this.heldSpans().get(widget.analyticsDashboardWidgetId ?? -1);
    if (held !== undefined) return held;
    // The width its editor chose, when one did.
    const own = widgetConfigOf(widget).span;
    if (own && SPANS.includes(own)) return own as WidgetSpan;
    const view = this.runs()[widget.analyticsDashboardWidgetId!]?.view;
    const kind = view ? this.drawn(widget, view) : (widget.visualizationType ?? 'table');
    if (kind === 'kpi' || kind === 'kpiTrend') return 3;
    return ROW_KINDS.has(kind) || !KINDS.some(known => known.id === kind) ? 12 : 6;
  }

  /** Each widget's widths at sm and lg, with every row filled (fillRows). */
  private readonly filledSpans = computed(() => {
    const widgets = this.widgets();
    const natural = widgets.map(widget => this.spanOf(widget));
    // A section heading starts a new row, so each run of widgets between two headings fills its own rows.
    const sm: number[] = [];
    const lg: number[] = [];
    for (const segment of segmentsOf(widgets.map(widget => widget.analyticsDashboardWidgetId), this.sections())) {
      const spans = segment.map(i => natural[i]);
      const smFilled = fillRows(spans.map(span => (span <= 4 ? 6 : 12)));
      const lgFilled = fillRows(spans);
      segment.forEach((at, j) => { sm[at] = smFilled[j]; lg[at] = lgFilled[j]; });
    }
    return new Map(widgets.map((widget, i) => [widget, { sm: sm[i], lg: lg[i] }]));
  });

  spanClass(widget: DashboardWidget): string {
    const filled = this.filledSpans().get(widget);
    const sm = filled?.sm ?? (this.spanOf(widget) <= 4 ? 6 : 12);
    const lg = filled?.lg ?? this.spanOf(widget);
    return `min-w-0 ${SM_SPAN[sm] ?? 'sm:col-span-12'} ${LG_SPAN[lg] ?? 'lg:col-span-12'}`;
  }

  /** How many rows the tile's table draws: TILE_ROWS, or all of them once "Show all" is pressed. */
  rowLimit(widget: DashboardWidget): number {
    const id = widget.analyticsDashboardWidgetId;
    return id !== undefined && this.expanded().has(id) ? Number.MAX_SAFE_INTEGER : TILE_ROWS;
  }

  /**
   * How many rows a drawn table or cross-tab has in all, when that is more than a tile shows, and
   * so whether "Show all N" is offered. Zero for the charts, which draw every mark already.
   */
  hiddenRowTotal(view: WidgetView, kind: WidgetVisualization): number {
    const total = kind === 'pivot' ? (view.pivot?.rows?.length ?? 0)
      : kind === 'table' ? view.rows.length : 0;
    return total > TILE_ROWS ? total : 0;
  }

  isExpanded(widget: DashboardWidget): boolean {
    return this.rowLimit(widget) > TILE_ROWS;
  }

  toggleRows(widget: DashboardWidget): void {
    const id = widget.analyticsDashboardWidgetId;
    if (id === undefined) return;
    this.letGoOf(widget);
    this.expanded.update(open => {
      const next = new Set(open);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ---- adding and removing a widget -------------------------------------------------------

  openAdd(): void {
    this.addOpen.set(true);
    this.addError.set('');
    this.addTitle.set('');
    this.addSourceId.set('');
    this.addVisualization.set('table');
    this.previewRun?.unsubscribe();
    this.addPreview.set(null);
    this.addHeight.set('');
    this.addCaption.set('');
  }

  pickSourceKind(kind: string): void {
    this.addKindOfSource.set(kind === 'query' ? 'query' : 'analysis');
    // The id belongs to the list it came from. Carrying it across would point the widget at
    // whatever saved query happens to share a number with the analysis that was chosen.
    this.chooseAddSource('');
  }

  addWidget(): void {
    const board = this.board();
    if (!this.canAdd() || !board?.analyticsDashboardId) return;
    const sourceId = Number(this.addSourceId());
    if (!Number.isFinite(sourceId) || sourceId <= 0) return;
    this.adding.set(true);
    this.addError.set('');
    this.analytics.saveWidget({
      analyticsDashboardId: board.analyticsDashboardId,
      widgetTitle: this.addTitle().trim(),
      // Exactly one, decided here rather than sent as both and refused: the server would answer
      // with a sentence this screen already knew, which is a round trip that teaches nobody
      // anything.
      analyticsAnalysisId: this.addKindOfSource() === 'analysis' ? sourceId : null,
      analyticsQueryId: this.addKindOfSource() === 'query' ? sourceId : null,
      visualizationType: this.addVisualization(),
      // Null when the author typed neither, so an untouched tile stores no config rather than
      // a document restating the defaults.
      widgetConfig: widgetConfigString({
        height: this.addHeight() ? Number(this.addHeight()) : undefined,
        caption: this.addCaption(),
      }),
      displayOrder: this.widgets().length,
    }).subscribe({
      next: response => {
        this.adding.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.addError.set(response.message || 'The widget could not be added.');
          return;
        }
        this.addOpen.set(false);
        const added = response.data.analyticsDashboardWidgetId;
        // Only the new tile runs. Re-running the board to show one addition would spend a permit
        // per existing widget to redraw figures already on screen.
        this.loadBoard(board.analyticsDashboardId!, added ? [added] : null);
      },
      error: err => {
        this.adding.set(false);
        this.addError.set(err?.error?.message || 'The widget could not be added.');
      },
    });
  }

  async removeWidget(widget: DashboardWidget): Promise<void> {
    const id = widget.analyticsDashboardWidgetId;
    const boardId = this.board()?.analyticsDashboardId;
    if (!id || !boardId) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Remove this widget?',
      body: `"${widget.widgetTitle}" will be removed from this dashboard. What it points at — `
        + 'the saved analysis or saved query — is untouched.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteWidget(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.widgetError.set(response.message || 'The widget could not be removed.');
          return;
        }
        this.runs.update(runs => {
          const next = { ...runs };
          delete next[id];
          return next;
        });
        // Reloaded without running: the tiles that are still there are showing results that are
        // no less true than they were a moment ago.
        this.loadBoard(boardId, null);
      },
      error: err => {
        this.widgetError.set(err?.error?.message || 'The widget could not be removed.');
      },
    });
  }

  /**
   * Changes how a tile is drawn. RUNS NOTHING.
   *
   * The result already in hand is drawn a different way and the choice is saved, which is the
   * whole reason a widget is a reference plus a visualization rather than a stored picture. A
   * kind change that re-queried would make picking a chart cost a permit.
   */
  setVisualization(widget: DashboardWidget, kind: string): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id || kind === widget.visualizationType) return;
    this.widgetError.set('');
    this.letGoOf(widget);
    // Chosen from the tile's menu, whose tick follows the saved kind: a refusal changes nothing
    // on the widget, so the tick stays where it was without being put back by hand.
    this.analytics.saveWidget({ ...widget, visualizationType: kind }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.widgetError.set(response.message || 'That choice could not be saved.');
          return;
        }
        const saved = response.data;
        this.board.update(board => board ? {
          ...board,
          widgets: (board.widgets ?? []).map(item =>
            item.analyticsDashboardWidgetId === id ? { ...item, ...saved } : item),
        } : board);
      },
      error: err => {
        this.widgetError.set(err?.error?.message || 'That choice could not be saved.');
      },
    });
  }

  // ---- chart settings, themes, and choosing with a preview -------------------------------

  /**
   * Each widget's chart settings, parsed once per change to the board rather than per change
   * detection: a fresh object on every pass would hand every tile a "new" input and rebuild every
   * chart's option each time anything on the page moved.
   */
  private readonly widgetSettings = computed(() => new Map(this.widgets().map(widget =>
    [widget.analyticsDashboardWidgetId, parseSettings(widgetConfigOf(widget).chart)] as const)));

  private static readonly NO_SETTINGS: ChartSettings = {};

  settingsOf(widget: DashboardWidget): ChartSettings {
    return this.widgetSettings().get(widget.analyticsDashboardWidgetId) ?? Dashboards.NO_SETTINGS;
  }

  /** The board's theme, from its dashboard_config; null is the console's own. */
  readonly boardTheme = computed(() => parseBoardSettings(this.board()?.dashboardConfig).theme ?? null);
  readonly boardThemeLabel = computed(() => themeLabel(this.boardTheme()));

  // ---- the tile menu's "Show as" grid ------------------------------------------------------

  /** What the open tile menu's search box holds. One menu is open at a time, so one is enough. */
  readonly kindQuery = signal('');
  /** Whether the open menu shows the categories in which nothing fits this result. */
  readonly kindShowMisfits = signal(false);
  private readonly injector = inject(Injector);

  /** The menu for one tile's result: suggestions, then every kind by category (charts/kind-menu.ts). */
  kindMenuOf(widget: DashboardWidget, view: WidgetView): KindMenu {
    return kindMenu(view, this.drawn(widget, view), this.kindQuery(), this.kindShowMisfits());
  }

  kindIcon(id: string): string {
    return KIND_ICONS[id as WidgetVisualization] ?? '';
  }

  lowerFirst(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  /**
   * A tile menu opened: an empty search, the folded groups folded, and -- when it was opened with
   * the pointer, which leaves the focus on the trigger outside the overlay -- the focus on the
   * panel, so that typing goes to the search at once.
   */
  kindMenuOpened(): void {
    this.kindQuery.set('');
    this.kindShowMisfits.set(false);
    afterNextRender(() => {
      const panel = document.querySelector<HTMLElement>('.dash-menu-panel');
      if (panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }, { injector: this.injector });
  }

  /**
   * The keyboard inside a tile menu. The CDK menu moves up and down a list; the kinds are a grid,
   * with a search box among them, so this takes the arrows, Home and End before the menu sees
   * them. Escape and Tab still reach the menu, which closes; Enter and Space reach the item under
   * the focus, which applies it.
   *
   *   - a printable key anywhere but the search box goes to the search box;
   *   - in the search box, every key stays there, except Down/Enter/Tab (to the first tile) and
   *     Up/Shift+Tab (to the item above);
   *   - on a tile, Left/Right step through the tiles in reading order, Up/Down move a row by
   *     position (the suggestions are three across, the rest four), Home/End go to the ends;
   *     past the first row Up goes to the search box, past the last Down to the actions below;
   *   - on any other item, Up/Down step through the panel's stops in order.
   */
  kindMenuKey(event: KeyboardEvent): void {
    const panel = event.currentTarget as HTMLElement;
    const target = event.target as HTMLElement;
    const search = panel.querySelector<HTMLInputElement>('.dash-kind-search');
    if (event.key === 'Escape') return;
    // Everything rendered is on offer: a folded group is not rendered at all, rather than hidden.
    const stops = [...panel.querySelectorAll<HTMLElement>('.menu-item, .dash-kind-search, .dash-tile, .dash-misfits')];
    const tiles = stops.filter(el => el.classList.contains('dash-tile'));
    const go = (el: HTMLElement | undefined) => {
      if (!el) return;
      el.focus({ preventScroll: true });
      el.scrollIntoView?.({ block: 'nearest' });
    };
    const done = () => { event.preventDefault(); event.stopPropagation(); };
    const after = (el: HTMLElement) => stops[stops.indexOf(el) + 1];
    const before = (el: HTMLElement) => stops[stops.indexOf(el) - 1];

    if (search && target === search) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
        go(tiles[0] ?? after(search)); done();
      } else if (event.key === 'ArrowUp' || (event.key === 'Tab' && event.shiftKey)) {
        go(before(search)); done();
      } else {
        // Typing stays in the box: the menu's typeahead would otherwise move the focus to an item.
        event.stopPropagation();
      }
      return;
    }
    if (search && event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      // Written into the box at once, not left to the next change detection: a fast typist's
      // second key would otherwise land in a box still empty and replace the first.
      search.value = this.kindQuery() + event.key;
      search.focus({ preventScroll: true });
      search.setSelectionRange(search.value.length, search.value.length);
      this.kindQuery.set(search.value);
      done();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    const tile = target.closest<HTMLElement>('.dash-tile');
    if (!tile || !tiles.includes(tile)) {
      // The panel itself (opened with the pointer), an action, or the toggle: a list.
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') return;
      const at = stops.indexOf(target);
      go(event.key === 'Home' ? stops[0] : event.key === 'End' ? stops[stops.length - 1]
        : at < 0 ? stops[0]
        : event.key === 'ArrowDown' ? stops[(at + 1) % stops.length] : stops[(at - 1 + stops.length) % stops.length]);
      done();
      return;
    }
    const index = tiles.indexOf(tile);
    if (event.key === 'ArrowRight') go(tiles[index + 1] ?? tile);
    else if (event.key === 'ArrowLeft') go(tiles[index - 1] ?? tile);
    else if (event.key === 'Home') go(tiles[0]);
    else if (event.key === 'End') go(tiles[tiles.length - 1]);
    else {
      // Rows from each grid's own column count (data-cols, the same number its CSS lays out), not
      // from where the tiles are on screen: the part of "All charts" scrolled out of sight is still
      // laid out above or below, and a position read off it would jump into the suggestions.
      const rows: { cells: HTMLElement[]; cols: number }[] = [];
      for (const grid of panel.querySelectorAll<HTMLElement>('.dash-kind-grid')) {
        const cells = [...grid.querySelectorAll<HTMLElement>('.dash-tile')].filter(el => tiles.includes(el));
        const cols = Math.max(1, Number(grid.dataset['cols']) || 1);
        for (let i = 0; i < cells.length; i += cols) rows.push({ cells: cells.slice(i, i + cols), cols });
      }
      const r = rows.findIndex(row => row.cells.includes(tile));
      const next = rows[r + (event.key === 'ArrowDown' ? 1 : -1)];
      if (r < 0 || !next) {
        go(event.key === 'ArrowDown' ? after(tiles[tiles.length - 1]) : before(tiles[0]));
      } else {
        // The same place across the row, as a fraction of it: three across above four still lines up.
        const across = (rows[r].cells.indexOf(tile) + 0.5) / rows[r].cols;
        go(next.cells[Math.min(next.cells.length - 1, Math.floor(across * next.cols))]);
      }
    }
    done();
  }

  /**
   * Sets the theme every tile on the board draws in. RUNS NOTHING: the results in hand are
   * redrawn in the new colours. Stored on the board (dashboard_config), so everybody who opens it
   * sees the same board.
   */
  setBoardTheme(theme: string | null): void {
    const board = this.board();
    if (!board?.analyticsDashboardId || (theme ?? null) === this.boardTheme()) return;
    const config = boardSettingsString({ ...parseBoardSettings(board.dashboardConfig), theme: theme ?? undefined }) ?? '{}';
    const previous = board.dashboardConfig ?? null;
    this.board.update(open => open ? { ...open, dashboardConfig: config } : open);
    this.analytics.saveDashboard({ ...board, dashboardConfig: config }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.board.update(open => open ? { ...open, dashboardConfig: previous } : open);
          this.widgetError.set(response.message || 'The board\'s theme could not be saved.');
        }
      },
      error: err => {
        this.board.update(open => open ? { ...open, dashboardConfig: previous } : open);
        this.widgetError.set(err?.error?.message || 'The board\'s theme could not be saved.');
      },
    });
  }

  /** Opens "Chart settings" for a tile, over the result it already shows. Saving runs nothing. */
  openChartSettings(widget: DashboardWidget, view: WidgetView): void {
    const data: ChartSettingsData = {
      title: widget.widgetTitle, view, kind: this.drawn(widget, view),
      settings: this.settingsOf(widget), boardTheme: this.boardTheme(),
    };
    this.dialog.open<ChartSettings | undefined, ChartSettingsData>(ChartSettingsPanel, sidePanelConfig(data, 'wide'))
      .closed.subscribe(settings => { if (settings) this.saveChartSettings(widget, settings); });
  }

  /** Opens "Choose a chart" for a tile: every kind, drawn from the tile's own result as it is hovered. */
  openKindPicker(widget: DashboardWidget, view: WidgetView): void {
    const data: KindPickerData = {
      title: widget.widgetTitle, view, kind: this.drawn(widget, view),
      settings: this.settingsOf(widget), boardTheme: this.boardTheme(),
    };
    this.dialog.open<string | undefined, KindPickerData>(KindPickerPanel, sidePanelConfig(data, 'wide'))
      .closed.subscribe(kind => { if (kind) this.setVisualization(widget, kind); });
  }

  private saveChartSettings(widget: DashboardWidget, settings: ChartSettings): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id) return;
    this.letGoOf(widget);
    const widgetConfig = widgetConfigString({ ...widgetConfigOf(widget), chart: settings });
    if (widgetConfig === (widget.widgetConfig ?? null)) return;
    this.widgetError.set('');
    this.analytics.saveWidget({ ...widget, widgetConfig }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.widgetError.set(response.message || 'Those chart settings could not be saved.');
          return;
        }
        const saved = response.data;
        this.board.update(board => board ? {
          ...board,
          widgets: (board.widgets ?? []).map(item =>
            item.analyticsDashboardWidgetId === id ? { ...item, ...saved } : item),
        } : board);
      },
      error: err => this.widgetError.set(err?.error?.message || 'Those chart settings could not be saved.'),
    });
  }

  // ---- the add form's preview ---------------------------------------------------------------

  /** The chosen source, run once so the picker can say what fits and draw what is hovered. */
  readonly addPreview = signal<WidgetRun | null>(null);
  private previewRun: Subscription | null = null;

  /**
   * Picks the source a new widget points at, and runs it ONCE for the picker's preview. One
   * query, the same one the tile will run when it is added -- and not run at all until a source
   * is chosen.
   */
  chooseAddSource(id: string): void {
    this.addSourceId.set(id);
    this.previewRun?.unsubscribe();
    this.previewRun = null;
    const sourceId = Number(id);
    if (!id || !Number.isFinite(sourceId) || sourceId <= 0) { this.addPreview.set(null); return; }
    const probe: DashboardWidget = {
      analyticsDashboardId: this.board()?.analyticsDashboardId ?? 0, widgetTitle: 'Preview',
      analyticsAnalysisId: this.addKindOfSource() === 'analysis' ? sourceId : null,
      analyticsQueryId: this.addKindOfSource() === 'query' ? sourceId : null,
    };
    this.addPreview.set({ state: 'running', error: '', view: null, queryId: '' });
    this.previewRun = this.runSource(probe, mintQueryId(0), run => {
      this.addPreview.set(run);
      this.previewRun = null;
      // A kind the new result cannot carry is not left chosen: the form falls back to the table.
      if (run.view?.issues[this.addVisualization()]) this.addVisualization.set('table');
    });
  }

  /**
   * The kind actually drawn: the one saved, unless this result cannot carry it.
   *
   * Falls back to the table rather than to an empty frame, the same way the Canvas's picker
   * moves when a new result takes a chart kind away. A tile saved as a ring whose analysis has
   * since grown forty categories shows the rows and says why the ring is unavailable, which is a
   * fact about the data rather than a fault of the board.
   */
  /**
   * The kind actually drawn: what the widget asked for, or the table when it cannot be honoured.
   *
   * The membership test reads KINDS rather than naming the kinds, which is the bug this line
   * used to have. It listed the four that existed when it was written, so every kind added after
   * it was accepted by the picker, stored on the widget, shown as selected -- and silently drawn
   * as a table. The picker and the drawing disagreed, and the picker was the one telling the
   * truth. A list that must be edited in two places to add one kind is a list that will be
   * edited in one.
   *
   * Falling back to the table when a kind CANNOT draw this result is deliberate and stays: a
   * saved widget outlives the data it was built on, and a tile whose analysis has since returned
   * forty groups should show them rather than an empty ring.
   */
  /**
   * Opens every row of a result the tile could only show the first few of.
   *
   * Reads runs()[id].view and nothing else. No request is issued and no permit is taken: these
   * rows arrived with the run that drew the tile. Nothing is written back to the widget either --
   * a widget stores a reference and never a result, and this does not make the board a cache;
   * the rows die with the open board exactly as they did before.
   */
  expandTable(widget: DashboardWidget, view: WidgetView): void {
    this.dialog.open(WidgetTableDialog, {
      hasBackdrop: true,
      data: {
        title: widget.widgetTitle,
        columns: view.columns,
        rows: view.rows,
        measureColumn: view.measureColumn,
        rowCount: view.rowCount,
        // Carried through, not dropped: an expanded table is the one place a result the server
        // cut short would otherwise read as the whole thing.
        truncated: view.truncated,
        notes: view.notes,
      } as WidgetTableData,
    });
  }

  /**
   * The rows the tile itself draws.
   *
   * The cut moved here from the view builders so that view.rows is the whole result. A tile is a
   * postcard and five rows is what fits on it; everything else is one click away rather than
   * gone.
   */
  tileRows(view: WidgetView, limit = TILE_ROWS): (string | null)[][] {
    return view.rows.slice(0, limit);
  }

  /** Whether this result has rows the tile is not showing. */
  hasMoreRows(view: WidgetView): boolean {
    return view.rows.length > TILE_ROWS;
  }

  /**
   * How tall this tile's drawing is, in px.
   *
   * Clamped on read rather than trusted, because the stored value is a JSON document a widget
   * carries around and nothing server-side validates: a height of 4, of 40000, or of "tall"
   * reaches this method exactly as a legitimate one does.
   */
  heightOf(widget: DashboardWidget): number {
    const asked = widgetConfigOf(widget).height;
    if (typeof asked !== 'number' || !Number.isFinite(asked)) {
      return kindInfo(widget.visualizationType)?.engine === 'echarts' ? ECHART_HEIGHT : WIDGET_HEIGHT;
    }
    return Math.min(WIDGET_HEIGHT_MAX, Math.max(WIDGET_HEIGHT_MIN, Math.round(asked)));
  }

  /** Whether the author set this tile's height; when not, horizontal bars may grow to fit theirs. */
  hasOwnHeight(widget: DashboardWidget): boolean {
    const asked = widgetConfigOf(widget).height;
    return typeof asked === 'number' && Number.isFinite(asked);
  }

  /** The author's own sentence under a tile, or '' when they wrote none. Never invented. */
  captionOf(widget: DashboardWidget): string {
    const caption = widgetConfigOf(widget).caption;
    return typeof caption === 'string' ? caption.trim() : '';
  }

  /**
   * Why a tile draws a table rather than the kind it was saved as, or '' (MIG-367).
   *
   * drawn() falls back to the table whenever the saved kind cannot draw this result, and said nothing: a saved query
   * chosen as a ring, a pareto, a treemap or a stack came up as a table with no word why. A saved statement cannot say
   * whether its figures add up -- `select avg(x)` and `select sum(x)` look the same -- so every part-of-a-whole kind is
   * refused there, honestly; the tile now says so, and what would draw it.
   */
  fallbackNote(widget: DashboardWidget, view: WidgetView): string {
    const asked = (widget.visualizationType ?? 'table') as WidgetVisualization;
    if (asked === 'table' || !KINDS.some(kind => kind.id === asked)) return '';
    const why = (view.issues[asked] ?? '').trim();
    if (!why) return '';
    const label = (kindInfo(asked)?.label ?? asked).toLowerCase();
    const fix = /saved query does not say/.test(why)
      ? ' Save it as an analysis that sums or counts to draw it this way.' : '';
    return `Shown as a table, not as ${label}: ${this.lowerFirst(why).replace(/\.?$/, '.')}${fix}`;
  }

  drawn(widget: DashboardWidget, view: WidgetView): WidgetVisualization {
    const asked = (widget.visualizationType ?? 'table') as WidgetVisualization;
    if (!KINDS.some(kind => kind.id === asked)) {
      return 'table';
    }
    return view.issues[asked] ? 'table' : asked;
  }

  /**
   * How much of the result is on the tile, said plainly -- and it depends on what is drawn.
   *
   * The table shows five rows until "Show all" is pressed (limit); the charts draw every mark.
   * Counting the table's rows either way put "8 of 24 rows shown" under a bar chart with twenty-four bars in it, which tells a reader
   * they are looking at a third of the data while they are looking at all of it. The opposite
   * mistake is worse, so this counts what the drawn kind actually renders.
   */
  counted(view: WidgetView, kind: WidgetVisualization, limit = TILE_ROWS, settings: ChartSettings = {}): string {
    if (!view.rowCount) return 'No rows.';
    // A single figure renders the whole result and has no marks at all -- an analysis with no
    // dimension produces none. Counting marks there printed "0 of 1 rows shown" under a tile
    // displaying that one row in 30-point type.
    // view.rows is now the WHOLE result, so a table's shown count is the tile's cut and not the
    // length of the array. Reading rows.length here would have printed "500 of 500 rows" under a
    // tile displaying eight of them.
    //
    /*
     * A cross-tab is counted in its own units.
     *
     * It has no marks, so this printed "0 of 24 rows shown" under a grid that was showing all
     * twenty-four. Counting it in source rows is no better: the grid's rows are GROUPS, and a
     * cross-tab of four regions over six months says nothing about the 150,000 rows behind it.
     */
    if (kind === 'pivot') {
      const groups = view.pivot?.rows?.length ?? 0;
      const drawnGroups = Math.min(groups, limit);
      return drawnGroups < groups
        ? `${drawnGroups.toLocaleString()} of ${groups.toLocaleString()} groups shown`
        : `${groups.toLocaleString()} ${groups === 1 ? 'group' : 'groups'}`;
    }
    // An ECharts kind draws the rows themselves, not the marks: the marks merge every row sharing a label into one, so a
    // line of five cities over fourteen days counted fifteen of its seventy points (MIG-367). rowsDrawn says how many.
    const echarts = kindInfo(kind)?.engine === 'echarts';
    const shown = kind === 'table' ? Math.min(view.rows.length, limit)
      : kind === 'kpi' ? Math.min(1, view.rowCount)
      : echarts ? rowsDrawn(view.chart ?? tableOf(view, { additive: view.additive }), kind as EChartKind, settings)
      : view.marks.length;
    return shown < view.rowCount
      ? `${shown.toLocaleString()} of ${view.rowCount.toLocaleString()} rows shown`
      : `${view.rowCount.toLocaleString()} ${view.rowCount === 1 ? 'row' : 'rows'}`;
  }

  // ---- running the board, one widget at a time --------------------------------------------

  runAll(): void {
    if (!this.board()) return;
    this.abandon();
    this.pending = 'all';
    // Every table widget reads its first page again too: it pages itself (board/board-table.ts), outside the queue.
    this.tableEpoch.update(n => n + 1);
    this.start();
  }

  runOne(widget: DashboardWidget): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id) return;
    if (this.pagedTable(widget)) {
      this.tableBumps.update(all => ({ ...all, [id]: (all[id] ?? 0) + 1 }));
      return;
    }
    if (this.queue().includes(id) || this.runningIds().includes(id)) return;
    const idle = !this.runningIds().length && !this.queue().length;
    // Appended rather than jumped in front of: a queue that reordered itself under a click would
    // make "run this one" mean "and stop that one", which is a second action nobody asked for.
    this.queue.update(queue => [...queue, id]);
    this.batch.update(size => idle ? 1 : size + 1);
    this.mark(id, { state: 'queued', error: '', view: null, queryId: '' });
    this.next(this.epoch);
  }

  /**
   * Stops the board: nothing else starts, and the one in flight is cancelled.
   *
   * The cancellation is answered the same way whether the run finished a moment ago, never
   * existed or belongs to somebody else -- the server refuses to distinguish those, because
   * telling them apart would confirm that an id is live in another workspace. So there is
   * nothing here to interpret: the screen stops waiting either way.
   */
  stopRun(): void {
    const current = [...this.runningIds()];
    const queryIds = current.map(id => this.runs()[id]?.queryId ?? '').filter(Boolean);
    const waiting = [...this.queue()];
    this.abandon();
    for (const id of [...waiting, ...current]) {
      this.mark(id, { state: 'stopped', error: '', view: null, queryId: '' });
    }
    for (const queryId of queryIds) {
      this.analytics.cancel(queryId).subscribe({ next: () => {}, error: () => {} });
    }
  }

  /** Everything in flight is disowned and the queue is emptied. No tile is touched. */
  private abandon(): void {
    this.epoch++;
    this.queue.set([]);
    this.batch.set(0);
    this.runningIds.set([]);
    this.pending = null;
    this.inFlight.forEach(subscription => subscription.unsubscribe());
    this.inFlight.clear();
    this.retried.clear();
  }

  /**
   * Starts the queue a board asked for, once its sources have arrived.
   *
   * The wait is not optional: a widget names a saved analysis by id, and running it needs that
   * analysis's connection, path and configuration. Starting before the lists landed would fail
   * every tile with "the analysis this points at is not in this workspace", which is a sentence
   * that would be false.
   */
  private start(): void {
    const pending = this.pending;
    if (pending === null || !this.sourcesReady()) return;
    this.pending = null;
    // A table widget pages itself and is not queued (pagedTable).
    const ids = (pending === 'all'
      ? this.widgets().map(widget => widget.analyticsDashboardWidgetId).filter(
          (id): id is number => typeof id === 'number')
      : pending).filter(id => !this.tableSources().has(id));
    this.runStartedAt = performance.now();
    this.loadMs.set(null);
    if (pending === 'all') {
      // Each table is reading its first page again: counted as running until it says otherwise.
      this.tableReads.set(Object.fromEntries([...this.tableSources().keys()].map(id => [id, { state: 'running' as const }])));
    }
    if (!ids.length) return;
    this.epoch++;
    this.queue.set(ids);
    this.batch.set(ids.length);
    for (const id of ids) {
      this.mark(id, { state: 'queued', error: '', view: null, queryId: '' });
    }
    this.next(this.epoch);
  }

  /**
   * Starts widgets off the queue until BOARD_PARALLEL are running (owner 2026-10-12: tiles load in parallel).
   *
   * Three at once, not all: every analytics query passes one fair semaphore of four permits shared with every other
   * reader and the ETL work, so a board holds at most three of them and leaves one free however many tiles it has. A
   * tile the governor turns away for being busy is put back at the head of the queue once, a moment later, rather
   * than shown as an error for a wait of a second.
   */
  private next(epoch: number): void {
    if (epoch !== this.epoch) return;
    while (this.runningIds().length < BOARD_PARALLEL && this.queue().length) {
      const [id, ...rest] = this.queue();
      this.queue.set(rest);
      const widget = this.widgets().find(item => item.analyticsDashboardWidgetId === id);
      // The board changed under the queue: nothing to run and nothing to report on a tile that is not there any more.
      if (!widget) continue;
      this.runningIds.update(ids => [...ids, id]);
      /*
       * A tile that throws must fail alone: whatever one tile's saved setup does, the other tiles still run (dashboard
       * "15 Regional analysis" once stopped dead on one tile marked running for ever).
       */
      try {
        this.run(widget, id, epoch);
      } catch (thrown) {
        // The exception goes to the console and never onto the tile: its message is minified code.
        console.error(`Dashboard widget ${id} could not be prepared`, thrown);
        this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
          error: `"${widget.widgetTitle}" could not be run: something in its saved setup is not in a `
            + 'shape this page can read. Open it in the Analytics Studio and save it again.' });
      }
    }
  }

  private run(widget: DashboardWidget, id: number, epoch: number): void {
    const queryId = mintQueryId(id);
    const started = performance.now();
    this.mark(id, { state: 'running', error: '', view: null, queryId });
    const subscription = this.runSource(widget, queryId,
      run => this.settle(id, epoch, this.decorate({ ...run, ms: Math.round(performance.now() - started) })));
    if (subscription && this.runningIds().includes(id)) this.inFlight.set(id, subscription);
  }

  /**
   * A saved query's marks given the operands a click on them sets, where their label column is one of the board's
   * filters (withCrossFilterOperands): its bar or slice can then narrow the board. An analysis's marks carry their own.
   */
  private decorate(run: WidgetRun): WidgetRun {
    const defs = this.filterDefs();
    if (!run.view || !defs.length) return run;
    const marks = withCrossFilterOperands(run.view.marks, run.view.columns[0], defs);
    return marks === run.view.marks ? run : { ...run, view: { ...run.view, marks } };
  }

  /**
   * Runs what a widget points at and hands the outcome to `done`: a view, or the reason there is
   * none. The board's queue and the add form's preview both run a source through here, so a
   * preview is the same question, with the same filters, as the tile it would become.
   */
  private runSource(widget: DashboardWidget, queryId: string, done: (run: WidgetRun) => void): Subscription | null {
    if (widget.analyticsAnalysisId) {
      const saved = this.analyses().find(
        item => item.analyticsAnalysisId === widget.analyticsAnalysisId);
      if (!saved) {
        done({ state: 'failed', view: null, queryId: '',
          error: 'The saved analysis this widget points at is not in this workspace.' });
        return null;
      }
      let config: SavedAnalysisConfig;
      try {
        config = JSON.parse(saved.analysisConfig ?? '{}');
      } catch {
        // Nothing is sent. A configuration that will not parse cannot be half-applied into a
        // request: a tile running the dimensions without the filters would answer a different
        // question under the same title.
        done({ state: 'failed', view: null, queryId: '',
          error: `"${saved.analysisName}" cannot be run: its saved configuration is not readable.` });
        return null;
      }
      const aggregation = config.measure?.aggregation ?? 'COUNT_ROWS';
      const request: AnalysisRequest = {
        connection: saved.connectionAlias,
        path: saved.datasetPath,
        dimensions: config.dimensions ?? [],
        measure: { aggregation, field: config.measure?.field },
        queryId,
      };
      /*
       * The saved filters and the board's, ANDed. boardFilterFor returns null unless this widget
       * reads the dataset the bar is written against -- see boardFilterOn.
       */
      const applied = combineFilters(config.filters, this.boardFilterFor(saved));
      if (applied) request.filters = applied;
      if (config.topN) request.topN = config.topN;
      if (config.sort) request.sort = config.sort;
      // Only when something is actually grained -- the same rule the request builder applies, and
      // for the same reason: a list of nulls is a request that LOOKS grained to anything reading
      // it back. A config saved before grains existed has no key here at all.
      if (config.grains && config.grains.some(grain => !!grain)) {
        request.grains = config.grains;
      }
      // The board's filter bar, applied by the server to the dataset before the analysis reads it.
      const boardFilters = this.filterWire();
      if (boardFilters.length) request.boardFilters = boardFilters;
      return this.analytics.analyze(request).subscribe({
        next: response => {
          if (response.status !== API_SUCCESS || !response.data) {
            done({ state: 'failed', view: null, queryId,
              error: response.message || 'That analysis could not be run.' });
            return;
          }
          done({ state: 'done', error: '', queryId, outcomes: response.data.boardFilters,
            view: analysisView(response.data, aggregation, {
              sortedBy: config.sort?.by ?? 'MEASURE',
              // The direction travels with the axis. Without it a dimension sorted Z-A looked
              // the same to the gate as one sorted A-Z, and the tile offered a line that ran
              // backwards through time.
              sortDirection: config.sort?.direction ?? 'DESC',
              topNTrimmed: !!config.topN && config.topN.includeOther === false,
              hasPivot: !!response.data.pivot && !!response.data.pivot.rows,
              pivotTruncated: !!response.data.pivot?.columnsTruncated,
              dimensionCount: (config.dimensions ?? []).length,
            }) });
        },
        error: err => {
          done({ state: 'failed', view: null, queryId,
            error: err?.error?.message || 'That analysis could not be run.' });
        },
      });
      return null;
    }

    const saved = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    if (!saved) {
      done({ state: 'failed', view: null, queryId: '',
        error: 'The saved query this widget points at is not in this workspace.' });
      return null;
    }
    return this.analytics.query({
      connection: saved.connectionAlias,
      path: saved.datasetPath,
      sql: saved.queryText,
      // The SECOND dataset, forwarded so a tile over a saved JOIN runs the query that was saved.
      //
      // This line is its own bug, not a consequence of the save path's. Even after the Studio
      // learned to store a second dataset and the table learned to hold one, a tile read the
      // first pair off the row and posted a one-dataset body -- so the engine registered no
      // `dataset2` and the widget sat permanently red with a DuckDB catalog error. Sent as a
      // pair, because the server refuses a half.
      connection2: saved.secondDatasetPath ? saved.secondConnectionAlias : undefined,
      path2: saved.secondDatasetPath || undefined,
      queryId,
      boardFilters: this.filterWire(),
    }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          done({ state: 'failed', view: null, queryId,
            error: response.message || 'That query could not be run.' });
          return;
        }
        done({ state: 'done', error: '', queryId, outcomes: response.data.boardFilters,
          view: queryView(response.data, widgetConfigOf(widget).additive) });
      },
      error: err => {
        done({ state: 'failed', view: null, queryId,
          error: err?.error?.message || 'That query could not be run.' });
      },
    });
  }

  /**
   * Records what became of one run and moves the queue on.
   *
   * A response from a previous epoch is DROPPED rather than applied: it was read for a board or
   * a pass the reader has already left, and putting it on a tile would date-stamp somebody
   * else's question with this moment.
   */
  private settle(id: number, epoch: number, run: WidgetRun): void {
    if (epoch !== this.epoch) return;
    this.inFlight.delete(id);
    if (run.state === 'failed' && BUSY.test(run.error) && !this.retried.has(id)) {
      // The governor was full for a moment: once more, at the head of the queue, after a breath. The tile keeps its
      // place among the running meanwhile, so the board does not read as finished while it waits.
      this.retried.add(id);
      setTimeout(() => {
        if (epoch !== this.epoch) return;
        this.runningIds.update(ids => ids.filter(running => running !== id));
        this.queue.update(queue => [id, ...queue]);
        this.next(epoch);
      }, 700);
      return;
    }
    this.runningIds.update(ids => ids.filter(running => running !== id));
    this.mark(id, run);
    this.next(epoch);
  }

  private mark(id: number, run: WidgetRun): void {
    this.runs.update(runs => {
      const old = runs[id];
      const waiting = run.state === 'queued' || run.state === 'running';
      const previous = waiting && !run.view ? (old?.view ?? old?.previous ?? null) : null;
      return { ...runs, [id]: previous ? { ...run, previous } : run };
    });
  }

  /** What a tile draws: the run's result, or -- while it re-runs -- the one it had. */
  shownView(run: WidgetRun | undefined): WidgetView | null {
    return run?.view ?? run?.previous ?? null;
  }

  /** Whether a tile is re-running over a result it still shows. */
  updating(run: WidgetRun | undefined): boolean {
    return !!run && !run.view && !!run.previous && (run.state === 'queued' || run.state === 'running');
  }

  // ---- small renderings -------------------------------------------------------------------

  /**
   * A saved time as the console writes one: "19 Sep 2026, 09:53". The server sends Chicago
   * wall-clock with no offset, which the serverTime pipe reads as such; a bare Date would have
   * read it as the viewer's own local time, in the browser's own format.
   */
  when(raw: string | undefined): string {
    if (!raw) return '';
    return this.timeOf(raw, 'dateTime');
  }

  /** The time a tile ran, to the second: a figure with no time against it is a figure on trust. */
  clock(at: number): string {
    return this.timeOf(new Date(at), 'timeSec');
  }
}

/**
 * A saved work's name without the board's own name in front of it ("Riverside — Patient 360 — Risk level" on that
 * board is "Risk level"): the board says it once, in its header.
 */
export function withoutBoardName(name: string | null | undefined, board: string | null | undefined): string {
  const n = (name ?? '').trim();
  const b = (board ?? '').trim();
  if (!b || !n.startsWith(b)) return n;
  const rest = n.slice(b.length).replace(/^\s*[—–:\-·|]\s*/, '').trim();
  return rest || n;
}

/** A viewer's starred board ids; anything unreadable is none. */
export function readFavourites(key: string): ReadonlySet<number> {
  try {
    const saved = JSON.parse(localStorage.getItem(key) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id: unknown) => typeof id === 'number') : []);
  } catch { return new Set(); }
}

export interface DashboardGroup { key: string; label: string; items: Dashboard[]; }

/** Favourites first, then one group per feeding pipeline (by name), then the rest -- each in the list's own order. */
export function groupDashboards(items: Dashboard[], favourites: ReadonlySet<number>, pipelines: ReadonlyMap<number, string[]>): DashboardGroup[] {
  const groups: DashboardGroup[] = [];
  const favs = items.filter(i => i.analyticsDashboardId != null && favourites.has(i.analyticsDashboardId));
  if (favs.length) groups.push({ key: 'favourites', label: 'Favourites', items: favs });
  const rest = items.filter(i => !favs.includes(i));
  if (!pipelines.size) {
    if (rest.length) groups.push({ key: 'all', label: favs.length ? 'All dashboards' : '', items: rest });
    return groups;
  }
  const byPipeline = new Map<string, Dashboard[]>();
  const none: Dashboard[] = [];
  for (const item of rest) {
    const first = pipelines.get(item.analyticsDashboardId ?? -1)?.[0];
    if (first) byPipeline.set(first, [...(byPipeline.get(first) ?? []), item]); else none.push(item);
  }
  for (const name of [...byPipeline.keys()].sort((a, b) => a.localeCompare(b))) {
    groups.push({ key: 'pipeline:' + name, label: name, items: byPipeline.get(name)! });
  }
  if (none.length) groups.push({ key: 'none', label: byPipeline.size ? 'Not fed by a pipeline' : 'All dashboards', items: none });
  return groups;
}
