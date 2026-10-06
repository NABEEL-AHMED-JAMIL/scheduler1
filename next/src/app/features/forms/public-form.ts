import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { BrandMark } from '../../shared/ui/brand-mark';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { AnswerChange, FormRenderer, UploadWanted } from './form-renderer';
import { Answers, PublicFormView, UploadRef, answerProblems, answersForSubmit } from './forms.model';
import { PublicFormsApi } from './forms.service';

/** Why a link opened nothing, as the visitor reads it. */
type Refusal = { title: string; text: string; signIn: boolean };

/**
 * A form shared by link (MIG-278), at /f/:token: outside the signed-in shell, open to whoever holds the link. The page
 * shows the form and nothing of the workspace behind it, sends the answers with the visit's ticket and an empty field no
 * person sees (a bot fills it in), and answers a refusal -- not valid, expired, used, sign-in -- in one plain sentence.
 * A person who is signed in is sent as themselves (the console's usual token), which a link that requires sign-in needs.
 */
@Component({
  selector: 'app-public-form',
  imports: [BrandMark, FormRenderer, Icon, RouterLink, ServerTimePipe],
  template: `
    <div class="min-h-screen flex flex-col bg-page">
      <header class="border-b border-subtle">
        <div class="mx-auto w-full max-w-3xl px-5 h-14 flex items-center gap-3">
          <app-brand-mark />
          <div class="ml-auto flex items-center gap-1.5">
            <button type="button" class="btn btn-ghost btn-icon btn-sm"
                    [attr.aria-label]="theme.theme() === 'dark' ? 'Switch to light' : 'Switch to dark'"
                    (click)="theme.toggle()">
              <app-icon [name]="theme.theme() === 'dark' ? 'sun' : 'moon'" />
            </button>
          </div>
        </div>
      </header>

      <main class="mx-auto w-full max-w-3xl px-5 py-10 flex-1">
        @if (loading()) {
          <div class="card p-8 text-center text-sm text-[color:var(--text-muted)]" role="status">Opening the form…</div>
        } @else if (refusal(); as r) {
          <section class="card p-8 flex flex-col items-center gap-3 text-center" data-refused>
            <span class="stat-glyph"><app-icon [name]="r.signIn ? 'lock' : 'alert'" class="icon-warn" /></span>
            <h1 class="text-lg font-semibold">{{ r.title }}</h1>
            <p class="text-sm text-[color:var(--text-secondary)] max-w-md">{{ r.text }}</p>
            @if (r.signIn && !signedIn()) {
              <a class="btn btn-primary btn-sm mt-1" routerLink="/login" [queryParams]="{ returnUrl: here() }">Sign in</a>
            }
          </section>
        } @else if (sent()) {
          <section class="card p-8 flex flex-col items-center gap-3 text-center" aria-live="polite" data-submitted>
            <span class="stat-glyph"><app-icon name="checkCircle" class="icon-ok" /></span>
            <h1 class="text-lg font-semibold">Submitted</h1>
            <p class="text-sm text-[color:var(--text-secondary)] max-w-md">{{ sentMessage() }}</p>
            <p class="text-xs text-[color:var(--text-muted)]">You can close this page.</p>
          </section>
        } @else if (view(); as f) {
          <h1 class="text-2xl font-semibold tracking-tight">{{ f.name }}</h1>
          @if (f.description) {
            <p class="mt-2 text-[color:var(--text-secondary)] max-w-xl leading-relaxed whitespace-pre-line">{{ f.description }}</p>
          }
          <form class="card p-4 mt-6 flex flex-col gap-5" (submit)="$event.preventDefault(); send()" novalidate>
            <app-form-renderer [fields]="f.fields" [answers]="answers()" [problems]="problems()" [disabled]="sending()"
                               [uploading]="uploading()" idPrefix="pub"
                               (answerChange)="change($event)" (uploadWanted)="uploadFiles($event)"
                               (signatureDrawn)="uploadSignature($event.key, $event.png)" />
            <!-- Nobody sees or reaches this field; a bot that fills every input in gives itself away. -->
            <div class="hp" aria-hidden="true">
              <label for="pub-website">Website</label>
              <input id="pub-website" name="website" type="text" tabindex="-1" autocomplete="off"
                     [value]="website()" (input)="website.set($any($event.target).value)" />
            </div>
            @if (message()) { <p class="text-sm text-crit-500" role="alert">{{ message() }}</p> }
            <div class="flex flex-wrap items-center gap-3 border-t border-subtle pt-4">
              <button type="submit" class="btn btn-primary" [disabled]="sending() || busyUploading()">
                <app-icon name="send" />{{ sending() ? 'Sending…' : 'Submit' }}
              </button>
              <span class="text-xs text-[color:var(--text-muted)]">This link works until {{ f.expiresAt | serverTime:'dateTime' }}.</span>
            </div>
          </form>
        }
      </main>
    </div>
  `,
  styles: [`
    .hp { position: absolute; left: -10000px; top: auto; width: 1px; height: 1px; overflow: hidden; }
  `],
})
export class PublicForm implements OnInit {
  private readonly api = inject(PublicFormsApi);
  private readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  /** The route's :token. */
  readonly token = input<string>('');

  readonly loading = signal(true);
  readonly view = signal<PublicFormView | null>(null);
  readonly refusal = signal<Refusal | null>(null);
  readonly answers = signal<Answers>({});
  readonly problems = signal<Record<string, string>>({});
  readonly uploading = signal<Record<string, boolean>>({});
  readonly busyUploading = computed(() => Object.values(this.uploading()).some(v => v));
  readonly message = signal('');
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly sentMessage = signal('');
  readonly website = signal('');
  readonly signedIn = computed(() => !!this.auth.user?.());

