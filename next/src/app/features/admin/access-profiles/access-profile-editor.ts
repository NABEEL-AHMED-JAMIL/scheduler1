import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { PageCatalogueEntry, PageKey, TabCatalogueEntry, TabKey } from '../../../core/auth/page-keys';
import { Field } from '../../../shared/ui/field';
import { FormRow } from '../../../shared/ui/form-row';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { Section } from '../../../shared/ui/section';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccessProfile, AccessProfilesService } from './access-profiles.service';
import { PageGroup, PageRow, groupPages, keysOf, menuPreview, previewSize } from './page-groups';

/** Which rows the list shows. */
export type PageFilter = 'all' | 'on' | 'off';

/**
 * Administration › Page access › New access profile, or one profile's pages (owner 2026-10-19 #3): a page of its own, not
 * a dialog, because a workspace's catalogue is long and keeps growing. The pages are grouped as the menu groups them
 * (core/nav/nav-tree.ts: "Get data in › Connections › Databases"), with a search, a filter (all, chosen, not chosen),
 * a "select all" per group and per hub, and the count "N of M pages". A read/edit split (Saved Analyses / Edit dashboards)
 * is one row with a View and an Edit box, and Edit always brings View. Beside it, the menu a person on this profile will
 * see, worked out by the menu's own rules. The same page edits an existing profile.
 *
 * What is saved is the catalogue's order, never the order somebody clicked in.
 */
