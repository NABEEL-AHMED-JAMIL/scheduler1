import { Component, OnInit, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { AuthService } from '../../core/auth/auth.service';
import { FormRenderer, missingRequired } from './form-renderer';
import { DynamicForm, DynamicFormSubmission, SECTION_TYPE } from './dynamic-form.model';

/**
 * The public face of a dynamic form.
 *
 * fetchFormByUuid is one of only two endpoints the server marks permitAll, so a share link
 * opens for someone with no account. This page therefore sits outside the application shell --
 * whoever follows the link has no navigation and nothing to sign out of.
 *
 * submitForm, though, still requires TENANT_USER: reading a form anonymously works, answering
 * it does not. Until that is settled on the server, this page says so up front rather than
 * letting someone type a page of answers and meet a 401 on the button.
 */
@Component({
  selector: 'app-form-fill',
  imports: [Icon, FormRenderer],
  template: `
    <div class="min-h-screen px-4 py-10" style="background: var(--surface-page);">
      <!-- A form defines its own column widths, and this one asks for four fields across.
           At 3xl a quarter column is 168px, which clipped an ordinary email address, so the
           page widens with the viewport instead of staying at reading width. -->
      <div class="mx-auto w-full max-w-3xl lg:max-w-5xl xl:max-w-6xl flex flex-col gap-4">

        @if (loading()) {
          <div class="card p-6 flex items-center gap-2.5">
            <app-icon name="refresh" class="spin" />
            <span class="text-sm text-[color:var(--text-secondary)]">Opening the form…</span>
          </div>
        } @else if (error()) {
          <div class="card p-6 flex flex-col items-center gap-3 text-center">
            <span class="stat-glyph"><app-icon name="alert" class="icon-crit" /></span>
            <div>
              <h1 class="text-base font-semibold">This form is not available</h1>
              <p class="text-sm text-[color:var(--text-secondary)] mt-1">{{ error() }}</p>
            </div>
            <button type="button" class="btn btn-default btn-sm" (click)="load()">
              <app-icon name="refresh" />Try again
            </button>
          </div>
        } @else if (done()) {
          <div class="card p-8 flex flex-col items-center gap-3 text-center">
            <span class="stat-glyph"><app-icon name="checkCircle" class="icon-ok" /></span>
            <div>
              <h1 class="text-base font-semibold">Thank you — your answers were received</h1>
              <p class="text-sm text-[color:var(--text-secondary)] mt-1">
                You can close this page.
              </p>
            </div>
            @if (reference()) {
              <p class="text-xs text-[color:var(--text-muted)]">
                Reference <span class="mono">{{ reference() }}</span>
              </p>
            }
          </div>
        } @else if (form(); as f) {
          <div class="card p-6 flex flex-col gap-5">
            <div>
              <h1 class="text-lg font-semibold">{{ f.formName }}</h1>
              @if (f.description) {
                <p class="text-sm text-[color:var(--text-secondary)] mt-1">{{ f.description }}</p>
              }
            </div>

            @if (inactive()) {
              <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                <span>This form is not accepting answers at the moment.</span>
              </p>
            } @else if (!signedIn()) {
              <div class="rounded p-3 flex items-start gap-2 text-sm"
                   style="background: var(--surface-inset);">
                <app-icon name="lock" size="0.95em" class="mt-0.5 shrink-0 icon-muted" />
                <span>
                  You can read this form, but sending answers needs an account.
                  <a class="link-inline" [href]="'/login?next=' + currentPath()">Sign in</a>
                  to submit it.
                </span>
              </div>
            }

            <app-form-renderer [fields]="f.fields ?? []" [(value)]="answers"
                               [errors]="fieldErrors()" [readOnly]="inactive()" />

            @if (submitError()) {
              <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                <span>{{ submitError() }}</span>
              </p>
            }

            <div class="flex items-center gap-2">
              <button type="button" class="btn btn-primary btn-sm"
                      [disabled]="submitting() || inactive() || !hasInputs() || !signedIn()"
                      (click)="submit()">
                @if (submitting()) { <app-icon name="refresh" class="spin" /> }
                {{ submitting() ? 'Sending…' : 'Submit' }}
              </button>
              <span class="text-xs text-[color:var(--text-muted)]">
                Required fields are marked with an asterisk.
              </span>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class FormFill implements OnInit {
  /** From the route: /f/:uuid */
  readonly uuid = input<string>('');

  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * fetchFormByUuid is permitAll but submitForm still requires TENANT_USER, so a visitor with
   * only the link can read the form and not answer it. Rather than let someone fill it in and
   * meet a 401 on the button, say so before they start.
   */
  readonly signedIn = this.auth.isLoggedIn;

  readonly form = signal<DynamicForm | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly answers = signal<Record<string, unknown>>({});
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly submitting = signal(false);
  readonly submitError = signal('');
  readonly done = signal(false);
  readonly reference = signal('');

  ngOnInit(): void { this.load(); }

  inactive(): boolean { return this.form()?.status === 'Inactive'; }

  currentPath(): string { return encodeURIComponent(location.pathname); }

  hasInputs(): boolean {
    return (this.form()?.fields ?? []).some(f => f.fieldType !== SECTION_TYPE);
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    if (!this.uuid()) {
      this.loading.set(false);
      this.error.set('This link is missing its form reference.');
      return;
    }
    this.http.get<ApiResponse<DynamicForm>>(`${API_BASE}/dynamicForm.json/fetchFormByUuid`,
      { params: { uuid: this.uuid() } }).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS || !response.data) {
          this.error.set(response.message || 'The link may be wrong, or the form withdrawn.');
          return;
        }
        this.form.set(response.data);
        // Defaults are what the builder promised, so they are filled in before anyone types.
        const seeded: Record<string, unknown> = {};
        for (const field of response.data.fields ?? []) {
          if (field.fieldType === SECTION_TYPE) continue;
          if (field.defaultValue != null && field.defaultValue !== '') {
            seeded[field.fieldName] = field.defaultValue;
          }
        }
        this.answers.set(seeded);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'The link may be wrong, or the form withdrawn.');
      },
    });
  }

  submit(): void {
    const current = this.form();
    if (!current || this.submitting()) return;
    this.submitError.set('');

    const problems = missingRequired(current.fields ?? [], this.answers());
    this.fieldErrors.set(problems);
    if (Object.keys(problems).length) {
      this.submitError.set('Some answers still need attention.');
      return;
    }

    this.submitting.set(true);
    const body: DynamicFormSubmission = {
      dynamicFormId: current.dynamicFormId!,
      payload: this.answers(),
    };
    this.http.post<ApiResponse<DynamicFormSubmission>>(
      `${API_BASE}/dynamicForm.json/submitForm`, body).subscribe({
      next: response => {
        this.submitting.set(false);
        if (response.status !== API_SUCCESS) { this.submitError.set(response.message); return; }
        this.reference.set(response.data?.uuid ?? '');
        this.done.set(true);
      },
      error: err => {
        this.submitting.set(false);
        this.submitError.set(err?.status === 401
          ? 'Sending answers needs an account. Sign in and submit again -- what you have typed is kept.'
          : (err?.error?.message || 'Your answers could not be sent. Please try again.'));
      },
    });
  }
}
