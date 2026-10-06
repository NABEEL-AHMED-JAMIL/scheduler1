import { Component, effect, inject, input, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { StatusPill } from '../../shared/ui/status-pill';
import { StatusFilterChip } from '../../shared/ui/status-filter-chip';
import { StatStrip, StatStripItem } from '../../shared/ui/stat-strip';
import { StatTile } from '../../shared/ui/stat-tile';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { ViewToggle } from '../../shared/ui/view-toggle';
import { Combobox, ComboboxOption } from '../../shared/ui/combobox';
import { Field } from '../../shared/ui/field';
import { FormDialog } from '../../shared/ui/form-dialog';
import { SidePanel } from '../../shared/ui/side-panel';
import { Confirm, ConfirmOptions } from '../../shared/ui/confirm';
import { FileDropzone } from '../../shared/ui/file-dropzone';
import { Pagination } from '../../shared/ui/pagination';
import { LoadError } from '../../shared/ui/load-error';
import { TableShell } from '../../shared/ui/data-table';
import { Donut, Slice } from '../../shared/charts/donut';
import { Bar, BarChart } from '../../shared/charts/bar-chart';
import { LineChart, Point } from '../../shared/charts/line-chart';
import { HeatCell, Heatmap } from '../../shared/charts/heatmap';
import { RankedBar, RankedItem } from '../../shared/charts/ranked-bar';
import { GroupedBar, GroupedSeries } from '../../shared/charts/grouped-bar';
import { SplitBar, SplitRow } from '../../shared/charts/split-bar';
import { Histogram } from '../../shared/charts/histogram';
import { ScatterPlot, ScatterPoint } from '../../shared/charts/scatter-plot';
import { KpiCard } from '../../shared/charts/kpi-card';
import { statusColor } from '../../shared/charts/status-color';

/** Every run state the scheduler has, in lifecycle order, then an entity's states. */
export const GALLERY_STATUSES = ['Queue', 'Start', 'Running', 'Completed', 'Failed', 'Interrupt', 'Skip', 'Missed',
  'Active', 'Inactive', 'Pending'] as const;

/**
 * MIG-257: the component gallery, a dev-only page.
 *
 * Every shared component and dashboard widget on one screen, with fixed sample data and no
 * backend, so a styling change can be checked in both themes at once instead of by visiting
 * forty screens. It is registered only in a development build (see DEV_ROUTES in app.config.ts):
 * the production bundle has no route to it and no code for it, and no menu links to it.
 *
 * `?theme=dark` or `?theme=light` sets the theme on arrival, which is what the screenshot script
 * uses; the switch in the header does the same by hand.
 */
@Component({
  selector: 'app-gallery',
  imports: [Icon, BrandMark, StatusPill, StatusFilterChip, StatStrip, StatTile, Segmented, ViewToggle, Combobox, Field,
    FormDialog, SidePanel, Confirm, FileDropzone, Pagination, LoadError, TableShell, Donut, BarChart, LineChart, Heatmap,
    RankedBar, GroupedBar, SplitBar, Histogram, ScatterPlot, KpiCard],
  templateUrl: './gallery.html',
  providers: [
    // The dialog chrome is drawn inline here, not in an overlay, so it gets an inert ref.
    { provide: DialogRef, useValue: { close: () => undefined } },
    { provide: DIALOG_DATA, useValue: { title: 'Delete this job?', body: 'Its schedule and history go with it. This cannot be undone.',
      confirmLabel: 'Delete', danger: true } satisfies ConfirmOptions },
  ],
})
export class Gallery {
  readonly themeService = inject(ThemeService);
  private readonly toasts = inject(ToastService);

  /** From the query string, via withComponentInputBinding. */
  readonly theme = input<string>();

  readonly statuses = GALLERY_STATUSES;
  readonly themes: SegmentOption<'light' | 'dark'>[] = [{ id: 'light', label: 'Light', icon: 'sun' }, { id: 'dark', label: 'Dark', icon: 'moon' }];
  readonly themeChoice = signal<'light' | 'dark'>(this.themeService.theme());
  readonly range = signal<'day' | 'week' | 'month'>('week');
  readonly ranges: SegmentOption<'day' | 'week' | 'month'>[] = [
    { id: 'day', label: 'Day' }, { id: 'week', label: 'Week' }, { id: 'month', label: 'Month', disabled: true }];
  readonly options: ComboboxOption[] = [
    { value: '1', label: 'Nightly CSV import', hint: 'csv-import' },
    { value: '2', label: 'Invoice PDF extraction', hint: 'pdf-extract' },
    { value: '3', label: 'Retired task', hint: 'legacy', disabled: true }];

  readonly strip: StatStripItem[] = [
    { label: 'Total', value: '1,284' },
    { label: 'Completed', value: '1,190', tone: 'ok', icon: 'checkCircle' },
    { label: 'Failed', value: 42, tone: 'crit', icon: 'xCircle' },
    { label: 'Skipped', value: 31, tone: 'warn', icon: 'skip' },
    { label: 'Running', value: 21, tone: 'info', icon: 'zap', foot: 'of 64 slots' }];

  readonly slices: Slice[] = [{ name: 'Storage', value: 1190 }, { name: 'Compute', value: 420 }, { name: 'AI', value: 310 },
    { name: 'Egress', value: 90 }, { name: 'Support', value: 120 }];
  readonly categorical: Slice[] = ['csv', 'pdf', 'xlsx', 'json', 'xml', 'txt', 'png', 'zip']
    .map((name, i) => ({ name, value: 80 - i * 8 }));
  readonly bars: Bar[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    .map((name, i) => ({ name, value: [120, 180, 164, 210, 190, 60, 40][i] }));
  readonly statusBars: Bar[] = GALLERY_STATUSES.slice(0, 8)
    .map((name, i) => ({ name, value: [8, 5, 12, 140, 22, 6, 9, 4][i], color: statusColor(name) }));
  readonly line: Point[] = Array.from({ length: 14 }, (_, i) => ({ label: `Sep ${i + 1}`, value: Math.round(40 + 25 * Math.sin(i / 2) + i * 3) }));
  readonly heat: HeatCell[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    .flatMap((day, d) => Array.from({ length: 24 }, (_, hour) => ({ day, hour, value: (d * 7 + hour * 3) % 11 > 6 ? (hour % 9) : 0 })));
  readonly ranked: RankedItem[] = [{ name: 'Invoice PDF extraction', value: 412 }, { name: 'Nightly CSV import', value: 298 },
    { name: 'Customer sync', value: 177 }, { name: 'Transcript minutes', value: 96 }, { name: 'Bucket clean-up', value: 41 }];
  readonly groupNames = ['Q1', 'Q2', 'Q3'];
  readonly grouped: GroupedSeries[] = [{ name: 'Storage', values: [42, 51, 60] }, { name: 'Compute', values: [30, 28, 44] },
    { name: 'AI', values: [12, null, 26] }];
  readonly split: SplitRow[] = [{ label: 'Nightly CSV import', positive: 96, negative: 4 }, { label: 'Invoice PDF extraction', positive: 71, negative: 29 },
    { label: 'Customer sync', positive: 50, negative: 50 }];
  readonly durations = Array.from({ length: 80 }, (_, i) => 4 + ((i * 37) % 90) + (i % 7) * 11);
  readonly scatter: ScatterPoint[] = Array.from({ length: 30 }, (_, i) => ({ label: `run ${i}`, x: 10 + ((i * 13) % 97), y: 5 + ((i * 29) % 61) }));

  readonly page = signal(2);
  readonly size = signal(50);

  constructor() {
    effect(() => {
      const wanted = this.theme();
      if (wanted === 'dark' || wanted === 'light') this.setTheme(wanted);
    });
  }

  setTheme(theme: 'light' | 'dark'): void {
    this.themeChoice.set(theme);
    this.themeService.theme.set(theme);
  }

  showToasts(): void {
    this.toasts.success('Saved the schedule.');
    this.toasts.info('Export queued; it will appear under Files.');
    this.toasts.warn('Two rows were skipped: no customer id.');
    this.toasts.error('Could not reach the storage connection.');
  }
}
