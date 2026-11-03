import { Component, DestroyRef, ElementRef, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { PageHeader } from '../../../shared/ui/page-header';
import { Icon } from '../../../shared/ui/icon';
import { LoadError } from '../../../shared/ui/load-error';
import { AppLoading } from '../../../shared/ui/loading';
import { ToastService } from '../../../shared/ui/toast.service';
import { crumbsFor } from '../../../core/nav/nav-tree';
import { rsTime } from '../rs-time.pipe';
import { ReportStudioApi, studioError } from '../report-studio.api';
import { ReportDetail, ReportVersionRow } from '../report-studio.model';
import { CompareChange, CompareSide, Comparison, HighlightBox, ReportLibraryApi } from '../report-library.api';
import { fileNameOf, saveBlob } from '../report-files';

export type CompareMode = 'side' | 'changes' | 'overlay';
export type ChangeFilter = 'all' | 'data' | 'template' | 'approval';

/** A fraction of the page as a CSS percentage of the page picture (at least {@code min}: a box stays visible). */
export function pct(v: number, min = 0): number {
  return Math.round(Math.max(0, Math.min(1, Math.max(v, min))) * 10_000) / 100;
}

/** The pages to show: every page of the longer version, or (changes only) the pages either side highlights. */
export function pagesShown(pagesA: number, pagesB: number, c: Comparison | null, mode: CompareMode): number[] {
  const all = Array.from({ length: Math.max(pagesA, pagesB, 1) }, (_, i) => i + 1);
  if (mode !== 'changes' || !c) return all;
  const changed = new Set<number>([...c.highlights.a, ...c.highlights.b].map(h => h.page));
  c.changes.forEach(ch => { if (ch.page) changed.add(ch.page); });
  return all.filter(p => changed.has(p));
}

/** The changes on page {@code p}: the listed ones that name it, else the boxes the later (or earlier) version highlights there. */
export function changesOn(c: Comparison | null, p: number): number {
  if (!c) return 0;
  const listed = c.changes.filter(ch => ch.page === p).length;
  if (listed) return listed;
  const later = c.highlights.b.filter(h => h.page === p).length;
  return later || c.highlights.a.filter(h => h.page === p).length;
}

/** A version's choice in the pickers: "v1 · 21 Oct, 21:49 · Void". */
export function versionWords(v: ReportVersionRow): string {
  const state = v.void ? 'Void' : v.approval?.signed ? 'Signed' : v.approval ? 'Approved' : v.review && !v.review.decidedAt ? 'Waiting' : 'Ready';
  return `v${v.version} · ${rsTime(v.createdAt, 'recent') ?? ''} · ${state}`;
}

const STATE_WORDS: Record<CompareSide['state'], string> = {
  VOID: 'Void', APPROVED: 'Approved', WAITING: 'Waiting for approval', REJECTED: 'Sent back', GENERATED: 'Not approved',
};

/**
 * Reports redesign, feature 10 (design compare.html): two versions of a report side by side -- their pages scrolling
 * together with what changed highlighted, and the exact change list from each version's frozen data, the template change
 * and the approval change, filterable. Opened from the report's Versions ("Compare v1 and v2") and the library's side
 * panel ("Compare with v1"); /reports/library/:reportId/compare?a=1&b=2. Read as the report is (report-library); values the
 * template tags personal show as ••• without See personal data, as the service answers them.
 */
@Component({
  selector: 'app-compare-versions',
  imports: [PageHeader, Icon, LoadError, AppLoading, RouterLink],
  templateUrl: './compare-page.html',
  styleUrl: './compare-page.css',
})
export class CompareVersions {
  readonly reportId = input.required<string>();
  /** The versions, from the address (?a=1&b=2); absent: the one before the current and the current. */
  readonly a = input<string | undefined>();
  readonly b = input<string | undefined>();

  private readonly studio = inject(ReportStudioApi);
  private readonly library = inject(ReportLibraryApi);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;
  private readonly destroyRef = inject(DestroyRef);

  readonly report = signal<ReportDetail | null>(null);
  readonly comparison = signal<Comparison | null>(null);
  readonly error = signal('');
  readonly comparing = signal(false);
  readonly mode = signal<CompareMode>('side');
  readonly filter = signal<ChangeFilter>('all');
  readonly together = signal(true);
  readonly page = signal(1);
  readonly selected = signal<string | null>(null);
  readonly downloading = signal(false);
  /** Each side's page pictures, by page: an object URL once drawn. */
  readonly picturesA = signal<Record<number, string>>({});
  readonly picturesB = signal<Record<number, string>>({});
  private urls: string[] = [];
  private loads?: Subscription;
  private compareSub?: Subscription;

  readonly versions = computed(() => [...(this.report()?.versions ?? [])].sort((x, y) => y.version - x.version));
  readonly pickA = computed(() => {
    const n = Number(this.a());
    const r = this.report();
    if (Number.isInteger(n) && n > 0) return n;
    return r?.currentVersion && r.currentVersion > 1 ? r.currentVersion - 1 : 1;
  });
  readonly pickB = computed(() => {
    const n = Number(this.b());
    if (Number.isInteger(n) && n > 0) return n;
    return this.report()?.currentVersion ?? 2;
  });
  readonly trail = computed(() => {
    const r = this.report();
    const crumbs = crumbsFor('/reports/library', r?.name ?? 'Report', true);
    const last = crumbs[crumbs.length - 1];
    return [...crumbs.slice(0, -1), { ...last, link: `/reports/library/${this.reportId()}` }];
  });
  readonly pagesA = computed(() => this.comparison()?.a.pages ?? 0);
  readonly pagesB = computed(() => this.comparison()?.b.pages ?? 0);
  readonly pages = computed(() => pagesShown(this.pagesA(), this.pagesB(), this.comparison(), this.mode()));
  readonly pageCount = computed(() => Math.max(this.pagesA(), this.pagesB(), 1));
  /** The listed changes on the page shown (by the page the list gives each); a page only the highlights mark counts its boxes. */
  readonly changesOnPage = computed(() => changesOn(this.comparison(), this.page()));
  readonly shownChanges = computed(() => {
    const f = this.filter();
    return (this.comparison()?.changes ?? []).filter(c => f === 'all' || c.kind === f);
  });
  readonly pct = pct;
  readonly stateWords = STATE_WORDS;
  readonly versionWords = versionWords;

  constructor() {
    effect(() => {
      const id = this.reportId();
      this.loadReport(id);
    });
    effect(() => {
      const r = this.report();
      const a = this.pickA();
      const b = this.pickB();
      if (r) this.compare(a, b);
    });
    this.destroyRef.onDestroy(() => this.release());
  }

  private loadReport(id: string): void {
    this.studio.report(id).subscribe({
      next: r => this.report.set(r),
      error: e => this.error.set(studioError(e, 'The report could not be loaded.').message),
    });
  }

  retry(): void {
    this.error.set('');
    if (!this.report()) this.loadReport(this.reportId());
    else this.compare(this.pickA(), this.pickB());
  }

  private compare(a: number, b: number): void {
    if (a === b) {
      this.error.set('Pick two different versions to compare.');
      return;
    }
    this.error.set('');
    this.comparing.set(true);
    this.compareSub?.unsubscribe();
    this.compareSub = this.library.compare(this.reportId(), a, b).subscribe({
      next: c => {
        this.comparison.set(c);
        this.comparing.set(false);
        this.page.set(1);
        this.selected.set(null);
        this.pictures(c);
      },
      error: e => {
        this.comparing.set(false);
        this.error.set(studioError(e, 'The versions could not be compared.').message);
      },
    });
  }

  /** Both sides' page pictures, one after another (the service draws a version's pages once and keeps them a while). */
  private pictures(c: Comparison): void {
    this.release();
    this.picturesA.set({});
    this.picturesB.set({});
    const jobs: { side: 'a' | 'b'; version: number; page: number }[] = [];
    const n = Math.min(40, Math.max(c.a.pages ?? 0, c.b.pages ?? 0));
    for (let p = 1; p <= n; p++) {
      if (!c.a.expired && p <= (c.a.pages ?? 0)) jobs.push({ side: 'a', version: c.a.version, page: p });
      if (!c.b.expired && p <= (c.b.pages ?? 0)) jobs.push({ side: 'b', version: c.b.version, page: p });
    }
    let i = 0;
    const next = () => {
      if (i >= jobs.length) return;
      const j = jobs[i++];
      this.loads = this.library.page(this.reportId(), j.version, j.page).subscribe({
        next: res => {
          if (res.body) {
            const url = URL.createObjectURL(res.body);
            this.urls.push(url);
            (j.side === 'a' ? this.picturesA : this.picturesB).update(m => ({ ...m, [j.page]: url }));
          }
          next();
        },
        error: () => next(),
      });
    };
    next();
  }

  private release(): void {
    this.loads?.unsubscribe();
    this.urls.forEach(u => URL.revokeObjectURL(u));
    this.urls = [];
  }

  /** A version picked: the address changes (so it can be shared), and the comparison follows it. */
  pick(side: 'a' | 'b', value: string): void {
    const n = Number(value);
    if (!Number.isInteger(n)) return;
    const a = side === 'a' ? n : this.pickA();
    const b = side === 'b' ? n : this.pickB();
    void this.router.navigate([], { queryParams: { a, b }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  swap(): void {
    void this.router.navigate([], { queryParams: { a: this.pickB(), b: this.pickA() }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  boxes(side: 'a' | 'b', page: number): HighlightBox[] {
    return (this.comparison()?.highlights[side] ?? []).filter(h => h.page === page);
  }

  hasPage(side: 'a' | 'b', page: number): boolean {
    return page <= (side === 'a' ? this.pagesA() : this.pagesB());
  }

  go(page: number): void {
    const list = this.pages();
    if (!list.length) return;
    const target = list.includes(page) ? page : page > this.page() ? list.find(p => p > this.page()) ?? list[list.length - 1]
      : [...list].reverse().find(p => p < this.page()) ?? list[0];
    this.page.set(target);
    queueMicrotask(() => {
      for (const side of ['b', 'a', 'o']) {
        const el = this.host.querySelector<HTMLElement>(`[data-page-id="${side}-${target}"]`);
        el?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    });
  }

  previous(): void {
    const list = this.pages();
    const at = list.indexOf(this.page());
    this.go(at > 0 ? list[at - 1] : list[0]);
  }

  nextPage(): void {
    const list = this.pages();
    const at = list.indexOf(this.page());
    this.go(at >= 0 && at < list.length - 1 ? list[at + 1] : list[list.length - 1]);
  }

  /** A change picked in the list: its page shown on both sides. */
  choose(c: CompareChange): void {
    this.selected.set(c.id);
    if (c.page) {
      if (this.mode() === 'changes' && !this.pages().includes(c.page)) this.mode.set('side');
      this.go(c.page);
    }
  }

  count(kind: ChangeFilter): number {
    const c = this.comparison()?.counts;
    if (!c) return 0;
    return kind === 'all' ? c.all : c[kind];
  }

  downloadPdf(): void {
    const c = this.comparison();
    if (!c) return;
    this.downloading.set(true);
    this.library.comparePdf(this.reportId(), c.a.version, c.b.version).subscribe({
      next: res => {
        this.downloading.set(false);
        if (res.body) saveBlob(res.body, fileNameOf(res.headers.get('Content-Disposition'), `compare-v${c.a.version}-v${c.b.version}.pdf`));
      },
      error: e => {
        this.downloading.set(false);
        this.toast.error(studioError(e, 'The comparison PDF could not be made.').message);
      },
    });
  }

  sideFacts(s: CompareSide): string {
    return [rsTime(s.createdAt, 'recent'), `template v${s.templateVersion}`, s.dataFrozenAt ? `data frozen ${rsTime(s.dataFrozenAt, 'day')}` : '']
      .filter(Boolean).join(' · ');
  }
}