@Component({
  selector: 'app-access-profile-editor',
  imports: [PageHeader, Section, Field, FormRow, Icon, ReactiveFormsModule],
  templateUrl: './access-profile-editor.html',
  styles: `
    .ap-editor { display: grid; gap: 1rem; }
    /* Wide screens: the pages and, beside them, the menu they make -- held in view while the list scrolls. */
    @media (min-width: 80rem) {
      .ap-editor { grid-template-columns: minmax(0, 1fr) 22rem; align-items: start; }
      .ap-preview { position: sticky; top: 4.5rem; max-height: calc(100dvh - 6rem); overflow: auto; }
    }
    .ap-groups { display: grid; gap: 1rem; }
    @media (min-width: 64rem) { .ap-groups { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (min-width: 120rem) { .ap-groups { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    .ap-group { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); padding: 0.75rem; min-width: 0; }
    .ap-group-head { display: flex; align-items: center; gap: 0.5rem; padding-bottom: 0.5rem; margin-bottom: 0.5rem;
      border-bottom: 1px solid var(--border-subtle); }
    .ap-hub + .ap-hub { margin-top: 0.5rem; }
    .ap-hub-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; margin: 0.25rem 0; }
    .ap-row { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.5rem; padding: 0.3rem 0.375rem; border-radius: var(--radius-md); }
    /* F3: a chosen page's tabs, on a line of their own under it. */
    .ap-row-tabs { order: 3; flex-basis: 100%; display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; padding-left: 1.5rem; }
    .ap-tab { display: inline-flex; align-items: center; gap: 0.3rem; font-size: 0.75rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-md); padding: 0.125rem 0.4rem; cursor: pointer; }
    .ap-row:hover { background: var(--surface-sunken); }
    .ap-row-main { display: flex; align-items: flex-start; gap: 0.5rem; flex: 1; min-width: 0; cursor: pointer; overflow-wrap: anywhere; }
    .ap-row-main .checkbox, .ap-row-edit .checkbox { margin-top: 0.125rem; flex: none; }
    .ap-row-edit { display: inline-flex; align-items: center; gap: 0.25rem; flex: none; cursor: pointer;
      padding: 0 0.375rem; border-left: 1px solid var(--border-subtle); }
  `,
})
export class AccessProfileEditor implements OnInit {
  private readonly api = inject(AccessProfilesService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(FormBuilder);

  readonly pages = signal<PageCatalogueEntry[]>([]);
  readonly profile = signal<AccessProfile | null>(null);
  /** Whether the workspace has no profile yet: the first one is the default whatever the box says. */
  readonly first = signal(false);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly submitted = signal(false);
  /** A platform administrator names the workspace (?tenantId=); a tenant administrator's is its own. */
  readonly tenantId = signal<number | null>(null);
  readonly isEdit = computed(() => !!this.profile());

  /** The page keys chosen, and (F3) the tab keys of a page restricted to some of its tabs. */
  readonly selected = signal<ReadonlySet<string>>(new Set());
  readonly search = signal('');
  readonly filter = signal<PageFilter>('all');

  readonly form: FormGroup = this.fb.group({
    profileName: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', Validators.maxLength(500)],
    defaultProfile: [false],
  });

  /** The catalogue as the menu arranges it. */
  readonly groups = computed<PageGroup[]>(() => groupPages(this.pages()));
  readonly total = computed(() => this.pages().length);
  readonly chosen = computed(() => this.pages().filter(p => this.selected().has(p.key)).length);

  /** The groups as the search and the filter leave them; a hub or group with no row left is not drawn. */
  readonly shown = computed<PageGroup[]>(() => {
    const term = this.search().trim().toLowerCase();
    const filter = this.filter();
    const on = this.selected();
    const keep = (row: PageRow) => {
      const held = on.has(row.key) || (!!row.edit && on.has(row.edit.key));
      if (filter === 'on' && !held) return false;
      if (filter === 'off' && held) return false;
      if (!term) return true;
      return [row.label, row.edit?.label ?? '', ...row.places].some(text => text.toLowerCase().includes(term));
    };
    return this.groups().map(group => ({
      label: group.label,
      hubs: group.hubs.map(hub => ({ label: hub.label, rows: hub.label.toLowerCase().includes(term) && filter === 'all' ? hub.rows : hub.rows.filter(keep) }))
        .filter(hub => hub.rows.length > 0),
    })).filter(group => group.hubs.length > 0);
  });
  readonly shownCount = computed(() => this.shown().reduce((n, g) => n + g.hubs.reduce((m, h) => m + h.rows.length, 0), 0));

  /** The menu a person on this profile will see. */
  readonly preview = computed(() => menuPreview(key => this.selected().has(key)));
  readonly previewPlaces = computed(() => previewSize(this.preview()));

  ngOnInit(): void {
    const params = this.route.snapshot.paramMap;
    const query = this.route.snapshot.queryParamMap;
    const asked = Number(query.get('tenantId'));
    this.tenantId.set(this.auth.isPlatformAdmin() && Number.isFinite(asked) && asked > 0 ? asked : null);
    const id = Number(params.get('pageAccessProfileId'));
    if (this.auth.isPlatformAdmin() && !this.tenantId()) {
      this.loading.set(false);
      this.error.set('Choose the workspace first, on Page access.');
      return;
    }
    forkJoin({ pages: this.api.pages(), profiles: this.api.list(this.tenantId()) }).subscribe({
      next: ({ pages, profiles }) => {
        this.loading.set(false);
        if (pages.status !== API_SUCCESS || profiles.status !== API_SUCCESS) {
          this.error.set((pages.status !== API_SUCCESS ? pages.message : profiles.message) || 'The page catalogue could not be loaded.');
          return;
        }
        this.pages.set(pages.data ?? []);
        const list = profiles.data ?? [];
        this.first.set(list.length === 0);
        if (Number.isFinite(id) && id > 0) {
          const found = list.find(p => p.pageAccessProfileId === id);
          if (!found) {
            this.error.set('That access profile is not in this workspace any more.');
            return;
          }
          this.startFrom(found);
        } else {
          this.form.patchValue({ defaultProfile: list.length === 0 });
          if (list.length === 0) this.form.get('defaultProfile')!.disable();
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The page catalogue could not be loaded.');
      },
    });
  }

  /** An existing profile: its name, sentence, default flag and pages. */
  startFrom(profile: AccessProfile): void {
    this.profile.set(profile);
    this.selected.set(new Set(profile.pageKeys ?? []));
    this.form.patchValue({ profileName: profile.profileName, description: profile.description ?? '', defaultProfile: profile.defaultProfile });
    // The default stays the default until another is made it (Make default on Page access).
    if (profile.defaultProfile) this.form.get('defaultProfile')!.disable();
  }

  // ---- choosing pages ---------------------------------------------------------------------------------------------

  isOn(key: string): boolean {
    return this.selected().has(key);
  }

  // ---- F3 (MIG-400): a page's tabs ------------------------------------------------------------------------------------

  /** The page's own tabs, from the catalogue (none for a page that is one place). */
  tabsOf(page: PageKey): TabCatalogueEntry[] {
    return this.pages().find(p => p.key === page)?.tabs ?? [];
  }

  /** A tab opens when its page is chosen and either none of the page's tabs is named (every tab) or this one is. */
  tabOn(page: PageKey, tab: TabKey): boolean {
    if (!this.isOn(page)) return false;
    const named = this.tabsOf(page).filter(t => this.isOn(t.key));
    return named.length === 0 || named.some(t => t.key === tab);
  }

  /** "Every tab" or "N of M tabs", for the row. */
  tabSummary(page: PageKey): string {
    const tabs = this.tabsOf(page);
    const on = tabs.filter(t => this.tabOn(page, t.key)).length;
    return on === tabs.length ? 'Every tab' : `${on} of ${tabs.length} tabs`;
  }

  /** Flips one tab: every tab chosen again means none named; no tab left means the page is not chosen. */
  toggleTab(page: PageKey, tab: TabKey): void {
    const tabs = this.tabsOf(page).map(t => t.key);
    const on = new Set(tabs.filter(t => this.tabOn(page, t)));
    if (on.has(tab)) on.delete(tab); else on.add(tab);
    this.change(next => {
      tabs.forEach(t => next.delete(t));
      if (on.size === 0) next.delete(page);
      else {
        next.add(page);
        if (on.size < tabs.length) on.forEach(t => next.add(t));
      }
    });
  }

  /** The View box: off takes the Edit half with it. */
  toggleView(row: PageRow): void {
    const on = !this.isOn(row.key);
    this.change(next => {
      if (on) next.add(row.key);
      else {
        next.delete(row.key);
        if (row.edit) next.delete(row.edit.key);
        this.tabsOf(row.key).forEach(t => next.delete(t.key));
      }
    });
  }

  /** The Edit box: on brings the View half with it. */
  toggleEdit(row: PageRow): void {
    if (!row.edit) return;
    const on = !this.isOn(row.edit.key);
    const edit = row.edit.key;
    this.change(next => {
      if (on) { next.add(edit); next.add(row.key); } else next.delete(edit);
    });
  }

  /** How many of a set of rows' keys are chosen: none, some, all. */
  stateOf(rows: readonly PageRow[]): 'none' | 'some' | 'all' {
    const keys = keysOf(rows);
    const on = keys.filter(k => this.isOn(k)).length;
    return on === 0 ? 'none' : on === keys.length ? 'all' : 'some';
  }

  countOf(rows: readonly PageRow[]): string {
    const keys = keysOf(rows);
    return `${keys.filter(k => this.isOn(k)).length} of ${keys.length}`;
  }

  rowsOf(group: PageGroup): PageRow[] {
    return group.hubs.flatMap(h => h.rows);
  }

  /** "Select all" on a group or a hub: every row the filter shows there, on -- or, when all are on already, off. */
  toggleAll(rows: readonly PageRow[]): void {
    const on = this.stateOf(rows) !== 'all';
    const keys = keysOf(rows);
    this.change(next => keys.forEach(k => (on ? next.add(k) : next.delete(k))));
  }

  /** Every page in the catalogue, or none. */
  everything(on: boolean): void {
    this.selected.set(new Set(on ? this.pages().map(p => p.key) : []));
  }

  private change(edit: (next: Set<string>) => void): void {
    const next = new Set(this.selected());
    edit(next);
    this.selected.set(next);
  }

  // ---- saving -----------------------------------------------------------------------------------------------------

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Give the profile a name.');
      return;
    }
    const value = this.form.getRawValue();
    const chosen = this.pages().filter(p => this.selected().has(p.key));
    // F3: the pages, then the tab keys of each chosen page restricted to some of its tabs.
    const pageKeys: (PageKey | TabKey)[] = [...chosen.map(p => p.key),
      ...chosen.flatMap(p => (p.tabs ?? []).map(t => t.key).filter(key => this.selected().has(key)))];
    this.saving.set(true);
    this.api.save({
      pageAccessProfileId: this.profile()?.pageAccessProfileId,
      tenantId: this.tenantId(),
      profileName: String(value.profileName ?? '').trim(),
      description: String(value.description ?? '').trim() || null,
      defaultProfile: !!value.defaultProfile || this.first(),
      pageKeys,
    }).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || 'Access profile saved.');
          this.back();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The access profile could not be saved.');
      },
    });
  }

  back(): void {
    void this.router.navigate(['/administration/access-profiles'], { queryParams: this.tenantId() ? { tenantId: this.tenantId() } : {} });
  }
}
