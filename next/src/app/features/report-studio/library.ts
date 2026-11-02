import { plainHint } from '../../shared/ui/plain-words';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription, interval } from 'rxjs';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { TableShell } from '../../shared/ui/data-table';
import { StatusPill } from '../../shared/ui/status-pill';
import { Segmented, SegmentOption } from '../../shared/ui/segmented';
import { Pagination } from '../../shared/ui/pagination';
import { PAGE_SIZES } from '../../shared/ui/pager';
import { RsTimePipe } from './rs-time.pipe';
import { AuthService } from '../../core/auth/auth.service';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { LibraryQuery, ReportStudioApi, studioError } from './report-studio.api';
import { JobRow, chipWord, isRunning, stageWord } from './report-studio.model';
import { RsTabCounts } from './rs-tab-counts';
import { PageLimitActions } from './page-limit-actions';
import { SortHeader } from '../../shared/ui/sort-header';
import { SortState, TableSort, createTableSort } from '../../shared/ui/sort';
import { LibraryExplorer } from './library-explorer';

type View = 'reports' | 'jobs';

/**
 * See results › Reports › Reports (MIG-403, Figma frames 1 and 6; page report-library): every report with its current
 * version, and every generation job -- running ones followed live, failed ones with their code. A report's page has its
 * versions and lineage. The old Generated reports page's pipeline files are under "From pipelines" (render_pdf).
 *
 * Owner 2026-10-20 ("report need a pagination"): both lists page on the server -- status, search, page and size go to
 * reportLibrary.json, which answers one page and the total -- so a workspace with thousands of reports shows them all.
 */
@Component({
  selector: 'app-report-library',
  imports: [PageHeader, WorkspaceSelect, RefreshButton, Icon, TableShell, StatusPill, Segmented, Pagination, RsTimePipe, RouterLink, PageLimitActions, SortHeader,
    LibraryExplorer],
  styles: `
    .rs-bulk-bar { position: sticky; bottom: 0.75rem; z-index: 5; display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 0.75rem;
      margin: 0.5rem 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border-strong); border-radius: var(--radius-lg);
      background: var(--surface-raised); box-shadow: 0 8px 24px -12px var(--shadow-color); font-size: 0.875rem; }
    tr.is-selected > td { background: var(--surface-sunken); }
  `,
  templateUrl: './library.html',
})
export class ReportLibrary implements OnInit {
  /** ZT-U8: a job's message in the menu's words (Reports › Settings, not Report Studio › Settings). */
  plain(text: string | null | undefined): string { return plainHint(text ?? ''); }
  private readonly api = inject(ReportStudioApi);
  private readonly auth = inject(AuthService);
  private readonly tabCounts = inject(RsTabCounts);
  private readonly route = inject(ActivatedRoute);
  private readonly workspaces = inject(WorkspaceDirectory);
  /** A platform administrator's pick (the one workspace selector, owner #5); null is every workspace. Members: their own. */
  readonly tenantId = signal<number | null>(this.workspaces.remembered());
  private readonly destroy = inject(DestroyRef);

