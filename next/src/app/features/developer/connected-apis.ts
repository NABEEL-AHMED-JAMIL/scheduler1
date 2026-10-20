import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_SUCCESS } from '../../core/api/api.config';
import { PageHeader } from '../../shared/ui/page-header';
import { Icon } from '../../shared/ui/icon';
import { LoadError } from '../../shared/ui/load-error';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ApiCollectionsApi } from '../integration/api-collections/api-collections.service';
import { RequestRow, RequestSample } from '../integration/api-collections/api-collections.model';
import { methodClass } from './reference-model';
import { DevCode } from './code-block';

interface CollectionView { collectionId: number; name: string; description: string | null; requests: RequestRow[] }

/**
 * Owner #28 (2026-10-19): the other half of the portal -- every API this workspace's pipelines and workflows call out to:
 * each saved request of its API collections with its method and address template (secrets are {{variables}} kept in
 * integration-service, never here), and its last answer as the runner kept it (masked, cut), opened on demand. Where a
 * Call API step or Read API step points, a developer can see what it sends and what came back.
 */
@Component({
  selector: 'app-developer-connected',
  imports: [PageHeader, RouterLink, Icon, LoadError, ServerTimePipe, DevCode],
  template: `
    <div class="page" data-developer-connected>
      <app-page-header title="APIs this workspace calls"
                       subtitle="The saved requests pipelines and workflows send (Read API, Enrich, Call API), and what each last answered." />
      @if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (loading()) {
        <p class="text-sm text-[color:var(--text-muted)]"><span class="spinner inline-block align-middle mr-2"></span>Reading the collections…</p>
      } @else if (!collections().length) {
        <section class="card p-4 text-sm text-[color:var(--text-secondary)]">
          No API collection yet. <a class="link-inline" routerLink="/connections/api-collections">Add one</a> to call an API from a pipeline.
        </section>
      }
      @for (c of collections(); track c.collectionId) {
        <section class="card overflow-hidden" [attr.data-collection]="c.collectionId">
          <header class="px-4 pt-4 pb-2">
            <h2 class="section-title"><a class="link-inline" [routerLink]="'/connections/api-collections/' + c.collectionId">{{ c.name }}</a></h2>
            @if (c.description) { <p class="text-sm text-[color:var(--text-secondary)]">{{ c.description }}</p> }
          </header>
          <ul class="divide-y divide-[color:var(--border-subtle)]">
            @for (r of c.requests; track r.requestId) {
              <li class="px-4 py-2" [attr.data-request]="r.requestId">
                <div class="flex flex-wrap items-center gap-3 text-sm">
                  <span [class]="methodOf(r.method)">{{ r.method.toUpperCase() }}</span>
                  <span class="font-medium">{{ r.name }}</span>
                  <span class="mono text-xs text-[color:var(--text-muted)] min-w-0 truncate">{{ r.urlTemplate }}</span>
                  @if (!r.enabled) { <span class="pill pill-neutral">Disabled</span> }
                  <button type="button" class="btn btn-ghost btn-sm ml-auto" [attr.aria-expanded]="open() === r.requestId" (click)="toggle(r.requestId)">
                    <app-icon [name]="open() === r.requestId ? 'chevronDown' : 'chevronRight'" />Last answer
                  </button>
                </div>
                @if (open() === r.requestId) {
                  <div class="mt-2" data-sample>
                    @if (samples()[r.requestId] === undefined) {
                      <p class="text-sm text-[color:var(--text-muted)]"><span class="spinner inline-block align-middle mr-2"></span>Reading…</p>
                    } @else if (samples()[r.requestId] === null) {
                      <p class="text-sm text-[color:var(--text-muted)]">No answer kept yet: none was called, or every call failed before an answer.</p>
                    } @else {
                      <p class="text-xs text-[color:var(--text-secondary)] mb-1">
                        HTTP {{ samples()[r.requestId]!.statusCode ?? '—' }} · {{ samples()[r.requestId]!.at | serverTime: 'dateTime' }}
                        @if (samples()[r.requestId]!.truncated) { · cut short }
                      </p>
                      <app-dev-code label="Last answer" [snippets]="[{ key: 'body', label: 'Body', code: samples()[r.requestId]!.body }]" />
                    }
                  </div>
                }
              </li>
            } @empty {
              <li class="px-4 py-3 text-sm text-[color:var(--text-muted)]">No requests in this collection.</li>
            }
          </ul>
        </section>
      }
    </div>
  `,
})
export class DeveloperConnected {
  private readonly api = inject(ApiCollectionsApi);

  readonly collections = signal<CollectionView[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly open = signal<number | null>(null);
  readonly samples = signal<Record<number, RequestSample | null | undefined>>({});

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list('', 1, 50).subscribe({
      next: list => {
        const rows = Array.isArray(list?.data) ? list.data : [];
        if (!rows.length) { this.loading.set(false); this.collections.set([]); return; }
        forkJoin(rows.map(c => this.api.get(c.collectionId).pipe(map(r => r.status === API_SUCCESS ? r.data : null), catchError(() => of(null)))))
          .subscribe(details => {
            this.loading.set(false);
            this.collections.set(details.filter(d => !!d).map(d => ({
              collectionId: d!.collection.collectionId, name: d!.collection.name, description: d!.collection.description ?? null,
              requests: d!.requests ?? [],
            })));
          });
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the API collections.'); },
    });
  }

  toggle(requestId: number): void {
    if (this.open() === requestId) { this.open.set(null); return; }
    this.open.set(requestId);
    if (this.samples()[requestId] !== undefined) return;
    this.api.sample(requestId).subscribe({
      next: r => this.samples.update(s => ({ ...s, [requestId]: r.status === API_SUCCESS ? r.data ?? null : null })),
      error: () => this.samples.update(s => ({ ...s, [requestId]: null })),
    });
  }

  methodOf(method: string): string {
    return methodClass(method);
  }
}
