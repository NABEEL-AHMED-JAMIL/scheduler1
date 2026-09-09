import { Component, OnDestroy, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Subscription } from 'rxjs';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { confirmWith } from '../../shared/ui/confirm';
import { BarChart } from '../../shared/charts/bar-chart';
import { Donut } from '../../shared/charts/donut';
import { RankedBar } from '../../shared/charts/ranked-bar';
import { isNumericType } from './filter-builder';
import {
  Aggregation, AnalysisColumn, AnalysisRequest, AnalysisResult, AnalysisSort, AnalyticsService,
  Dashboard, DashboardWidget, FilterGroup, QueryResult, RegisteredDataset, SavedAnalysis,
  SavedQuery, TopN, WidgetVisualization,
} from './analytics.service';

/**
 * One mark on a chart.
 *
 * One type for all three categorical charts because all three already agree on it: Bar, Slice
 * and RankedItem each read `name` and `value` and nothing else that a widget sets. A shape per
 * chart would be three conversions of the same two fields, and the first divergence between them
 * would be a tile whose ring and whose bars disagree about a total.
 */
export interface Mark { name: string; value: number; }

/** Rows a tile shows. The count printed under them is the WHOLE result's, never this. */
const WIDGET_ROWS = 8;

/**
 * Six slices, sixty bars.
 *
 * The same two limits the Canvas keeps and for the same reasons, which are facts about the
 * palette and the label width rather than about a dashboard: Donut and RankedBar colour their
 * marks `var(--chart-N % 6)`, so a seventh slice repeats the first one's colour and the legend
 * then has two names against one swatch. Sixty bars is where a name under a bar stops fitting.
 */
const DONUT_SLICES = 6;
const ORDERED_BARS = 60;

/**
 * Aggregations whose parts add up to their whole.
 *
 * The list that decides whether a ring is allowed on a tile. A sum of sums is the sum; a sum of
 * averages is nothing at all, so a slice labelled "12%" over a column of averages is a figure
 * this screen would have invented. Identical to the Canvas's ADDITIVE and deliberately so --
 * MINIMUM and MAXIMUM are excluded from both even though they compose, because the minimum of
 * the minimums is a real figure that is still not a PART of anything.
 */
const ADDITIVE: Aggregation[] = ['COUNT_ROWS', 'COUNT_NON_NULL', 'SUM'];

/** A DATE column, and not a TIMESTAMP: only one of the two has no time to lose. */
const DATE_ONLY_TYPE = /^DATE$/i;

/**
 * A statistic as a number, or null when it is not one.
 *
 * Every cell crosses the wire as text, so "does this parse" is the only honest test of whether
 * arithmetic applies to it. A failure is not an error -- it is how a date column says it has no
 * length to draw.
 */
function asNumber(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = String(text).trim();
  // Number('') is 0, which would turn an absent value into a measured zero.
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * Scientific notation expanded back into a decimal, on the string and never through a float.
 *
 * <b>This is a SECOND COPY of analytics.ts's plainDecimal, and the copy is deliberate.</b> The
 * rule cannot be imported from there: the next pass reaches these components from the Studio's
 * own tab strip, which makes analytics.ts import this file, and importing back would close a
 * cycle between two component modules. It cannot move to a shared file either without editing
 * analytics.ts, which this pass does not own.
 *
 * A duplicated rule is exactly the drift this codebase warns about, so the duplication is pinned:
 * dashboard.spec.ts imports BOTH copies and asserts they agree on the same inputs, including the
 * measured defect this exists for -- `sum(amount)` returning "7.466125E7" for 74,661,250, which
 * a reader glancing at a tile reads as seven point something. When either copy is next touched,
 * the pair belongs in a shared file.
 */
export function plainDecimal(text: string): string {
  const trimmed = text.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/.exec(trimmed);
  if (!match) return text;
  const [, sign, whole, fraction = '', exponentText] = match;
  const exponent = Number(exponentText);
  const digits = whole + fraction;
  const point = whole.length + exponent;
  if (point <= 0) return `${sign}0.${'0'.repeat(-point)}${digits}`;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length);
  return `${sign}${digits.slice(0, point)}.${digits.slice(point)}`;
}

/**
 * A DATE rendered as a date. The second copy of analytics.ts's dateOnly -- see plainDecimal.
 *
 * The zero time is required for the trim. A value carrying a real time under a column typed DATE
 * is a contradiction between the type and the value, and a contradiction should be shown rather
 * than tidied away.
 */
export function dateOnly(text: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})[T ]00:00(?::00(?:\.0+)?)?$/.exec(text.trim());
  return match ? match[1] : text;
}

/** One cell of an analysis result, rendered as what its column says it is. */
function renderCell(column: AnalysisColumn | undefined, raw: string | null): string | null {
  if (raw === null || raw === undefined) return null;
  if (!column) return raw;
  if (DATE_ONLY_TYPE.test(column.type ?? '')) return dateOnly(raw);
  if (isNumericType(column.type)) return plainDecimal(raw);
  return raw;
}

/**
 * Marks with duplicate labels added together, and a count of how many rows that swallowed.
 *
 * Not a tidy-up. RankedBar tracks its rows by name and Donut tracks its segments by name, so two
 * marks called "north" is a duplicate-key error rather than a chart. Merging is the only way to
 * draw them, and adding is the only merge that makes sense for the counts and totals a grouped
 * result carries -- but it is WRONG for an average, and only the reader knows which they saved.
 * So the count comes back and the tile says so whenever it is not zero.
 */
function mergeMarks(pairs: Mark[]): { marks: Mark[]; merged: number } {
  const byName = new Map<string, Mark>();
  for (const pair of pairs) {
    const existing = byName.get(pair.name);
    if (existing) existing.value += pair.value;
    else byName.set(pair.name, { name: pair.name, value: pair.value });
  }
  // Insertion order is the result's own order, which is what "bars in order" is for: a saved
  // analysis sorted by month has already said how its categories should read.
  return { marks: [...byName.values()], merged: pairs.length - byName.size };
}

/**
 * What one tile is showing, built ONCE when its result lands.
 *
 * Pre-rendered rather than computed in the template, because a template that formatted its own
 * cells would re-render every one of them on every change-detection pass -- and a board is many
 * tiles deep. It also means the notes, the marks and the rows are all derived from the same
 * response at the same instant, so nothing on a tile can be a note about a result that has since
 * been replaced.
 *
 * THERE IS NO PATH FROM HERE BACK TO THE SERVER. A view is thrown away and rebuilt on the next
 * run; it is never saved, and nothing about it is written to the widget row.
 */
