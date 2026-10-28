import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { API_SUCCESS } from '../../core/api/api.config';
import { PageHeader } from '../../shared/ui/page-header';
import { Icon } from '../../shared/ui/icon';
import { LoadError } from '../../shared/ui/load-error';
import { AppLoading, loadErrorText } from '../../shared/ui/loading';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ApiCollectionsApi } from '../integration/api-collections/api-collections.service';
import { RequestRow, RequestSample } from '../integration/api-collections/api-collections.model';
import { methodClass } from './reference-model';
import { DevCode } from './code-block';
import { WorkspaceSelect } from '../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';

interface CollectionView { collectionId: number; name: string; description: string | null; requests: RequestRow[] }

/**
 * Owner #28 (2026-10-19): the other half of the portal -- every API this workspace's pipelines and workflows call out to:
 * each saved request of its API collections with its method and address template (secrets are {{variables}} kept in
 * integration-service, never here), and its last answer as the runner kept it (masked, cut), opened on demand. Where a
 * Call API step or Read API step points, a developer can see what it sends and what came back. A platform administrator
 * picks the workspace in the header (the shared selector, opening on this session's last pick); until then nothing is read.
 */
@Component({
  selector: 'app-developer-connected',
  imports: [PageHeader, RouterLink, Icon, LoadError, AppLoading, ServerTimePipe, DevCode, WorkspaceSelect],
  template: `
    <div class="page" data-developer-connected>
      <app-page-header title="APIs this workspace calls"
                       subtitle="The saved requests pipelines and workflows send (Read API, Enrich, Call API), and what each last answered.">
        <app-workspace-select [value]="tenantId()" (valueChange)="pickWorkspace($event)" />
      </app-page-header>
      @if (needsWorkspace()) {
        <section class="card p-8 text-center text-sm text-[color:var(--text-muted)]" data-test="pick-workspace">
          Pick a workspace to see the APIs it calls.
        </section>
      } @else if (error()) {
        <app-load-error [message]="error()" (retry)="load()" />
      } @else if (loading()) {
        <app-loading shape="cards" label="Loading API collections…" [count]="2" />
      } @else if (!collections().length && !unread()) {
        <section class="card p-4 text-sm text-[color:var(--text-secondary)]">
          No API collection yet. <a class="link-inline" routerLink="/connections/api-collections">Add one</a> to call an API from a pipeline.
        </section>
      }
      @if (!loading() && !error() && unread()) {
        <!-- Owner 2026-10-27: a collection whose detail would not load used to just disappear; say so, with Try again. -->
        <p class="card px-4 py-2.5 text-sm text-crit-500 flex flex-wrap items-center gap-2" role="alert" data-collections-unread>
          <app-icon name="alert" />{{ unread() === 1 ? '1 collection' : unread() + ' collections' }} could not be read.
          <button type="button" class="btn btn-default btn-sm" (click)="load()"><app-icon name="refresh" />Try again</button>
        </p>
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
                  <button type="button" class="btn btn-default btn-sm ml-auto" [attr.aria-expanded]="open() === r.requestId" (click)="toggle(r.requestId)">
                    <app-icon [name]="open() === r.requestId ? 'chevronDown' : 'chevronRight'" />Last answer
                  </button>
                </div>
                @if (open() === r.requestId) {
                  <div class="mt-2" data-sample>
                    @if (sampleErrors()[r.requestId]; as why) {
                      <p class="text-sm text-crit-500 flex flex-wrap items-center gap-2" role="alert">
                        <app-icon name="alert" />{{ why }}
                        <button type="button" class="btn btn-default btn-xs" (click)="readSample(r.requestId)"><app-icon name="refresh" />Try again</button>
                      </p>
                    } @else if (samples()[r.requestId] === undefined) {
                      <app-loading shape="inline" label="Loading the last answer…" />
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
  private readonly directory = inject(WorkspaceDirectory);

  /** The workspace a platform administrator picked; null for anyone else (their own). */
  readonly tenantId = signal<number | null>(this.directory.remembered());
  readonly needsWorkspace = computed(() => this.directory.picks() && this.tenantId() === null);

  readonly collections = signal<CollectionView[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly open = signal<number | null>(null);
  readonly samples = signal<Record<number, RequestSample | null | undefined>>({});
  /** Owner 2026-10-27: a sample read that failed says so (it used to read as "No answer kept yet"). */
  readonly sampleErrors = signal<Record<number, string>>({});
  /** How many collections were listed but whose detail could not be read (they would otherwise just be missing). */
  readonly unread = signal(0);

  constructor() {
    if (!this.needsWorkspace()) this.load();
  }

  pickWorkspace(id: number | null): void {
    this.tenantId.set(id);
    this.collections.set([]);
    this.open.set(null);
    this.samples.set({});
    this.sampleErrors.set({});
    this.unread.set(0);
    if (id !== null) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const asked = this.tenantId();
    this.api.list('', 1, 50, asked).subscribe({
      next: list => {
        if (asked !== this.tenantId()) return;
        // A refusal is an error, not "no collection yet".
        if (list && list.status && list.status !== API_SUCCESS) {
          this.loading.set(false);
          this.error.set(loadErrorText(list, 'The API collections could not be read.'));
          return;
        }
        const rows = Array.isArray(list?.data) ? list.data : [];
        if (!rows.length) { this.loading.set(false); this.unread.set(0); this.collections.set([]); return; }
        forkJoin(rows.map(c => this.api.get(c.collectionId, asked).pipe(map(r => r.status === API_SUCCESS ? r.data : null),
          catchError(() => of(null)))))
          .subscribe(details => {
            if (asked !== this.tenantId()) return;
            this.loading.set(false);
            this.unread.set(details.filter(d => !d).length);
            this.collections.set(details.filter(d => !!d).map(d => ({
              collectionId: d!.collection.collectionId, name: d!.collection.name, description: d!.collection.description ?? null,
              requests: d!.requests ?? [],
            })));
          });
      },
      error: err => {
        if (asked !== this.tenantId()) return;
        this.loading.set(false);
        this.error.set(loadErrorText(err, 'The API collections could not be read.'));
      },
    });
  }

  toggle(requestId: number): void {
    if (this.open() === requestId) { this.open.set(null); return; }
    this.open.set(requestId);
    if (this.samples()[requestId] !== undefined && !this.sampleErrors()[requestId]) return;
    this.readSample(requestId);
  }

  readSample(requestId: number): void {
    this.samples.update(s => ({ ...s, [requestId]: undefined }));
    this.sampleErrors.update(e => { const next = { ...e }; delete next[requestId]; return next; });
    const fail = (err: unknown) => this.sampleErrors.update(e => ({ ...e, [requestId]: loadErrorText(err, 'The last answer could not be read.') }));
    this.api.sample(requestId, this.tenantId()).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { fail(r); return; }
        this.samples.update(s => ({ ...s, [requestId]: r.data ?? null }));
      },
      error: fail,
    });
  }

  methodOf(method: string): string {
    return methodClass(method);
  }
}
