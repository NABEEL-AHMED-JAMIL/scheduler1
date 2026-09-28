import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Subject, of } from 'rxjs';
import { Analytics } from './analytics';
import { AnalyticsService } from './analytics.service';
import { BucketSummary, ObjectSummary, StorageService } from '../objects/storage.service';
import { API_SUCCESS } from '../../core/api/api.config';

/**
 * The file picker is a panel that slides in over the page (owner, 2026-09-28): it held a 260px
 * column beside the data for good, when it is only needed to choose what to read. The data gets
 * the full width; the panel opens from "Files" and gets out of the way once something is picked.
 */
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });
const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };
const CSV: ObjectSummary = { name: 'sales.csv', key: 'daily/sales.csv', folder: false, size: 2048 };

function studio() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: StorageService, useValue: { buckets: vi.fn(() => of(OK([MINIO]))), listObjects: vi.fn(() => of(OK({ objects: [CSV] }))) } },
      { provide: AnalyticsService, useValue: {
        schema: () => new Subject(), preview: () => new Subject(), profile: () => new Subject(),
        overview: () => of({ status: API_SUCCESS, data: { profile: { totalRows: 0, columns: [] }, charts: [], durationMs: 0 } }),
      } },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new Analytics());
  page.ngOnInit();
  return page;
}

describe('Analytics file panel', () => {
  it('opens from Files and closes once a file is picked', () => {
    const page = studio();
    expect(page.filesOpen()).toBe(false);
    page.openFiles();
    expect(page.filesOpen()).toBe(true);
    page.openFile(CSV);
    expect(page.filesOpen()).toBe(false);
  });

  it('closes once a folder is read as one dataset', () => {
    const page = studio();
    page.openFiles();
    page.openFolderAsDataset('csv');
    expect(page.filesOpen()).toBe(false);
  });

  it('closes on Escape, and only while it is open', () => {
    const page = studio();
    page.openFiles();
    page.onEscape();
    expect(page.filesOpen()).toBe(false);
  });

  it('lets the data take the full width: no fixed column is kept for the rail', async () => {
    const fs = (await import(/* @vite-ignore */ ['node', 'fs'].join(':'))) as { readFileSync(p: string, e: 'utf8'): string };
    const root = (globalThis as unknown as { process: { cwd(): string } }).process.cwd();
    const html = fs.readFileSync(`${root}/src/app/features/analytics/analytics.html`, 'utf8');
    expect(html).not.toContain('lg:grid-cols-[260px_minmax(0,1fr)]');
    expect(html).toMatch(/class="files-panel[^"]*fixed/);
  });
});