export interface WidgetView {
  columns: string[];
  /** At most WIDGET_ROWS of them. A null cell is a real null, not an empty string. */
  rows: (string | null)[][];
  /** Rows in the WHOLE result. `rows.length` is what fitted on the tile. */
  rowCount: number;
  /** True when the result stopped at the server's row ceiling -- a partial answer. */
  truncated: boolean;
  marks: Mark[];
  /** Everything the figures on this tile cannot say about themselves. */
  notes: string[];
  /** Why each kind cannot draw THIS result, or '' when it can. */
  issues: Record<WidgetVisualization, string>;
  /** When this ran, so no figure on a board is on screen without a time against it. */
  ranAt: number;
}

/**
 * What a chart of these marks leaves out at the bottom, or null.
 *
 * RankedBar DROPS a row whose value is not above zero -- `data().filter(d => d.value > 0)` -- and
 * a dropped bar looks exactly like a category that was never in the data. On a board that is a
 * realistic result rather than an edge case: a sum over refunds is negative, and a count over a
 * group a filter emptied is zero. The rows stay in the table and the note says the chart is
 * missing them.
 */
function nonPositiveNote(marks: Mark[]): string | null {
  const count = marks.filter(mark => mark.value <= 0).length;
  if (!count) return null;
  return `${count} ${count === 1 ? 'figure is' : 'figures are'} zero or below, and the ranked `
    + 'view does not draw a bar for those. They are in the table.';
}

/**
 * The four kinds with the reason each cannot draw this result.
 *
 * Listed and inert with the reason on them rather than filtered away, which is the treatment an
 * unreadable connection and an undrawable chart kind already get in this feature: the reason a
 * ring is not on offer is a fact about the reader's own analysis, and it teaches more than the
 * option quietly not being there.
 */
function issuesFor(marks: Mark[], reason: string, additive: boolean, aggregationLabel: string)
    : Record<WidgetVisualization, string> {
  const categorical = marks.length ? '' : reason;
  const negative = marks.filter(mark => mark.value <= 0).length;
  return {
    table: '',
    ranked: categorical,
    bar: categorical || (marks.length > ORDERED_BARS
      ? `${marks.length} bars is past what this chart can label.` : ''),
    donut: categorical
      || (!additive
        ? `A ring divides a total, and ${aggregationLabel} has no total to divide.`
        : negative
          // A ring asserts that its parts make the whole. A negative part is a share of nothing,
          // and a zero one draws as invisible while still being counted into the total.
          ? `${negative} of these figures is zero or below, and a share of a total cannot include one.`
          : marks.length > DONUT_SLICES
            ? `${marks.length} slices is past the six colours this palette can tell apart.` : ''),
  };
}

/**
 * A tile's view of an analysis result.
 *
 * The aggregation comes from the SAVED CONFIGURATION rather than from the response, because the
 * response carries the numbers and not the question: whether a ring may divide them is a fact
 * about what was asked for, and it has to be known even when the result has no rows at all.
 */
export function analysisView(result: AnalysisResult, aggregation: Aggregation | null): WidgetView {
  const columns = result.columns ?? [];
  const allRows = result.rows ?? [];
  const named = result.measure ? columns.find(column => column.name === result.measure) : undefined;
  // The response names the measure outright, so the role scan is only the fallback for one that
  // did not: "the last MEASURE column" is a guess where `measure` is an answer.
  const measure = named
    ?? [...columns].reverse().find(column => column.role === 'MEASURE');
  const measureAt = measure ? columns.indexOf(measure) : -1;
  const dimensionAt = columns
    .map((column, index) => ({ column, index }))
    .filter(entry => entry.column.role === 'DIMENSION')
    .map(entry => entry.index);

  const pairs: Mark[] = [];
  if (measureAt >= 0 && dimensionAt.length) {
    for (const row of allRows) {
      const value = asNumber(row[measureAt]);
      // Rows whose measure does not read as a number are LEFT OUT and counted, never coerced to
      // zero: a bar shortened by an amount nobody measured is worse than a bar that is not there.
      if (value === null) continue;
      const name = dimensionAt
        .map(index => renderCell(columns[index], row[index]) || '(null)')
        .join(' · ');
      pairs.push({ name, value });
    }
  }
  const { marks, merged } = mergeMarks(pairs);

  const notes: string[] = [];
  if (result.truncated) {
    notes.push('This result stopped at the server\'s row ceiling. Groups that match it are '
      + 'missing, and nothing here can say how many or which way they would move a figure.');
  }
  const unparsed = allRows.length - pairs.length;
  if (measureAt >= 0 && dimensionAt.length && unparsed > 0) {
    notes.push(`${unparsed} ${unparsed === 1 ? 'row is' : 'rows are'} not drawn: the measure does `
      + 'not read as a number there. They are left out rather than counted as zero.');
  }
  if (merged > 0) {
    notes.push(`${merged} ${merged === 1 ? 'row shares' : 'rows share'} a label with another and `
      + 'was added into it.');
  }
  const dropped = nonPositiveNote(marks);
  if (dropped) notes.push(dropped);
  const other = result.other;
  if (other) {
    // valueCount, never values.length: the list is a sample on a high-cardinality dimension and
    // the server says so, and reporting the sample size as the bucket size would turn its own
    // honesty into a smaller, wrong number.
    notes.push(`${other.valueCount} ${other.valueCount === 1 ? 'value was' : 'values were'} `
      + `rolled into "${other.label}".`);
  }
  for (const [window, range] of Object.entries(result.resolvedWindows ?? {})) {
    // What "last 7 days" actually meant, in dates. It is the only thing that explains why two
    // copies of one tile taken either side of midnight legitimately differ.
    notes.push(`"${window}" resolved to ${range}.`);
  }

  const reason = !allRows.length ? 'This analysis returned no rows.'
    : !dimensionAt.length ? 'This analysis groups by nothing, so there is one figure and nothing to label it with.'
    : measureAt < 0 ? 'The result has no measure column to draw a length from.'
    : 'No row in this result has a measure that reads as a number.';

  return {
    columns: columns.map(column => column.name),
    rows: allRows.slice(0, WIDGET_ROWS)
      .map(row => columns.map((column, index) => renderCell(column, row[index] ?? null))),
    rowCount: result.rowCount ?? allRows.length,
    truncated: !!result.truncated,
    marks,
    notes,
    issues: issuesFor(marks, reason, !aggregation || ADDITIVE.includes(aggregation),
      (aggregation ?? '').toLowerCase().replace(/_/g, ' ') || 'this measure'),
    ranAt: Date.now(),
  };
}