  readonly view = signal<View>('reports');
  readonly jobs = signal<JobRow[]>([]);
  /** How many the filters match in all, as the service counts them (the rows are one page of it). */
  readonly total = signal(0);
  readonly page = signal(1);
  readonly size = signal(PAGE_SIZES[0]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly status = signal('');
  readonly chipWord = chipWord;
  readonly stageWord = stageWord;
  readonly isRunning = isRunning;
  private poll?: Subscription;
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  /** Answers come back in any order: only the latest read's is kept. */
  private asked = 0;

  /**
   * Owner 2026-10-27 ("add a sort on each table"): both lists sort on the server (reportLibrary.json's sort and dir, an
   * allow-list per list), so a sort covers every report or job, not only the page shown. Reports arrive newest change
   * first, which is Updated, newest first: that is the table's own order, and the request names no sort until another
   * one is picked. Jobs arrive newest queued first, which no column shows: no column is marked until one is picked. A new
   * order goes back to page 1.
   */
  readonly jobSort = createTableSort<JobRow>({
    id: 'report-jobs', server: true, initial: null,
    columns: {
      job: { value: j => j.jobNo, kind: 'number', param: 'job' },
      report: { value: j => j.reportName, kind: 'text', param: 'report' },
      template: { value: j => j.templateName, kind: 'text', param: 'template' },
      progress: { value: j => j.status, kind: 'status', param: 'status' },
      started: { value: j => j.startedAt || j.createdAt, kind: 'date', param: 'startedAt' },
      finished: { value: j => j.finishedAt, kind: 'date', param: 'finishedAt' },
    },
    onChange: () => this.resort('jobs'),
  });

  /** A new order for the list on screen: from the first page again. */
  private resort(list: View): void {
    if (list !== this.view()) return;
    this.page.set(1);
    this.read();
  }

  /** What a read carries for this sort: nothing for the list's own order (so the service keeps it), else sort and dir. */
  private static sortParams<T>(sort: TableSort<T>, own: SortState | null): { sort?: string; dir?: 'asc' | 'desc' } {
    const p = sort.param();
    const s = sort.state();
    if (!p || (own && s.key === own.key && s.direction === own.direction)) return {};
    return { sort: p.sort, dir: p.dir };
  }

  readonly views: SegmentOption<View>[] = [{ id: 'reports', label: 'Reports' }, { id: 'jobs', label: 'Generation jobs' }];
  readonly canGenerate = computed(() => this.auth.canOpen('report-generate') && !this.auth.isPlatformAdmin());
  readonly canPipelineFiles = computed(() => this.auth.canOpen('tools-converter'));
  readonly filtered = computed(() => !!this.search().trim() || !!this.status());

  ngOnInit(): void {
    if (this.route.snapshot.queryParamMap.get('view') === 'jobs') this.view.set('jobs');
    this.load();
    // Running jobs move on their own: every five seconds while one on this page is running, this page is read again.
    this.poll = interval(5000).subscribe(() => { if (!this.loading() && this.running()) this.read(true); });
    this.destroy.onDestroy(() => {
      this.poll?.unsubscribe();
      if (this.searchTimer) clearTimeout(this.searchTimer);
    });
  }

  setView(v: View): void {
    if (v === this.view()) return;
    this.view.set(v);
    this.status.set('');
    this.jobs.set([]);
    this.total.set(0);
    this.page.set(1);
    this.read();
  }

  setStatus(value: string): void {
    this.status.set(value);
    this.page.set(1);
    this.read();
  }

  /** The service searches: wait for the typing to stop, then ask again from the first page. */
  onSearch(value: string): void {
    this.search.set(value);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => { this.searchTimer = null; this.page.set(1); this.read(); }, 300);
  }

  goTo(page: number): void { this.page.set(page); this.read(); }
  setSize(size: number): void { this.size.set(size); this.page.set(1); this.read(); }

  /** Another workspace picked (and the first read): the tab counts and the list again, from the first page. */
  load(): void {
    this.page.set(1);
    this.refresh();
  }

  /** The refresh button: the tab counts and the page the reader is on. */
  refresh(): void {
    this.tabCounts.refresh(this.scope());
    this.read();
  }

  /** The current page of the current list, with its filters, as the service answers it. */
  read(quiet = false): void {
    // Reports redesign: the reports are the explorer's (reportLibrary.json/browse); this page reads the jobs.
    if (this.view() !== 'jobs') { this.loading.set(false); return; }
    if (!quiet) this.loading.set(true);
    this.error.set('');
    const asked = ++this.asked;
    const view = this.view();
    const query: LibraryQuery = { status: this.status(), q: this.search(), limit: this.size(), offset: (this.page() - 1) * this.size(),
      ...ReportLibrary.sortParams(this.jobSort, null) };
    const failed = (e: unknown) => {
      if (asked !== this.asked) return;
      this.error.set(studioError(e, view === 'jobs' ? 'The jobs could not be read.' : 'The reports could not be read.').message);
      this.loading.set(false);
    };
    const landed = (total: number, empty: boolean): boolean => {
      if (asked !== this.asked) return false;
      // A page emptied under us (reports archived, a filter elsewhere): the last page that still has rows.
      if (empty && total > 0 && this.page() > 1) {
        this.page.set(Math.max(1, Math.ceil(total / this.size())));
        this.read(quiet);
        return false;
      }
      this.total.set(total);
      this.loading.set(false);
      return true;
    };
    this.api.jobs(query, this.scope()).subscribe({
      next: p => { if (landed(p.total, !p.rows.length)) this.jobs.set(p.rows); },
      error: failed,
    });
  }

  private scope(): number | null {
    return this.auth.isPlatformAdmin() ? this.tenantId() : null;
  }

  private running(): boolean {
    return this.view() === 'jobs' && this.jobs().some(j => isRunning(j.status));
  }
}
