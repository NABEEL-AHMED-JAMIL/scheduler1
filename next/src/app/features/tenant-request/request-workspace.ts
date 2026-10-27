import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
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
  imports: [ReactiveFormsModule, RouterLink, Field, Icon, BrandMark],
  // The landing page's hero palette (custom properties only), so the front door's pages share one look in both themes.
  styleUrls: ['../landing/landing.tokens.css'],
  styles: [`
    :host { display: block; }
    .hero {
      background:
        radial-gradient(70rem 40rem at 12% -20%, color-mix(in srgb, var(--hero-glow-a) 55%, transparent), transparent 62%),
        radial-gradient(55rem 32rem at 88% 4%, color-mix(in srgb, var(--hero-glow-b) 20%, transparent), transparent 60%),
        linear-gradient(180deg, var(--hero-top) 0%, var(--hero-bottom) 100%);
      color: var(--hero-fg);
    }
    .hero-sub     { color: color-mix(in srgb, var(--hero-fg) 72%, transparent); }
    .hero-eyebrow { color: color-mix(in srgb, var(--hero-eyebrow) 95%, transparent); }
    .hero .btn-ghost { color: inherit; }
    .hero header .btn-default { color: inherit; background: transparent; border-color: color-mix(in srgb, var(--hero-fg) 38%, transparent); }
    .hero header .btn-default:hover { background: color-mix(in srgb, var(--hero-fg) 10%, transparent); border-color: color-mix(in srgb, var(--hero-fg) 60%, transparent); }
    /* The sign-in page's grid, faded out towards the bottom so the card keeps the eye. */
    .request-grid { opacity: 0.07; mask-image: linear-gradient(180deg, var(--preview-shadow) 0%, transparent 85%); -webkit-mask-image: linear-gradient(180deg, var(--preview-shadow) 0%, transparent 85%); }
    .request-step-icon {
      display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 9999px;
      background: color-mix(in srgb, var(--hero-fg) 10%, transparent); border: 1px solid color-mix(in srgb, var(--hero-fg) 22%, transparent);
      color: var(--hero-eyebrow);
    }
    /* The form keeps the theme's own surface and text, raised off the hero. */
    .request-card { color: var(--text-primary); }
    .rise-late { animation-delay: .12s; }
    .rise { animation: rise .55s cubic-bezier(.22,.61,.36,1) both; }
    @keyframes rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .rise { animation: none; } }
  `],
  template: `
    <div class="min-h-screen flex flex-col bg-page">
      <!-- UX2 (owner 2026-10-26, "needs a background"): the front door's own hero -- the landing page's gradient and the
           sign-in page's grid -- with the value line on the left and the form raised on a card on the right. -->
      <div class="hero request-hero relative overflow-hidden flex-1 flex flex-col">
        <div class="absolute inset-0 login-grid-lines request-grid" aria-hidden="true"></div>
        <header class="relative">
          <div class="mx-auto w-full max-w-6xl px-5 h-16 flex items-center gap-3">
            <a routerLink="/" aria-label="ETL Console front page">
              <app-brand-mark />
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

        <main class="relative mx-auto w-full max-w-6xl px-5 pt-8 pb-14 sm:pt-12 sm:pb-20 flex-1
                     grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
          <section class="rise lg:pt-6" aria-label="About a workspace">
            <p class="hero-eyebrow text-xs uppercase tracking-[0.14em] mb-4">Your own workspace</p>
            <h1 id="request-title" class="text-3xl sm:text-4xl font-semibold leading-[1.1] tracking-tight text-balance">
              {{ done() ? 'Request received' : 'Request a workspace' }}
            </h1>
            <p class="hero-sub mt-4 text-base sm:text-lg leading-relaxed max-w-xl">
              One place for your data's pipelines, the people who review them and the reports they sign —
              kept apart from every other workspace.
            </p>
            <ul class="mt-8 flex flex-col gap-4 max-w-md">
              @for (step of steps; track step.title) {
                <li class="flex items-start gap-3">
                  <span class="request-step-icon shrink-0"><app-icon [name]="step.icon" size="1em" /></span>
                  <span>
                    <span class="block font-medium">{{ step.title }}</span>
                    <span class="hero-sub block text-sm leading-relaxed">{{ step.body }}</span>
                  </span>
                </li>
              }
            </ul>
          </section>

          <div class="rise rise-late card request-card p-6 sm:p-8 shadow-xl">
            @if (done()) {
              <div class="flex flex-col items-center gap-3 text-center py-6" data-test="request-done">
                <span class="stat-glyph"><app-icon name="checkCircle" class="icon-ok" /></span>
                <!-- The page's heading says "Request received"; the server's acknowledgement thanks them and says it was recorded. -->
                <p class="text-sm text-[color:var(--text-secondary)] max-w-md">{{ acknowledgement() }}</p>
                <a routerLink="/" class="btn btn-default btn-sm mt-1">Back to the front page</a>
              </div>
            } @else {
              <h2 class="text-lg font-semibold">Tell us about you</h2>
              <p class="mt-1 mb-6 text-sm text-[color:var(--text-secondary)] leading-relaxed">
                Tell us who you are and what you need it for. A platform administrator reviews every
                request; if yours is granted, we will email you how to sign in.
              </p>

            <form [formGroup]="form" class="form-stack" (ngSubmit)="submit()" aria-labelledby="request-title">
              <app-field label="Organisation" for="organisationName" [required]="true"
                         [control]="form.get('organisationName')" [submitted]="submitted()"
                         hint="The name your workspace will carry." [errorMessages]="tooLong">
                <input id="organisationName" class="input" formControlName="organisationName" maxlength="255"
                       placeholder="e.g. Summit Valley Health System" />
              </app-field>

              <div class="form-grid">
                <app-field label="Your name" for="contactName" [required]="true"
                           [control]="form.get('contactName')" [submitted]="submitted()" [errorMessages]="tooLong">
                  <input id="contactName" class="input" formControlName="contactName" maxlength="255" placeholder="e.g. Jordan Lee" />
                </app-field>

                <app-field label="Your email" for="contactEmail" [required]="true"
                           [control]="form.get('contactEmail')" [submitted]="submitted()"
                           hint="Where the sign-in details will be sent, and your username."
                           [errorMessages]="{ email: 'That does not look like an email address.', maxlength: tooLong.maxlength }">
                  <input id="contactEmail" type="email" class="input" formControlName="contactEmail" maxlength="255"
                         placeholder="name@yourcompany.com" />
                </app-field>
              </div>

              <app-field label="What do you need it for?" for="purpose"
                         [control]="form.get('purpose')" [submitted]="submitted()"
                         hint="A sentence or two is plenty. It helps whoever reviews the request.">
                <textarea id="purpose" class="input" rows="4" formControlName="purpose"
                          placeholder="e.g. Read referral faxes and send summaries to our EHR"></textarea>
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
        </main>
      </div>

      <footer class="border-t border-subtle">
        <div class="mx-auto w-full max-w-6xl px-5 py-6 flex flex-wrap items-center gap-x-5 gap-y-2">
          <span class="text-sm text-[color:var(--text-muted)]">ETL Console — data pipelines, review and signed reports.</span>
          <nav class="flex flex-wrap items-center gap-x-5 gap-y-2 sm:ml-auto" aria-label="More">
            <a routerLink="/" class="link-inline text-sm">← Back to the front page</a>
            <a routerLink="/docs" class="link-inline text-sm">Help centre</a>
            <a routerLink="/login" class="link-inline text-sm">Sign in</a>
          </nav>
        </div>
      </footer>
    </div>
  `,
})
export class RequestWorkspace {
  readonly theme = inject(ThemeService);

  /** What happens after sending, beside the form. */
  readonly steps = [
    { icon: 'shield', title: 'Reviewed by a person', body: 'A platform administrator reads every request before anything is made.' },
    { icon: 'mail', title: 'Sign-in by email', body: 'If it is granted, the address you give gets the sign-in details and becomes your username.' },
    { icon: 'lock', title: 'Yours alone', body: 'A workspace holds its own people, data and bills; nothing crosses to another one.' },
  ];
  private readonly fb = inject(FormBuilder);
  private readonly http = inject(HttpClient);

  readonly submitted = signal(false);
  readonly sending = signal(false);
  readonly error = signal('');
  readonly done = signal(false);
  readonly acknowledgement = signal('');

  /**
   * The server keeps 255 characters of each and answered a longer one with a generic 500. The
   * inputs stop at 255 as typed; the validator catches a paste that got past them.
   */
  readonly tooLong = { maxlength: 'Keep this under 255 characters.' };

  readonly form: FormGroup = this.fb.group({
    organisationName: ['', [Validators.required, Validators.maxLength(255)]],
    contactName: ['', [Validators.required, Validators.maxLength(255)]],
    contactEmail: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
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
