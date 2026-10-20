import { Injectable, inject } from '@angular/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { TabCounts } from '../../core/nav/tab-counts';
import { ReportStudioApi } from './report-studio.api';

/**
 * Report Studio's tab numbers (approved drawings: "Templates 12 · Library 24 · Assets & branding 6"): the workspace's
 * templates and reports from the overview's figures, its assets from the asset library's counts. Each hub page asks
 * when it loads, for the workspace it shows; a number that cannot be read is left off rather than shown wrong.
 */
@Injectable({ providedIn: 'root' })
export class RsTabCounts {
  private readonly api = inject(ReportStudioApi);
  private readonly tabs = inject(TabCounts);

  refresh(tenantId?: number | null): void {
    forkJoin({
      overview: this.api.overview(tenantId).pipe(catchError(() => of(null))),
      assets: this.api.assets({ limit: 1 }, tenantId).pipe(catchError(() => of(null))),
    }).subscribe(({ overview, assets }) => this.tabs.set({
      '/reports/templates': overview?.figures?.templates,
      '/reports/library': overview?.figures?.reports,
      '/reports/assets': assets?.counts?.all,
    }));
  }
}