/**
 * A tile's view of a saved query's result.
 *
 * A query result has no types and no roles on its columns -- the server renders every value to
 * text before it leaves -- so which column is a label and which is a length has to be READ out
 * of the values. That is the same rule the SQL console applies and it is applied here for the
 * same reason: a VARCHAR column of "1200", "980" is drawable, and a column typed DOUBLE whose
 * every row is null is not, so a type name would be the worse test even if one had travelled.
 *
 * A ring is refused outright on this path. Whether a saved statement's figures add up to a total
 * is not knowable from here -- `select avg(amount)` and `select sum(amount)` return the same
 * shape -- and a ring drawn over averages divides a total that does not exist.
 */
export function queryView(result: QueryResult): WidgetView {
  const columns = result.columns ?? [];
  const allRows = result.rows ?? [];
  const readings = columns.map((name, index) => {
    let numbers = 0;
    let negative = 0;
    for (const row of allRows) {
      const value = asNumber(row[index]);
      if (value === null) continue;
      numbers++;
      if (value < 0) negative++;
    }
    return { name, index, numbers, negative };
  });

  // A column with no numbers in it is a name. Where every column parses, the first is taken --
  // `select region, sum(amount)` puts what a row IS before what it measures. A one-column result
  // has nothing to label its values with, which is a real state and not a failure.
  const label = columns.length < 2 ? null
    : readings.find(reading => !reading.numbers) ?? readings[0];
  // The LAST numeric column rather than the first, the other half of the same observation: an
  // aggregate lands at the end of a select list and an id at the front, and a chart of an id is
  // a chart of nothing at all.
  const usable = readings.filter(reading => reading.numbers > 0 && reading.name !== label?.name);
  const value = usable[usable.length - 1] ?? null;

  const pairs: Mark[] = [];
  let noNumber = 0;
  let noLabel = 0;
  if (label && value) {
    for (const row of allRows) {
      const amount = asNumber(row[value.index]);
      if (amount === null) { noNumber++; continue; }
      const name = (row[label.index] ?? '').trim();
      // A row with no label is a measurement of nothing nameable, and a row with no number is a
      // measurement nobody has. Neither becomes a zero and neither becomes a bar.
      if (!name) { noLabel++; continue; }
      pairs.push({ name, value: amount });
    }
  }
  const { marks, merged } = mergeMarks(pairs);

  const notes: string[] = [];
  if (result.truncated) {
    notes.push('This result stopped at the server\'s row ceiling, so there may be more rows '
      + 'behind it. Every figure on this tile is over the rows that arrived.');
  }
  if (noNumber > 0) {
    notes.push(`${noNumber} ${noNumber === 1 ? 'row has' : 'rows have'} nothing that reads as a `
      + `number in "${value?.name}" and ${noNumber === 1 ? 'is' : 'are'} not drawn.`);
  }
  if (noLabel > 0) {
    notes.push(`${noLabel} ${noLabel === 1 ? 'row has' : 'rows have'} no value in `
      + `"${label?.name}" to be named by.`);
  }
  if (merged > 0) {
    notes.push(`${merged} ${merged === 1 ? 'row shares' : 'rows share'} a label with another and `
      + 'was added into it. Adding is right for a count or a total and wrong for an average.');
  }
  const dropped = nonPositiveNote(marks);
  if (dropped) notes.push(dropped);

  const reason = !allRows.length ? 'This query returned no rows.'
    : !value ? 'No column in this result has numbers in it.'
    : !label ? 'This result has one column, so there is nothing to label its values with.'
    : value.negative
      ? `"${value.name}" holds ${value.negative} negative `
        + `${value.negative === 1 ? 'value' : 'values'}, and a length cannot be negative.`
      : 'No row has both a label and a number.';
  const issues = issuesFor(
    value && value.negative ? [] : marks, reason, true, 'this measure');
  issues.donut = issues.donut
    || 'A saved query does not say whether its figures add up to a total, so a ring cannot '
      + 'claim they do.';

  return {
    columns,
    rows: allRows.slice(0, WIDGET_ROWS).map(row => row.map(cell => cell ?? null)),
    rowCount: result.rowCount ?? allRows.length,
    truncated: !!result.truncated,
    marks,
    notes,
    issues,
    ranAt: Date.now(),
  };
}

/**
 * Where one tile has got to.
 *
 * `queued` is a real state and not a loading spinner waiting to happen: a board runs its tiles
 * ONE AT A TIME, so most of them spend most of an open genuinely waiting for their turn, and
 * saying "waiting" where nothing is happening yet is the honest word for it.
 */
export type WidgetState = 'queued' | 'running' | 'done' | 'failed' | 'stopped';

export interface WidgetRun {
  state: WidgetState;
  /** The server's own sentence when it refused. Never paraphrased. */
  error: string;
  view: WidgetView | null;
  /** Minted here so the run can be stopped; the server keys its registry on (tenant, user, id). */
  queryId: string;
}

/** What a saved analysis's one JSON column holds. Written by the Canvas, read here. */
interface SavedAnalysisConfig {
  dimensions?: string[];
  measure?: { aggregation?: Aggregation; field?: string };
  filters?: FilterGroup;
  topN?: TopN | null;
  sort?: AnalysisSort | null;
}

const KINDS: { id: WidgetVisualization; label: string }[] = [
  { id: 'table', label: 'Table' },
  { id: 'ranked', label: 'Ranked bars' },
  { id: 'bar', label: 'Bars in order' },
  { id: 'donut', label: 'Share of the total' },
];

/**
 * A minted run id, scoped to the caller by the server's own registry key.
 *
 * The client names the run because the endpoints are synchronous: an id minted server-side would
 * arrive with the rows, which is after there is anything left to stop.
 */
