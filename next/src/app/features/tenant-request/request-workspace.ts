import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { ThemeService } from '../../core/theme.service';

/**
 * Asking for a workspace.
 *
 * Public, because whoever is asking has no account yet -- that is what they are asking for.
 * Only tenantRequest.json/submit is open on the server; reading and deciding on requests need a
 * platform administrator.
 *
 * The acknowledgement is deliberately the same whether or not the address is already known. The
 * server behaves the same way, so this form cannot be used to find out who already has an
 * account here.
 */
@Component({
  selector: 'app-request-workspace',
  imports: [ReactiveFormsModule, RouterLink, Field, Icon],
  template: `
    <div class="min-h-screen flex flex-col" style="background: var(--surface-page);">
      <header class="border-b" style="border-color: var(--border-subtle);">
        <div class="mx-auto w-full max-w-3xl px-5 h-14 flex items-center gap-3">
          <a routerLink="/" class="flex items-center gap-2">
            <div class="size-7 rounded-md bg-brand-500 grid place-items-center text-white text-sm font-bold">E</div>
            <span class="font-semibold text-[15px] tracking-tight">ETL Console</span>
          </a>
          <div class="ml-auto flex items-center gap-1.5">
            <button type="button" class="btn btn-ghost btn-icon btn-sm"
                    [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                    (click)="theme.toggle()">
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
            <a routerLink="/login" class="btn btn-default btn-sm">Sign in</a>
          </div>
        </div>
      </header>

      <div class="mx-auto w-full max-w-3xl px-5 py-12 flex-1">
        @if (done()) {
          <div class="card p-8 flex flex-col items-center gap-3 text-center">
            <span class="stat-glyph"><app-icon name="checkCircle" class="icon-ok" /></span>
            <div>
              <h1 class="text-lg font-semibold">Thank you — your request has been recorded</h1>
              <p class="mt-1.5 text-sm text-[color:var(--text-secondary)] max-w-md">
                {{ acknowledgement() }}
              </p>
            </div>
            <a routerLink="/" class="btn btn-default btn-sm mt-1">Back to the front page</a>
          </div>
        } @else {
          <h1 class="text-2xl font-semibold tracking-tight">Request a workspace</h1>
          <p class="mt-2 text-[color:var(--text-secondary)] max-w-xl leading-relaxed">
            Tell us who you are and what you need it for. A platform administrator reviews every
            request; if yours is granted, we will email you how to sign in.
          </p>

          <form [formGroup]="form" class="form-stack mt-8 card p-6" (ngSubmit)="submit()">
            <app-field label="Organisation" for="organisationName" [required]="true"
                       [control]="form.get('organisationName')" [submitted]="submitted()"
                       hint="The name your workspace will carry.">
              <input id="organisationName" class="input" formControlName="organisationName"
                     placeholder="Northwind Logistics" />
            </app-field>

            <div class="form-grid">
              <app-field label="Your name" for="contactName" [required]="true"
                         [control]="form.get('contactName')" [submitted]="submitted()">
                <input id="contactName" class="input" formControlName="contactName" />
              </app-field>

              <app-field label="Your email" for="contactEmail" [required]="true"
                         [control]="form.get('contactEmail')" [submitted]="submitted()"
                         hint="Where the sign-in details will be sent, and your username."
                         [errorMessages]="{ email: 'That does not look like an email address.' }">
                <input id="contactEmail" type="email" class="input" formControlName="contactEmail" />
              </app-field>
            </div>

            <app-field label="What do you need it for?" for="purpose"
                       [control]="form.get('purpose')" [submitted]="submitted()"
                       hint="A sentence or two is plenty. It helps whoever reviews the request.">
              <textarea id="purpose" class="input" rows="4" formControlName="purpose"></textarea>
            </app-field>

            @if (error()) {
              <p class="field-note text-crit-500 flex items-start gap-1.5" role="alert">
                <app-icon name="alert" size="0.9em" class="mt-px shrink-0" />
                <span>{{ error() }}</span>
              </p>
            }

            <div class="flex flex-wrap items-center gap-3">
              <button type="submit" class="btn btn-primary" [disabled]="sending()">
                @if (sending()) { <app-icon name="refresh" class="spin" /> }
                {{ sending() ? 'Sending…' : 'Send request' }}
              </button>
              <span class="text-sm text-[color:var(--text-muted)]">
                Already have an account? <a routerLink="/login" class="link-inline">Sign in</a>.
              </span>
            </div>
          </form>
        }
      </div>

      <footer class="mt-auto border-t" style="border-color: var(--border-subtle);">
        <div class="mx-auto w-full max-w-3xl px-5 py-6 flex flex-wrap items-center gap-3">
          <a routerLink="/" class="link-inline text-sm">← Back to the front page</a>
          <a routerLink="/docs" class="link-inline ml-auto text-sm">Setup guide</a>
        </div>
      </footer>
    </div>
  `,
})
export class RequestWorkspace {
  readonly theme = inject(ThemeService);
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  readonly submitted = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly acknowledgement = signal('');

  readonly form: FormGroup = this.fb.group({
    organisationName: ['', Validators.required],
    contactName: ['', Validators.required],
    contactEmail: ['', [Validators.required, Validators.email]],
    purpose: [''],
  });

  submit(): void {
    this.submitted.set(true);
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Check the highlighted fields.');
      return;
    }
    this.sending.set(true);
    this.http.post<ApiResponse>(`${API_BASE}/tenantRequest.json/submit`,
      this.form.getRawValue()).subscribe({
      next: response => {
        this.sending.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        this.acknowledgement.set(response.message);
        this.done.set(true);
      },
      error: err => {
        this.sending.set(false);
        this.error.set(err?.error?.message
          || 'Your request could not be sent. Please try again.');
      },
    });
  }
}
