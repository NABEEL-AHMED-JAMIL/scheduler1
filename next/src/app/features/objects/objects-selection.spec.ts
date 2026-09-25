import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { HttpClient } from '@angular/common/http';
import { of } from 'rxjs';
import { Objects } from './objects';
import { AuthService } from '../../core/auth/auth.service';
import { BucketSummary, ObjectSummary, StorageService } from './storage.service';

const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };
const SALES: ObjectSummary = { name: 'sales.csv', key: 'daily/sales.csv', folder: false };
const NOTES: ObjectSummary = { name: 'notes.txt', key: 'daily/notes.txt', folder: false };
const OK = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });

/** A browser showing two files, both ticked, with a search that now hides one of them. */
function browserWithHiddenSelection() {
  const deleted: string[][] = [];
  const shared: string[][] = [];
  const downloaded: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: HttpClient, useValue: {
        get: vi.fn(() => of(OK(null))),
        post: vi.fn((url: string, body: { keys?: string[] }) => {
          if (url.includes('fileShare.json/send')) shared.push(body.keys ?? []);
          return of(OK(null));
        }),
      } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
      { provide: StorageService, useValue: {
        buckets: () => of(OK([MINIO])),
        listObjects: () => of(OK({ objects: [SALES, NOTES] })),
        deleteObjects: (_bucket: string, keys: string[]) => { deleted.push(keys); return of(OK(null)); },
        download: (_bucket: string, key: string) => { downloaded.push(key); return of(new Blob()); },
        share: (_bucket: string, keys: string[]) => { shared.push(keys); return of(OK(null)); },
      } },
      // Every dialog answers yes: the share form with an address, the delete confirm with true.
      // The share dialog sends by itself (ShareOptions.send); this is the person pressing Send.
      { provide: Dialog, useValue: { open: (_component: unknown, config?: { data?: any }) => {
        if (config?.data?.send) {
          const typed = { recipientEmail: 'a@b.example', message: '' };
          config.data.send(typed).subscribe();
          return { closed: of(typed) };
        }
        return { closed: of(true) };
      } } },
      { provide: AuthService, useValue: { user: () => null, displayName: () => 'Tester' } },
    ],
  });
  const fixture = TestBed.createComponent(Objects);
  fixture.detectChanges();
  const objects = fixture.componentInstance;
  objects.bucket.set(MINIO.bucket);
  objects.objects.set([SALES, NOTES]);
  objects.selected.set(new Set([SALES.key, NOTES.key]));
  objects.search.set('sales');
  fixture.detectChanges();
  return { fixture, objects, deleted, shared, downloaded };
}

describe('acting on a selection the filter has partly hidden', () => {
  /** "Delete 2" deleted notes.txt, a file the search had taken off the screen. */
  it('deletes only the files still on screen', async () => {
    const view = browserWithHiddenSelection();
    await view.objects.removeSelected();
    expect(view.deleted).toEqual([[SALES.key]]);
  });

  it('emails only the files still on screen', () => {
    const view = browserWithHiddenSelection();
    view.objects.share();
    expect(view.shared).toEqual([[SALES.key]]);
  });

  it('counts only the files still on screen on the action buttons', () => {
    const view = browserWithHiddenSelection();
    const labels = Array.from((view.fixture.nativeElement as HTMLElement).querySelectorAll('button'))
      .map(b => (b.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(labels).toContain('Delete 1');
    expect(labels).not.toContain('Delete 2');
  });
});