function mintQueryId(widgetId: number): string {
  return `widget-${widgetId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

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
 * So the tiles run STRICTLY ONE AT A TIME, in display order, and the queue is visible while it
 * drains. A board therefore holds at most ONE of the four permits no matter how many tiles are
 * on it: it takes longer to draw, and it can never be the reason somebody else's query waits.
 * The exchange is stated on the board itself rather than left to be discovered, and there are
 * three ways out of the wait -- Stop abandons the rest and cancels the one in flight, each tile
 * re-runs on its own, and adding a tile runs only that tile rather than the board again.
 *
 * Changing a tile's chart kind runs NOTHING. It draws the result already in hand a different
 * way, which is the whole reason a widget is a reference plus a visualization choice and not a
 * saved picture.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-dashboards',
  imports: [Icon, BarChart, Donut, RankedBar],
  template: `
    <div class="space-y-4 min-w-0">

      <!-- ---- the boards this workspace has ---------------------------------------------- -->
      <div class="card p-4 space-y-3">
        <div class="flex items-baseline gap-2 flex-wrap">
          <h2 class="text-sm font-semibold">Dashboards</h2>
          <span class="text-xs text-[color:var(--text-muted)]">
            A page of saved analyses and saved queries, re-run every time it is opened.
          </span>
          <button type="button" class="btn btn-default btn-sm ml-auto"
                  [disabled]="loading()" (click)="loadDashboards()">
            <app-icon name="refresh" />
            Refresh
          </button>
        </div>

        <div class="flex gap-2 flex-wrap items-start">
          <input class="input input-sm w-56" placeholder="New dashboard name"
                 aria-label="New dashboard name"
                 [value]="newName()" (input)="newName.set($any($event.target).value)" />
          <input class="input input-sm flex-1 min-w-48" placeholder="What is it for? (optional)"
                 aria-label="Dashboard description"
                 [value]="newDescription()" (input)="newDescription.set($any($event.target).value)" />
          <button type="button" class="btn btn-primary btn-sm"
                  [disabled]="!canCreate()" (click)="createDashboard()">
            <app-icon name="plus" />
            Create
          </button>
        </div>
        @if (createError()) {
          <p class="text-xs text-crit-500">{{ createError() }}</p>
        }

        @if (loading()) {
          <p class="text-xs text-[color:var(--text-muted)] py-2">Reading the dashboards…</p>
        } @else if (error()) {
          <p class="text-xs text-crit-500 py-2">{{ error() }}</p>
        } @else if (!dashboards().length) {
          <p class="text-xs text-[color:var(--text-muted)] py-2">
            No dashboards yet. A dashboard holds saved analyses and saved queries side by side;
            build one of those first and it can go on a page here.
          </p>
        } @else {
          <ul class="space-y-1">
            @for (item of dashboards(); track item.analyticsDashboardId) {
              <li class="flex items-center gap-2 min-w-0 border-t border-subtle pt-1">
                <button type="button" class="btn btn-ghost btn-sm min-w-0 flex-1 justify-start"
                        [class.font-semibold]="item.analyticsDashboardId === board()?.analyticsDashboardId"
                        (click)="openDashboard(item)">
                  <span class="truncate">{{ item.dashboardName }}</span>
                </button>
                @if (item.dashboardDescription) {
                  <span class="text-xs text-[color:var(--text-muted)] truncate max-w-64">
                    {{ item.dashboardDescription }}
                  </span>
                }
                <span class="text-[11px] text-[color:var(--text-muted)] whitespace-nowrap ml-auto">
                  {{ when(item.dateUpdated || item.dateCreated) }}
                </span>
                <button type="button" class="btn btn-ghost btn-xs" title="Delete this dashboard"
                        (click)="removeDashboard(item)">
                  <app-icon name="trash" />
                </button>
              </li>
            }
          </ul>
        }
      </div>

      <!-- ---- the board that is open ----------------------------------------------------- -->
      @if (boardLoading()) {
        <div class="card p-4">
          <p class="text-xs text-[color:var(--text-muted)]">Reading the board…</p>
        </div>
      } @else if (boardError()) {
        <div class="card p-4"><p class="text-xs text-crit-500">{{ boardError() }}</p></div>
      } @else if (board(); as open) {
        <div class="card p-4 space-y-3">
          <div class="flex items-baseline gap-2 flex-wrap">
            <h3 class="text-sm font-semibold truncate">{{ open.dashboardName }}</h3>
            @if (open.dashboardDescription) {
              <span class="text-xs text-[color:var(--text-secondary)]">{{ open.dashboardDescription }}</span>
            }
            <div class="ml-auto flex gap-2">
              @if (running()) {
                <button type="button" class="btn btn-default btn-sm" (click)="stopRun()">
                  <app-icon name="stop" />
                  Stop
                </button>
              } @else if (widgets().length) {
                <button type="button" class="btn btn-default btn-sm" (click)="runAll()">
                  <app-icon name="refresh" />
                  Run every widget
                </button>
              }
            </div>
          </div>

          <!-- What opening this board costs, said on the board and not in a comment. -->
          <p class="field-note text-[color:var(--text-muted)]">{{ cost() }}</p>
          @if (running()) {
            <p class="field-note text-[color:var(--text-secondary)]">
              {{ progress() }}
            </p>
          }

          <!-- ---- adding a widget ---------------------------------------------------------- -->
          <div class="border-t border-subtle pt-3 space-y-2">
            @if (!addOpen()) {
              <button type="button" class="btn btn-default btn-sm" (click)="openAdd()">
                <app-icon name="plus" />
                Add a widget
              </button>
            } @else {
              <div class="flex gap-2 flex-wrap items-start">
                <input class="input input-sm w-48" placeholder="Widget title"
                       aria-label="Widget title"
                       [value]="addTitle()" (input)="addTitle.set($any($event.target).value)" />
                <select class="input input-sm w-auto" aria-label="What this widget shows"
                        [value]="addKindOfSource()"
                        (change)="pickSourceKind($any($event.target).value)">
                  <option value="analysis" [selected]="addKindOfSource() === 'analysis'">
                    A saved analysis
                  </option>
                  <option value="query" [selected]="addKindOfSource() === 'query'">
                    A saved query
                  </option>
                </select>
                <select class="input input-sm w-56" aria-label="Which one"
                        [value]="addSourceId()"
                        (change)="addSourceId.set($any($event.target).value)">
                  <option value="" [selected]="!addSourceId()">Pick one…</option>
                  @if (addKindOfSource() === 'analysis') {
                    @for (item of analyses(); track item.analyticsAnalysisId) {
                      <option [value]="item.analyticsAnalysisId">{{ item.analysisName }}</option>
                    }
                  } @else {
                    @for (item of queries(); track item.analyticsQueryId) {
                      <option [value]="item.analyticsQueryId">{{ item.queryName }}</option>
                    }
                  }
                </select>
                <select class="input input-sm w-auto" aria-label="How to draw it"
                        [value]="addVisualization()"
                        (change)="addVisualization.set($any($event.target).value)">
                  @for (kind of kinds; track kind.id) {
                    <option [value]="kind.id" [selected]="kind.id === addVisualization()">
                      {{ kind.label }}
                    </option>
                  }
                </select>
                <button type="button" class="btn btn-primary btn-sm"
                        [disabled]="!canAdd()" (click)="addWidget()">Add</button>
                <button type="button" class="btn btn-ghost btn-sm" (click)="addOpen.set(false)">
                  Cancel
                </button>
              </div>
              <p class="field-note text-[color:var(--text-muted)]">
                A widget points at saved work; it never keeps a copy of the result. Adding one
                runs that widget alone, not the whole board.
              </p>
              @if (sourcesError()) {
                <p class="text-xs text-crit-500">{{ sourcesError() }}</p>
              } @else if (!analyses().length && !queries().length && sourcesReady()) {
                <p class="text-xs text-[color:var(--text-muted)]">
                  This workspace has saved neither an analysis nor a query yet, so there is
                  nothing a widget could point at.
                </p>
              }
              @if (addError()) {
                <p class="text-xs text-crit-500">{{ addError() }}</p>
              }
            }
          </div>
        </div>

        @if (widgetError()) {
          <p class="text-xs text-crit-500">{{ widgetError() }}</p>
        }

        @if (!widgets().length) {
          <div class="card p-4">
            <p class="text-xs text-[color:var(--text-muted)]">
              Nothing on this board yet.
            </p>
          </div>
        } @else {
          <div class="grid gap-3 md:grid-cols-2">
            @for (widget of widgets(); track widget.analyticsDashboardWidgetId) {
              <div class="card p-3 space-y-2 min-w-0">
                <div class="flex items-baseline gap-2 min-w-0">
                  <span class="text-sm font-semibold truncate">{{ widget.widgetTitle }}</span>
                  <button type="button" class="btn btn-ghost btn-xs ml-auto shrink-0"
                          title="Re-run this widget" (click)="runOne(widget)">
                    <app-icon name="refresh" />
                  </button>
                  <button type="button" class="btn btn-ghost btn-xs shrink-0"
                          title="Take this widget off the board" (click)="removeWidget(widget)">
                    <app-icon name="trash" />
                  </button>
                </div>

                <p class="field-note text-[color:var(--text-muted)] truncate"
                   [title]="sourceOf(widget)">{{ sourceOf(widget) }}</p>

                @if (runs()[widget.analyticsDashboardWidgetId!]; as run) {
                  @switch (run.state) {
                    @case ('queued') {
                      <p class="text-xs text-[color:var(--text-muted)] py-4 text-center">
                        Waiting its turn. Widgets run one at a time.
                      </p>
                    }
                    @case ('running') {
                      <p class="text-xs text-[color:var(--text-secondary)] py-4 text-center">
                        Running…
                      </p>
                    }
                    @case ('failed') {
                      <p class="text-xs text-crit-500 py-2">{{ run.error }}</p>
                    }
                    @case ('stopped') {
                      <p class="text-xs text-[color:var(--text-muted)] py-4 text-center">
                        Stopped before it ran. Nothing is on this tile, which is not the same as
                        nothing being in the data.
                      </p>
                    }
                    @default {
                      @if (run.view; as view) {
                        <div class="flex items-baseline gap-2 flex-wrap">
                          <select class="input input-sm w-auto" aria-label="How to draw this widget"
                                  [value]="drawn(widget, view)"
                                  (change)="setVisualization(widget, $any($event.target).value)">
                            <!-- Listed and inert with the reason on it, never quietly missing: a
                                 reader who cannot find "share of the total" needs to be told
                                 that a ring of forty slices is not a chart. -->
                            @for (kind of kinds; track kind.id) {
                              <option [value]="kind.id" [disabled]="!!view.issues[kind.id]"
                                      [selected]="kind.id === drawn(widget, view)"
                                      [title]="view.issues[kind.id] || kind.label">
                                {{ kind.label }}{{ view.issues[kind.id] ? ' — ' + view.issues[kind.id] : '' }}
                              </option>
                            }
                          </select>
                          <span class="text-[11px] text-[color:var(--text-muted)] ml-auto">
                            ran {{ clock(view.ranAt) }}
                          </span>
                        </div>

                        @if (view.truncated) {
                          <!-- Loud, and above the figures rather than under them: a reader handed
                               part of an answer and not told has a WRONG answer, not a short one. -->
                          <p class="text-xs text-crit-500">
                            Partial result — this stopped at the server's row ceiling.
                          </p>
                        }

                        @switch (drawn(widget, view)) {
                          @case ('ranked') {
                            <!-- No percentages: a share of a total is only a share when the parts
                                 add up to it, and the measure here is whatever was saved. -->
                            <app-ranked-bar [data]="view.marks" [max]="view.marks.length"
                                            [showPercent]="false" />
                          }
                          @case ('bar') {
                            <app-bar-chart [data]="view.marks" [height]="180" />
                          }
                          @case ('donut') {
                            <app-donut [data]="view.marks" [totalLabel]="''" />
                          }
                          @default {
                            <div class="overflow-x-auto">
                              <table class="w-full text-xs">
                                <thead>
                                  <tr class="text-left text-[color:var(--text-muted)]">
                                    @for (column of view.columns; track column) {
                                      <th class="px-2 py-1 font-medium whitespace-nowrap">{{ column }}</th>
                                    }
                                  </tr>
                                </thead>
                                <tbody>
                                  @for (row of view.rows; track $index) {
                                    <tr class="border-t border-subtle">
                                      @for (cell of row; track $index) {
                                        <td class="px-2 py-1 whitespace-nowrap tabular">
                                          @if (cell === null) {
                                            <!-- A real null, which is not an empty string and is
                                                 certainly not a zero. -->
                                            <span class="text-[color:var(--text-muted)]" title="null">—</span>
                                          } @else {
                                            {{ cell }}
                                          }
                                        </td>
                                      }
                                    </tr>
                                  }
                                </tbody>
                              </table>
                            </div>
                          }
                        }

                        <p class="field-note text-[color:var(--text-muted)]">{{ counted(view) }}</p>
                        @for (note of view.notes; track note) {
                          <p class="field-note text-[color:var(--text-muted)]">{{ note }}</p>
                        }
                      }
                    }
                  }
                } @else {
                  <p class="text-xs text-[color:var(--text-muted)] py-4 text-center">
                    Not run yet.
                  </p>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class Dashboards implements OnInit, OnDestroy {

  private readonly analytics = inject(AnalyticsService);
  private readonly dialog = inject(Dialog);

  readonly kinds = KINDS;

  readonly dashboards = signal<Dashboard[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly newName = signal('');
  readonly newDescription = signal('');
  readonly creating = signal(false);
  readonly createError = signal('');

  readonly board = signal<Dashboard | null>(null);
  readonly boardLoading = signal(false);
  readonly boardError = signal('');
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
  readonly adding = signal(false);
  readonly addError = signal('');

  readonly runs = signal<Record<number, WidgetRun>>({});
  /** Widget ids still waiting. The head of it is what runs next, and only when nothing is. */
  readonly queue = signal<number[]>([]);
  readonly runningId = signal<number | null>(null);
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
  private inFlight: Subscription | null = null;
  /** Set once the board is loaded and waiting for the sources it needs to run its widgets. */
  private pending: 'all' | number[] | null = null;

  readonly widgets = computed<DashboardWidget[]>(() => this.board()?.widgets ?? []);
  readonly running = computed(() => this.runningId() !== null || this.queue().length > 0);

  readonly canCreate = computed(() => !!this.newName().trim() && !this.creating());

  readonly canAdd = computed(() =>
    !!this.addTitle().trim() && !!this.addSourceId() && !this.adding() && !!this.board());

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
      + 'They run one at a time, in order, so this board never holds more than one of the '
      + 'server\'s query permits however many widgets are on it.';
  });

  readonly progress = computed(() => {
    const total = this.batch();
    const left = this.queue().length + (this.runningId() === null ? 0 : 1);
    const at = Math.min(Math.max(total - left + 1, 1), total);
    const current = this.widgets().find(
      widget => widget.analyticsDashboardWidgetId === this.runningId());
    return `Running ${at} of ${total}`
      + (current ? ` — ${current.widgetTitle}` : '') + '.';
  });

  ngOnInit(): void {
    this.loadDashboards();
    this.loadSources();
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
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The dashboards could not be read.');
      },
    });
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
          this.error.set(response.message || 'The dashboard could not be deleted.');
          return;
        }
        if (this.board()?.analyticsDashboardId === id) {
          this.abandon();
          this.board.set(null);
        }
        this.loadDashboards();
      },
      error: err => {
        this.error.set(err?.error?.message || 'The dashboard could not be deleted.');
      },
    });
  }

  openDashboard(item: Dashboard): void {
    const id = item.analyticsDashboardId;
    if (!id) return;
    this.loadBoard(id, 'all');
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
        if (run === null) return;
        this.pending = run;
        this.start();
      },
      error: err => {
        if (token !== this.boardToken) return;
        this.boardLoading.set(false);
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
  sourceOf(widget: DashboardWidget): string {
    if (widget.analyticsAnalysisId) {
      const saved = this.analyses().find(
        item => item.analyticsAnalysisId === widget.analyticsAnalysisId);
      return saved ? `Saved analysis · ${saved.analysisName} · ${saved.connectionAlias}/${saved.datasetPath}`
        : 'Saved analysis';
    }
    const saved = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    return saved ? `Saved query · ${saved.queryName} · ${saved.connectionAlias}/${saved.datasetPath}`
      : 'Saved query';
  }

  // ---- adding and removing a widget -------------------------------------------------------

  openAdd(): void {
    this.addOpen.set(true);
    this.addError.set('');
    this.addTitle.set('');
    this.addSourceId.set('');
    this.addVisualization.set('table');
  }

  pickSourceKind(kind: string): void {
    this.addKindOfSource.set(kind === 'query' ? 'query' : 'analysis');
    // The id belongs to the list it came from. Carrying it across would point the widget at
    // whatever saved query happens to share a number with the analysis that was chosen.
    this.addSourceId.set('');
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
      title: 'Take this widget off the board?',
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

  /**
   * The kind actually drawn: the one saved, unless this result cannot carry it.
   *
   * Falls back to the table rather than to an empty frame, the same way the Canvas's picker
   * moves when a new result takes a chart kind away. A tile saved as a ring whose analysis has
   * since grown forty categories shows the rows and says why the ring is unavailable, which is a
   * fact about the data rather than a fault of the board.
   */
  drawn(widget: DashboardWidget, view: WidgetView): WidgetVisualization {
    const asked = (widget.visualizationType ?? 'table') as WidgetVisualization;
    if (asked !== 'table' && asked !== 'ranked' && asked !== 'bar' && asked !== 'donut') {
      return 'table';
    }
    return view.issues[asked] ? 'table' : asked;
  }

  /** How much of the result is on the tile, said plainly. */
  counted(view: WidgetView): string {
    if (!view.rowCount) return 'No rows.';
    const shown = view.rows.length;
    return shown < view.rowCount
      ? `${shown} of ${view.rowCount.toLocaleString()} rows shown`
      : `${view.rowCount.toLocaleString()} ${view.rowCount === 1 ? 'row' : 'rows'}`;
  }

  // ---- running the board, one widget at a time --------------------------------------------

  runAll(): void {
    if (!this.board()) return;
    this.abandon();
    this.pending = 'all';
    this.start();
  }

  runOne(widget: DashboardWidget): void {
    const id = widget.analyticsDashboardWidgetId;
    if (!id) return;
    if (this.queue().includes(id)) return;
    const idle = this.runningId() === null && !this.queue().length;
    // Appended rather than jumped in front of: a queue that reordered itself under a click would
    // make "run this one" mean "and stop that one", which is a second action nobody asked for.
    this.queue.update(queue => [...queue, id]);
    this.batch.update(size => idle ? 1 : size + 1);
    this.mark(id, { state: 'queued', error: '', view: null, queryId: '' });
    if (idle) this.next(this.epoch);
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
    const queryId = this.runningId() === null ? ''
      : this.runs()[this.runningId()!]?.queryId ?? '';
    const waiting = [...this.queue()];
    const current = this.runningId();
    this.abandon();
    for (const id of waiting) {
      this.mark(id, { state: 'stopped', error: '', view: null, queryId: '' });
    }
    if (current !== null) {
      this.mark(current, { state: 'stopped', error: '', view: null, queryId: '' });
    }
    if (queryId) {
      this.analytics.cancel(queryId).subscribe({ next: () => {}, error: () => {} });
    }
  }

  /** Everything in flight is disowned and the queue is emptied. No tile is touched. */
  private abandon(): void {
    this.epoch++;
    this.queue.set([]);
    this.batch.set(0);
    this.runningId.set(null);
    this.pending = null;
    this.inFlight?.unsubscribe();
    this.inFlight = null;
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
    const ids = pending === 'all'
      ? this.widgets().map(widget => widget.analyticsDashboardWidgetId).filter(
          (id): id is number => typeof id === 'number')
      : pending;
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
   * Takes the next widget off the queue and runs it. ONE AT A TIME, and that is the whole point.
   *
   * Every analytics query in this application passes one JVM-wide fair semaphore that admits
   * four at once, shared with every other user and with the ETL work on the same box. A board
   * that fired its tiles together would hold that ceiling for as long as it took to draw itself;
   * serially it holds one permit, and takes longer instead.
   */
  private next(epoch: number): void {
    if (epoch !== this.epoch) return;
    const queue = this.queue();
    if (!queue.length) {
      this.runningId.set(null);
      return;
    }
    const id = queue[0];
    this.queue.set(queue.slice(1));
    const widget = this.widgets().find(item => item.analyticsDashboardWidgetId === id);
    if (!widget) {
      // The board changed under the queue. Nothing to run and nothing to report on a tile that
      // is not there any more.
      this.next(epoch);
      return;
    }
    this.runningId.set(id);
    this.run(widget, id, epoch);
  }

  private run(widget: DashboardWidget, id: number, epoch: number): void {
    const queryId = mintQueryId(id);
    this.mark(id, { state: 'running', error: '', view: null, queryId });

    if (widget.analyticsAnalysisId) {
      const saved = this.analyses().find(
        item => item.analyticsAnalysisId === widget.analyticsAnalysisId);
      if (!saved) {
        this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
          error: 'The saved analysis this widget points at is not in this workspace.' });
        return;
      }
      let config: SavedAnalysisConfig;
      try {
        config = JSON.parse(saved.analysisConfig ?? '{}');
      } catch {
        // Nothing is sent. A configuration that will not parse cannot be half-applied into a
        // request: a tile running the dimensions without the filters would answer a different
        // question under the same title.
        this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
          error: `"${saved.analysisName}" cannot be run: its saved configuration is not readable.` });
        return;
      }
      const aggregation = config.measure?.aggregation ?? 'COUNT_ROWS';
      const request: AnalysisRequest = {
        connection: saved.connectionAlias,
        path: saved.datasetPath,
        dimensions: config.dimensions ?? [],
        measure: { aggregation, field: config.measure?.field },
        queryId,
      };
      if (config.filters) request.filters = config.filters;
      if (config.topN) request.topN = config.topN;
      if (config.sort) request.sort = config.sort;
      this.inFlight = this.analytics.analyze(request).subscribe({
        next: response => {
          if (response.status !== API_SUCCESS || !response.data) {
            this.settle(id, epoch, { state: 'failed', view: null, queryId,
              error: response.message || 'That analysis could not be run.' });
            return;
          }
          this.settle(id, epoch, { state: 'done', error: '', queryId,
            view: analysisView(response.data, aggregation) });
        },
        error: err => {
          this.settle(id, epoch, { state: 'failed', view: null, queryId,
            error: err?.error?.message || 'That analysis could not be run.' });
        },
      });
      return;
    }

    const saved = this.queries().find(item => item.analyticsQueryId === widget.analyticsQueryId);
    if (!saved) {
      this.settle(id, epoch, { state: 'failed', view: null, queryId: '',
        error: 'The saved query this widget points at is not in this workspace.' });
      return;
    }
    this.inFlight = this.analytics.query({
      connection: saved.connectionAlias,
      path: saved.datasetPath,
      sql: saved.queryText,
      queryId,
    }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS || !response.data) {
          this.settle(id, epoch, { state: 'failed', view: null, queryId,
            error: response.message || 'That query could not be run.' });
          return;
        }
        this.settle(id, epoch, { state: 'done', error: '', queryId,
          view: queryView(response.data) });
      },
      error: err => {
        this.settle(id, epoch, { state: 'failed', view: null, queryId,
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
    this.mark(id, run);
    this.inFlight = null;
    this.runningId.set(null);
    this.next(epoch);
  }

  private mark(id: number, run: WidgetRun): void {
    this.runs.update(runs => ({ ...runs, [id]: run }));
  }

  // ---- small renderings -------------------------------------------------------------------

  /** A timestamp in the reader's locale, or the raw text when it will not parse. */
  when(raw: string | undefined): string {
    if (!raw) return '';
    const at = new Date(raw);
    return isNaN(at.getTime()) ? raw : at.toLocaleString();
  }

  /** The time a tile ran, to the second: a figure with no time against it is a figure on trust. */
  clock(at: number): string {
    return new Date(at).toLocaleTimeString();
  }
}

/**
 * The dataset registry: naming a location once, and finding it again.
 *
 * The master index's golden workflow names dataset registration as a step, and until now the
 * endpoints behind it had no caller at all -- the table, the entity and four endpoints existed
 * and nothing in the product could reach them. This is the surface that reaches them.
 *
 * <b>REGISTERING READS NOTHING.</b> It takes no governor permit, opens no DuckDB session and
 * scans no rows: the server asks its resolver one question -- may this caller read this alias
 * and this path, and what format is it -- and keeps the answer. That is worth saying on screen,
 * because a control that looked like it might read a gigabyte is a control people do not press.
 *
 * The connection and path INPUTS are the seam this was built for. A tab inside the Studio hands
 * it the file that is open, so "name the dataset you are looking at" is one field and a button;
 * used on its own, both are typed. `opened` is the way back -- a registered dataset picked from
 * the list is a request to go and open it, which belongs to whatever screen owns the browser
 * rather than to a registry.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-dataset-registry',
  imports: [Icon],
  template: `
    <div class="card p-4 space-y-3 min-w-0">
      <div class="flex items-baseline gap-2 flex-wrap">
        <h2 class="text-sm font-semibold">Registered datasets</h2>
        <span class="text-xs text-[color:var(--text-muted)]">
          A name for a location, so it can be found again.
        </span>
        <button type="button" class="btn btn-default btn-sm ml-auto"
                [disabled]="loading()" (click)="load()">
          <app-icon name="refresh" />
          Refresh
        </button>
      </div>

      <div class="flex gap-2 flex-wrap items-start">
        <input class="input input-sm w-48" placeholder="Name this dataset"
               aria-label="Dataset name"
               [value]="datasetName()" (input)="datasetName.set($any($event.target).value)" />
        <input class="input input-sm w-40" placeholder="Connection"
               aria-label="Connection alias"
               [value]="alias()" (input)="setAlias($any($event.target).value)" />
        <input class="input input-sm flex-1 min-w-48 mono" placeholder="Path inside it"
               aria-label="Dataset path"
               [value]="location()" (input)="setPath($any($event.target).value)" />
        <button type="button" class="btn btn-primary btn-sm"
                [disabled]="!canRegister()" (click)="register()">
          <app-icon name="plus" />
          Register
        </button>
      </div>

      @if (suggestion() && !datasetName()) {
        <button type="button" class="btn btn-ghost btn-xs" (click)="datasetName.set(suggestion())">
          Call it "{{ suggestion() }}"
        </button>
      }

      <p class="field-note text-[color:var(--text-muted)]">
        Registering names a location and proves you can read it. It does not open the file: no
        rows are scanned and no query permit is spent. The format is decided by the server when
        it checks the path, so it is not something to choose here.
      </p>

      @if (registerError()) {
        <p class="text-xs text-crit-500">{{ registerError() }}</p>
      }

      @if (loading()) {
        <p class="text-xs text-[color:var(--text-muted)] py-2">Reading the registry…</p>
      } @else if (error()) {
        <p class="text-xs text-crit-500 py-2">{{ error() }}</p>
      } @else if (!datasets().length) {
        <p class="text-xs text-[color:var(--text-muted)] py-2">
          Nothing registered yet. A registered dataset is a name for a connection and a path —
          it holds no data of its own, and deleting one never touches a file.
        </p>
      } @else {
        <ul class="space-y-1">
          @for (item of datasets(); track item.analyticsDatasetId) {
            <li class="flex items-center gap-2 min-w-0 border-t border-subtle pt-1">
              <button type="button" class="btn btn-ghost btn-sm min-w-0 flex-1 justify-start"
                      [title]="item.connectionAlias + '/' + item.datasetPath"
                      (click)="opened.emit(item)">
                <span class="truncate">{{ item.datasetName }}</span>
              </button>
              @if (item.datasetFormat) {
                <span class="pill shrink-0">{{ item.datasetFormat }}</span>
              }
              <span class="text-[11px] mono text-[color:var(--text-muted)] truncate max-w-72">
                {{ item.connectionAlias }}/{{ item.datasetPath }}
              </span>
              <button type="button" class="btn btn-ghost btn-xs shrink-0" title="Forget this name"
                      (click)="forget(item)">
                <app-icon name="trash" />
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class DatasetRegistry implements OnInit {

  private readonly analytics = inject(AnalyticsService);
  private readonly dialog = inject(Dialog);

  /** The connection and path a host screen is already looking at. Both are editable here. */
  readonly connection = input('');
  readonly path = input('');

  /** A registered dataset the reader wants to open. Whoever owns the browser answers this. */
  readonly opened = output<RegisteredDataset>();

  readonly datasets = signal<RegisteredDataset[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly registering = signal(false);
  readonly registerError = signal('');

  readonly datasetName = signal('');
  /**
   * The two location fields, held apart from the inputs on purpose.
   *
   * A host screen's file is the STARTING POINT and not a binding: a reader who types a different
   * path here and then clicks another file in the rail should not have their typing replaced.
   * `alias()` and `location()` fall back to the inputs only while nothing has been typed.
   */
  private readonly typedAlias = signal<string | null>(null);
  private readonly typedPath = signal<string | null>(null);

  readonly alias = computed(() => this.typedAlias() ?? this.connection());
  readonly location = computed(() => this.typedPath() ?? this.path());

  /** The file's own name, which is what a person calls a dataset before they call it anything. */
  readonly suggestion = computed(() => {
    const parts = this.location().split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1] : '';
  });

  readonly canRegister = computed(() =>
    !!this.datasetName().trim() && !!this.alias().trim() && !!this.location().trim()
    && !this.registering());

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.analytics.fetchAllDatasets().subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(response.message || 'The registry could not be read.');
          return;
        }
        this.datasets.set(response.data);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The registry could not be read.');
      },
    });
  }

  register(): void {
    if (!this.canRegister()) return;
    this.registering.set(true);
    this.registerError.set('');
    this.analytics.registerDataset({
      datasetName: this.datasetName().trim(),
      connectionAlias: this.alias().trim(),
      datasetPath: this.location().trim(),
    }).subscribe({
      next: response => {
        this.registering.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          // The resolver's own sentence, verbatim. It says the same thing for "no such
          // connection" and "not yours" so that registration cannot be walked to learn which
          // aliases other workspaces hold, and paraphrasing it here would invent the distinction
          // the server spent effort refusing to make.
          this.registerError.set(response.message || 'That dataset could not be registered.');
          return;
        }
        this.datasetName.set('');
        this.load();
      },
      error: err => {
        this.registering.set(false);
        this.registerError.set(err?.error?.message || 'That dataset could not be registered.');
      },
    });
  }

  async forget(item: RegisteredDataset): Promise<void> {
    const id = item.analyticsDatasetId;
    if (!id) return;
    const confirmed = await confirmWith(this.dialog, {
      title: 'Forget this dataset?',
      body: `"${item.datasetName}" will be removed from the registry. The file it names is not `
        + 'touched — this registry holds names, never data.',
      confirmLabel: 'Forget',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteDataset(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.error.set(response.message || 'That dataset could not be removed.');
          return;
        }
        this.load();
      },
      error: err => {
        this.error.set(err?.error?.message || 'That dataset could not be removed.');
      },
    });
  }

  setAlias(value: string): void { this.typedAlias.set(value); }
  setPath(value: string): void { this.typedPath.set(value); }
}
