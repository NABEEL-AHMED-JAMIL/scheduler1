import { Component, Injector, OnInit, computed, inject, input, model, signal } from '@angular/core';
import { Combobox, ComboboxOption } from './combobox';
import { Icon } from './icon';
import { WorkspaceDirectory } from '../../core/workspaces/workspace-directory';
import { ManagedSession } from '../../features/admin/managed-service/managed-session';

/**
 * Owner #5 (2026-10-19): THE workspace selector -- one component on every screen where a platform administrator picks the
 * workspace a page looks at, in the same place: the page header's actions, first (before Refresh). It looks and behaves
 * the same everywhere: a type-to-search box over every workspace, the ones picked lately first, "All workspaces" only on a
 * page that can show every workspace at once (`allowAll`), and -- once one is picked -- "Work in this workspace" beside it
 * (owner #20), which opens a managed session there.
 *
 * The choice is kept for the session (WorkspaceDirectory): a screen opens with the workspace picked on the last one
 * (`WorkspaceDirectory.remembered()`). A workspace's own people never see it: it renders nothing unless the reader is a
 * platform administrator in their own session.
 *
 *   <app-page-header ...>
 *     <app-workspace-select [(value)]="tenantId" [allowAll]="true" (valueChange)="load()" />
 *     <app-refresh-button ... />
 *   </app-page-header>
 */
@Component({
  selector: 'app-workspace-select',
  imports: [Combobox, Icon],
  host: { class: 'workspace-select-host', '[class.hidden]': '!picks()' },
  styles: `
    :host { display: inline-flex; align-items: center; gap: 0.5rem; order: -2; min-width: 0; }
    :host(.hidden) { display: none; }
    .ws-box { width: 16rem; max-width: 100%; }
    .ws-label { font-size: 0.75rem; font-weight: 500; color: var(--text-secondary); white-space: nowrap; }
  `,
  template: `
    @if (picks()) {
      <label class="ws-label" [attr.for]="boxId">{{ label() }}</label>
      <app-combobox class="ws-box" [id]="boxId" [ariaLabel]="label()" data-test="workspace-select"
                    [placeholder]="allowAll() ? allLabel() : 'Pick a workspace'"
                    [allowClear]="allowAll()" [clearLabel]="allLabel()"
                    [options]="options()" [selected]="value() === null ? '' : '' + value()"
                    (selectedChange)="pick($event)" />
      @if (offerWorkIn() && value() !== null) {
        <button type="button" class="btn btn-ghost btn-sm whitespace-nowrap" data-test="work-in-workspace"
                [disabled]="opening()" (click)="workIn()"
                [attr.aria-label]="'Work in ' + directory.nameOf(value())"
                title="Open a managed session in this workspace: you work there as its administrator, and every change is audited.">
          <app-icon name="external" [busy]="opening()" />Work in this workspace
        </button>
      }
    }
  `,
})
export class WorkspaceSelect implements OnInit {
  readonly directory = inject(WorkspaceDirectory);
  /** ManagedSession is asked for on the click: a screen's unit test renders the selector without its services. */
  private readonly injector = inject(Injector);
  readonly opening = signal(false);

  /** The picked workspace's id; null for none, or "All workspaces" where allowed. */
  readonly value = model<number | null>(null);
  /** Whether the page can show every workspace at once ("All workspaces"). */
  readonly allowAll = input(false);
  /** What "no workspace" means on this page: "All workspaces" on a list, "The platform's defaults" on a settings page. */
  readonly allLabel = input('All workspaces');
  readonly label = input('Workspace');
  /** "Work in this workspace" beside the box once one is picked. */
  readonly offerWorkIn = input(true);

  private static next = 0;
  readonly boxId = `workspace-select-${++WorkspaceSelect.next}`;
  readonly picks = this.directory.picks;

  /** The recent ones first, then every workspace by name. */
  readonly options = computed<ComboboxOption[]>(() => {
    const names = this.directory.names();
    const recent = this.directory.recent().filter(id => names.has(id));
    const all = this.directory.workspaces().map(w => w.tenantId).filter(id => !recent.includes(id))
      .sort((a, b) => (names.get(a) ?? '').localeCompare(names.get(b) ?? ''));
    const option = (id: number, group: string): ComboboxOption => {
      const w = this.directory.workspaces().find(x => x.tenantId === id);
      return { value: String(id), label: names.get(id) ?? `Workspace ${id}`, group,
        hint: [w?.tenantCode, w?.status && w.status !== 'Active' ? w.status : null].filter(Boolean).join(' · ') || undefined };
    };
    return [...recent.map(id => option(id, 'Recent')), ...all.map(id => option(id, recent.length ? 'All workspaces' : ''))]
      .map(o => (o.group ? o : { ...o, group: undefined }));
  });

  ngOnInit(): void {
    this.directory.load().subscribe();
  }

  pick(raw: string): void {
    const id = Number(raw);
    const next = raw && Number.isFinite(id) && id > 0 ? id : null;
    if (next === null && !this.allowAll()) return;
    this.directory.choose(next);
    this.value.set(next);
  }

  async workIn(): Promise<void> {
    const id = this.value();
    if (id === null || this.opening()) return;
    this.opening.set(true);
    try {
      await this.injector.get(ManagedSession).workIn(id, this.directory.nameOf(id));
    } finally {
      this.opening.set(false);
    }
  }
}
