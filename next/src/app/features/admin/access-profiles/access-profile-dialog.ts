import { Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_SUCCESS } from '../../../core/api/api.config';
import { PageCatalogueEntry, PageKey } from '../../../core/auth/page-keys';
import { ToastService } from '../../../shared/ui/toast.service';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { AccessProfile, AccessProfilesService } from './access-profiles.service';

export interface AccessProfileDialogData {
  profile?: AccessProfile;
  /** The catalogue, fetched once by the screen so the dialog opens without a request. */
  pages: PageCatalogueEntry[];
  /** Whether any profile exists yet: the first one becomes the default whatever the box says. */
  first: boolean;
}

interface PageSection {
  section: string;
  pages: PageCatalogueEntry[];
}

/**
 * One profile: a name, a sentence, and the pages it opens, grouped the way the menu groups them.
 *
 * The pages are a set of checkboxes rather than a multi-select, because the whole point of a
 * profile is to be read at a glance -- an admin comparing "Operator" with "Analyst" wants to
 * see the difference, not open two dropdowns.
 */
@Component({
  selector: 'app-access-profile-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog],
  template: `
    <app-form-dialog
        [heading]="isEdit() ? 'Edit access profile' : 'New access profile'"
        subtitle="A named bundle of pages. Give each tenant user one; admins always open everything."
        [confirmLabel]="isEdit() ? 'Save changes' : 'Create'"
        [saving]="saving()"
        (cancelled)="ref.close(false)" (confirmed)="save()">
      <form [formGroup]="form" class="form-stack">
        <div class="form-grid">
          <app-field label="Profile name" for="profileName" [required]="true"
                     [control]="form.get('profileName')" [submitted]="submitted()">
            <input id="profileName" class="input" formControlName="profileName" placeholder="Analyst" />
          </app-field>
          <app-field label="Description" for="description"
                     [control]="form.get('description')" [submitted]="submitted()"
                     hint="One line saying who this is for.">
            <input id="description" class="input" formControlName="description"
                   placeholder="Runs pipelines and reads reports." />
          </app-field>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <span class="label mb-0">Pages this profile opens</span>
            <span class="text-xs text-[color:var(--text-muted)]">{{ selected().size }} of {{ data.pages.length }}</span>
          </div>
          <div class="card p-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            @for (group of sections(); track group.section) {
              <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                  <span class="text-[11px] font-semibold uppercase tracking-wide text-[color:var(--text-secondary)]">{{ group.section }}</span>
                  <button type="button" class="btn btn-ghost btn-xs" (click)="toggleSection(group)">
                    {{ allOn(group) ? 'None' : 'All' }}
                  </button>
                </div>
                @for (page of group.pages; track page.key) {
                  <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" class="checkbox" [checked]="selected().has(page.key)"
                           (change)="toggle(page.key)" [attr.data-page]="page.key" />
                    {{ page.label }}
                  </label>
                }
              </div>
            }
          </div>
          <p class="text-xs text-[color:var(--text-muted)] mt-2">
            Dashboard, Profile and Notifications are always open. Configuration and Administration
            stay admin-only whatever is ticked here.
          </p>
        </div>

        <label class="flex items-start gap-2 text-sm cursor-pointer select-none">
          <input type="checkbox" class="checkbox mt-0.5" formControlName="defaultProfile"
                 [attr.disabled]="data.first || data.profile?.defaultProfile ? '' : null" />
          <span>
            <span class="font-medium">Default for this workspace</span>
            <span class="block text-xs text-[color:var(--text-muted)]">
              @if (data.first) {
                The first profile is the default: anyone without one of their own gets it.
              } @else if (data.profile?.defaultProfile) {
                This is the default. Pick another profile as default to change it.
              } @else {
                Anyone without a profile of their own gets the default.
              }
            </span>
          </span>
        </label>
      </form>
    </app-form-dialog>
  `,
})
export class AccessProfileDialog {
  readonly ref = inject<DialogRef<boolean>>(DialogRef);
  readonly data = inject<AccessProfileDialogData>(DIALOG_DATA);
  private readonly fb = inject(FormBuilder);
  private readonly profiles = inject(AccessProfilesService);
  private readonly toast = inject(ToastService);

  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly isEdit = computed(() => !!this.data.profile);

  readonly selected = signal<Set<PageKey>>(new Set(this.data.profile?.pageKeys ?? []));

  /** The catalogue in menu order, one column per section. */
  readonly sections = computed<PageSection[]>(() => {
    const groups: PageSection[] = [];
    for (const page of this.data.pages) {
      let group = groups.find(g => g.section === page.section);
      if (!group) {
        group = { section: page.section, pages: [] };
        groups.push(group);
      }
      group.pages.push(page);
    }
    return groups;
  });

  readonly form: FormGroup = this.fb.group({
    profileName: [this.data.profile?.profileName ?? '', [Validators.required, Validators.maxLength(100)]],
    description: [this.data.profile?.description ?? '', Validators.maxLength(500)],
    defaultProfile: [this.data.profile?.defaultProfile ?? this.data.first],
  });

  toggle(key: PageKey): void {
    this.selected.update(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  allOn(group: PageSection): boolean {
    return group.pages.every(p => this.selected().has(p.key));
  }

  toggleSection(group: PageSection): void {
    const on = !this.allOn(group);
    this.selected.update(current => {
      const next = new Set(current);
      for (const page of group.pages) {
        if (on) next.add(page.key); else next.delete(page.key);
      }
      return next;
    });
  }

  save(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const value = this.form.getRawValue();
    // Catalogue order, not click order: the list on the card reads the way the menu does.
    const pageKeys = this.data.pages.map(p => p.key).filter(key => this.selected().has(key));
    this.saving.set(true);
    this.profiles.save({
      pageAccessProfileId: this.data.profile?.pageAccessProfileId,
      profileName: value.profileName.trim(),
      description: value.description?.trim() || null,
      defaultProfile: !!value.defaultProfile,
      pageKeys,
    }).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || 'Access profile saved.');
          this.ref.close(true);
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
}