  ngOnInit(): void {
    this.load();
  }

  here(): string {
    return `/f/${this.token()}`;
  }

  load(): void {
    const token = this.token();
    if (!token) { this.loading.set(false); this.refusal.set(refusalOf(404, '')); return; }
    this.loading.set(true);
    this.api.open(token).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.refusal.set(refusalOf(404, r.message)); return; }
        this.view.set(r.data);
      },
      error: (err: HttpErrorResponse) => { this.loading.set(false); this.refusal.set(refusalOf(err.status, err.error?.message)); },
    });
  }

  change(event: AnswerChange): void {
    this.answers.update(a => ({ ...a, [event.key]: event.value }));
    this.clearProblem(event.key);
  }

  send(): void {
    const f = this.view();
    if (!f || this.sending()) return;
    const problems = answerProblems(f.fields, this.answers());
    this.problems.set(problems);
    const count = Object.keys(problems).length;
    if (count) {
      this.message.set(count === 1 ? 'One answer needs attention.' : `${count} answers need attention.`);
      return;
    }
    this.message.set('');
    this.sending.set(true);
    this.api.submit(this.token(), f.ticket, answersForSubmit(f.fields, this.answers()), this.website()).subscribe({
      next: r => {
        this.sending.set(false);
        if (r.status === API_SUCCESS) { this.sent.set(true); this.sentMessage.set(r.message); return; }
        if (r.data?.problems) this.problems.set(r.data.problems);
        this.message.set(r.message || 'The form was not sent.');
      },
      error: (err: HttpErrorResponse) => {
        this.sending.set(false);
        // The link itself stopped working while the page was open: say so in place of the form.
        if (err.status === 404 || err.status === 410 || err.status === 401 || err.status === 403) {
          this.refusal.set(refusalOf(err.status, err.error?.message));
          return;
        }
        this.message.set(err.error?.message || 'The form was not sent. Try again.');
      },
    });
  }

  /** Each chosen file is uploaded now, under this visit's ticket; the answer keeps the ones Core took. */
  uploadFiles(event: UploadWanted): void {
    const f = this.view();
    const field = f?.fields.find(x => x.key === event.key);
    if (!f || !field) return;
    const room = (field.maxFiles ?? 1) - this.current(event.key).length;
    const files = event.files.slice(0, Math.max(0, room));
    const overflow = event.files.length > files.length ? `${field.label} takes at most ${field.maxFiles ?? 1} file(s).` : '';
    let pending = files.length;
    if (!pending) { if (overflow) this.setProblem(event.key, overflow); return; }
    const settle = () => {
      if (--pending > 0) return;
      this.uploading.update(u => ({ ...u, [event.key]: false }));
      if (overflow) this.setProblem(event.key, overflow);
    };
    this.uploading.update(u => ({ ...u, [event.key]: true }));
    for (const file of files) {
      this.api.upload(this.token(), f.ticket, event.key, file, file.name).subscribe({
        next: r => {
          if (r.status === API_SUCCESS && r.data) {
            const kept = r.data;
            this.answers.update(a => ({ ...a, [event.key]: [...this.current(event.key), kept] }));
            this.clearProblem(event.key);
          } else {
            this.setProblem(event.key, r.message || `${file.name} was not uploaded.`);
          }
          settle();
        },
        error: (err: HttpErrorResponse) => {
          this.setProblem(event.key, err.error?.message || `${file.name} was not uploaded. Try again.`);
          settle();
        },
      });
    }
  }

  uploadSignature(key: string, png: Blob): void {
    const f = this.view();
    if (!f) return;
    this.uploading.update(u => ({ ...u, [key]: true }));
    this.api.upload(this.token(), f.ticket, key, png, 'signature.png').subscribe({
      next: r => {
        this.uploading.update(u => ({ ...u, [key]: false }));
        if (r.status === API_SUCCESS && r.data) { this.answers.update(a => ({ ...a, [key]: r.data! })); this.clearProblem(key); }
        else this.setProblem(key, r.message || 'The signature was not kept. Sign again.');
      },
      error: (err: HttpErrorResponse) => {
        this.uploading.update(u => ({ ...u, [key]: false }));
        this.setProblem(key, err.error?.message || 'The signature was not kept. Sign again.');
      },
    });
  }

  private current(key: string): UploadRef[] {
    const value = this.answers()[key];
    return Array.isArray(value) ? value as UploadRef[] : [];
  }

  private setProblem(key: string, problem: string): void {
    this.problems.update(p => ({ ...p, [key]: problem }));
  }

  private clearProblem(key: string): void {
    if (this.problems()[key]) this.problems.update(p => { const next = { ...p }; delete next[key]; return next; });
  }
}

/** The heading and sentence for a refused link; Core's own sentence when it sent one. */
export function refusalOf(status: number, said: string | null | undefined): Refusal {
  const text = said?.trim() || '';
  switch (status) {
    case 410: return { title: 'This link no longer works', text: text || 'This link has expired. Ask whoever sent it for a new one.', signIn: false };
    case 401: return { title: 'Sign in to fill this in', text: text || 'Sign in to the workspace that shared this form to fill it in.', signIn: true };
    case 403: return { title: 'This form is for another workspace', text: text || 'Sign in to the workspace that shared this form to fill it in.', signIn: true };
    case 429: return { title: 'Too many tries', text: text || 'Too many tries from here. Wait a minute and try again.', signIn: false };
    case 0: return { title: 'Could not reach the server', text: text || 'Check your connection and reload the page.', signIn: false };
    case 404: return { title: 'This link is not valid', text: text || 'This link is not valid. Ask whoever sent it for a new one.', signIn: false };
    default: return { title: 'This form cannot be opened right now', text: text || 'Try again in a minute.', signIn: false };
  }
}
