import { RefreshButton } from '../../../shared/ui/refresh-button';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeChoice, ThemeService, isThemeChoice } from '../../../core/theme.service';
import { themeLabel } from '../../../core/theme-options';
import { ThemePreference } from '../../../core/theme-preference';
import { ToastService } from '../../../shared/ui/toast.service';
import { Icon } from '../../../shared/ui/icon';
import { Section } from '../../../shared/ui/section';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { PageHeader } from '../../../shared/ui/page-header';
import { ThemeChooser } from '../../../shared/ui/theme-chooser';

/** tenant.json/appearance: a workspace's default app theme; null when it sets none (each device's own light/dark). */
export interface AppearanceSettings {
  tenantId: number;
  defaultTheme: string | null;
}

/**
 * Administration › Appearance (owner 2026-10-13): the theme the workspace's people open in until they choose their own
 * (Profile › Appearance, or the top bar's menu). It reaches each person at their next sign-in. A workspace administrator
 * sets their own workspace's; a platform administrator picks the workspace.
 */
@Component({
  selector: 'app-workspace-appearance',
  imports: [Icon, PageHeader, ThemeChooser, Section, WorkspaceSelect, RefreshButton],
  template: `
    <div class="page">
      <app-page-header title="Appearance"
                       subtitle="The theme your workspace's people see until they choose their own. Each person can still pick another in the top bar or on their profile.">
        <!-- Owner #5 (2026-10-19): the selector sits in the same wrapper, with Refresh, as on every other screen; placed
             straight in the header it stretched and its clear button floated outside the box. -->
        <div class="flex items-center gap-2">
          <app-workspace-select [value]="tenantId()" (valueChange)="pickWorkspace($event)" />
          @if (tenantId() !== null) { <app-refresh-button [loading]="loading()" (refresh)="load()" /> }
        </div>
      </app-page-header>

      @if (error()) {
        <div class="card p-4 text-sm text-crit-500" role="alert">{{ error() }}</div>
      } @else if (isPlatformAdmin() && tenantId() === null) {
        <div class="card p-8 text-center text-sm text-[color:var(--text-muted)]" data-test="pick-workspace">Pick a workspace above to set its default theme.</div>
      } @else {
        <!-- Owner #4 (2026-10-19): one section -- title and the state in a sentence, the themes on the shared chooser's grid, and
             the actions in the section's footer, the primary rightmost. -->
        <app-section [card]="true" title="Default theme" data-test="workspace-theme-card"
                     [sub]="'Now: ' + savedLabel() + '. People who have chosen a theme keep theirs; everyone else opens in this one from their next sign-in.'">
          <app-theme-chooser label="Workspace default theme" systemLabel="System (no default)"
                             [value]="draft()" [disabled]="loading() || saving()" (picked)="draft.set($event)" />
          <div class="form-actions" data-test="appearance-actions">
            @if (changed()) {
              <span class="text-xs text-[color:var(--text-muted)] mr-auto">Not saved yet: {{ draftLabel() }}.</span>
              <button type="button" class="btn btn-default btn-sm" [disabled]="saving()" (click)="draft.set(savedChoice())">Undo</button>
            }
            <button type="button" class="btn btn-primary btn-sm" [disabled]="!changed() || saving()" (click)="save()">
              <app-icon name="save" [busy]="saving()" />{{ saving() ? 'Saving…' : 'Save default' }}
            </button>
          </div>
        </app-section>
      }
    </div>
  `,
})
export class WorkspaceAppearance implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly themes = inject(ThemeService);
  private readonly preference = inject(ThemePreference);
  private readonly toast = inject(ToastService);

  readonly isPlatformAdmin = computed(() => this.auth.isPlatformAdmin());
  readonly tenantId = signal<number | null>(inject(WorkspaceDirectory).remembered());
  readonly saved = signal<string | null>(null);
  readonly draft = signal<ThemeChoice>('system');
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly savedChoice = computed<ThemeChoice>(() => { const s = this.saved(); return isThemeChoice(s) ? s : 'system'; });
  readonly savedLabel = computed(() => (this.saved() ? themeLabel(this.saved()) : 'no default (each device’s light or dark)'));
  readonly changed = computed(() => this.draft() !== this.savedChoice());
  readonly draftLabel = computed(() => (this.draft() === 'system' ? 'no default' : themeLabel(this.draft())));

  ngOnInit(): void {
    // A platform administrator reads the workspace picked (this session's choice); a workspace administrator their own.
    if (this.isPlatformAdmin() && this.tenantId() === null) return;
    this.load();
  }

  pickWorkspace(id: number | null): void {
    this.tenantId.set(id);
    this.error.set('');
    if (this.tenantId() !== null) this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    const params = this.tenantId() ? `?tenantId=${this.tenantId()}` : '';
    this.http.get<ApiResponse<AppearanceSettings>>(`${API_BASE}/tenant.json/appearance${params}`).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status === API_SUCCESS && r.data) this.took(r.data);
        else this.error.set(r.message || 'Could not read the workspace’s appearance.');
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not read the workspace’s appearance.'); },
    });
  }

  save(): void {
    this.saving.set(true);
    const body = { tenantId: this.tenantId(), defaultTheme: this.draft() === 'system' ? null : this.draft() };
    this.http.put<ApiResponse<AppearanceSettings>>(`${API_BASE}/tenant.json/appearance`, body).subscribe({
      next: r => {
        this.saving.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The default theme was not saved.'); return; }
        this.took(r.data);
        this.toast.success(`Default theme: ${this.savedLabel()}.`);
        // Our own workspace's: this session learns it, and an administrator with no theme of their own sees it now.
        if (r.data.tenantId === this.auth.user()?.tenantId) {
          this.auth.patchUser({ workspaceTheme: r.data.defaultTheme });
          if (!this.preference.own()) this.themes.pick(this.savedChoice());
        }
      },
      error: err => { this.saving.set(false); this.toast.error(err?.error?.message || 'The default theme was not saved.'); },
    });
  }

  private took(data: AppearanceSettings): void {
    this.saved.set(isThemeChoice(data.defaultTheme) ? data.defaultTheme : null);
    this.draft.set(this.savedChoice());
  }
}
