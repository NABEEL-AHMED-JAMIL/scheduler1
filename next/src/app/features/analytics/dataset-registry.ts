import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { confirmWith } from '../../shared/ui/confirm';
import { AnalyticsService, RegisteredDataset } from './analytics.service';
import { ToastService } from '../../shared/ui/toast.service';

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
          <app-icon name="refresh" [class.spin]="loading()" />
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
          it holds no data of its own, and removing one never touches a file.
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
              <button type="button" class="btn btn-ghost btn-icon btn-xs btn-intent-crit shrink-0"
                      title="Remove from the registry"
                      [attr.aria-label]="'Remove ' + item.datasetName + ' from the registry'"
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
  private readonly toast = inject(ToastService);

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
      title: 'Remove this dataset from the registry?',
      body: `"${item.datasetName}" will be removed from the registry. The file it names is not `
        + 'touched — this registry holds names, never data.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!confirmed) return;
    this.analytics.deleteDataset(id).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.toast.error(response.message || 'That dataset could not be removed.');
          return;
        }
        this.load();
      },
      error: err => {
        this.toast.error(err?.error?.message || 'That dataset could not be removed.');
      },
    });
  }

  setAlias(value: string): void { this.typedAlias.set(value); }
  setPath(value: string): void { this.typedPath.set(value); }
}
