import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { Icon } from '../../shared/ui/icon';
import { LoadError } from '../../shared/ui/load-error';
import { AnswerChange, FormRenderer } from './form-renderer';
import { Answers, FormSummary, Submission, answerProblems, answersForSubmit, submissionStatusText } from './forms.model';
import { FormsApi } from './forms.service';

/**
 * Forms › Fill in (Wave 5 Forms lite; page 'forms'): a member of the workspace fills in one of its Active forms. The
 * answers are checked as they are sent -- here first, then by Core, whose refusal is shown at each field -- and the
 * submission is stored; when the form starts a job, the page says whether its run started (and which), or why not.
 * Shared inside the workspace only: there is no public link.
 */
@Component({
  selector: 'app-form-fill',
  imports: [FormRenderer, Icon, LoadError, RouterLink],
  template: `
    <div class="page max-w-3xl">
      <div class="page-head">
        <div class="min-w-0">
          <p class="text-xs text-[color:var(--text-muted)]">
            <a class="link-inline" routerLink="/forms/builder">Forms</a> › Fill in
          </p>
          <h1 class="page-title">{{ form()?.name || 'Fill in a form' }}</h1>
          @if (form()?.description) { <p class="page-subtitle whitespace-pre-line">{{ form()?.description }}</p> }
        </div>
      </div>

      @if (loading()) {
        <div class="card p-8 text-center text-sm text-[color:var(--text-muted)]" role="status">Opening the form…</div>
      } @else if (error()) {
        <div class="card p-0"><app-load-error [message]="error()" (retry)="load()" /></div>
      } @else if (form(); as f) {
        @if (done(); as s) {
          <section class="card p-4 flex flex-col gap-3" aria-live="polite" data-submitted>
            <div class="flex items-center gap-2">
              <app-icon [name]="s.status === 'RunNotStarted' ? 'alert' : 'checkCircle'"
                        [class]="s.status === 'RunNotStarted' ? 'icon-warn' : 'icon-ok'" />
              <h2 class="text-base font-semibold">Submitted</h2>
              <span class="pill" [class.pill-ok]="s.status === 'RunStarted'" [class.pill-warn]="s.status === 'RunNotStarted'"
                    [class.pill-neutral]="s.status === 'Received'">{{ statusText(s) }}</span>
            </div>
            <p class="text-sm">{{ doneMessage() }}</p>
            <p class="text-xs text-[color:var(--text-muted)]">Submission #{{ s.submissionId }}</p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary btn-sm" (click)="again()"><app-icon name="plus" />Fill in another</button>
              @if (canSeeSubmissions()) {
                <a class="btn btn-default btn-sm" routerLink="/forms/submissions" [queryParams]="{ formId: f.formId }">
                  <app-icon name="table" />Submissions
                </a>
              }
            </div>
          </section>
        } @else {
          <form class="card p-4 flex flex-col gap-5" (submit)="$event.preventDefault(); send()" novalidate>
            @if (f.status !== 'Active') {
              <p class="text-sm text-[color:var(--text-secondary)]" role="note">
                This form is {{ f.status }}, so it takes no submissions. Make it Active in the form builder first.
              </p>
            }
            <app-form-renderer [fields]="f.fields ?? []" [answers]="answers()" [problems]="problems()" [disabled]="sending()"
                               idPrefix="fill" (answerChange)="change($event)" />
            @if (message()) { <p class="text-sm text-crit-500" role="alert">{{ message() }}</p> }
            <div class="flex items-center gap-2 border-t border-subtle pt-4">
              <button type="submit" class="btn btn-primary" [disabled]="sending() || f.status !== 'Active'">
                <app-icon name="send" />{{ sending() ? 'Sending…' : 'Submit' }}
              </button>
              @if (f.startsJob) {
                <span class="text-xs text-[color:var(--text-muted)]">Submitting starts this form's pipeline.</span>
              }
            </div>
          </form>
        }
      }
    </div>
  `,
})
export class FormFill implements OnInit {
  private readonly api = inject(FormsApi);
  private readonly auth = inject(AuthService);

  /** The route's :formId. */
  readonly formId = input<string>('');

  readonly form = signal<FormSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly answers = signal<Answers>({});
  readonly problems = signal<Record<string, string>>({});
  readonly message = signal('');
  readonly sending = signal(false);
  readonly done = signal<Submission | null>(null);
  readonly doneMessage = signal('');
  readonly canSeeSubmissions = computed(() => this.auth.canOpen('form-submissions'));
  readonly statusText = submissionStatusText;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = Number(this.formId());
    if (!Number.isInteger(id) || id <= 0) {
      this.loading.set(false);
      this.error.set('Form not found.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.fetch(id).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'Form not found.'); return; }
        this.form.set(r.data);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The form could not be opened.'); },
    });
  }

  change(event: AnswerChange): void {
    this.answers.update(a => ({ ...a, [event.key]: event.value }));
    if (this.problems()[event.key]) {
      this.problems.update(p => { const next = { ...p }; delete next[event.key]; return next; });
    }
  }

  send(): void {
    const form = this.form();
    if (!form || this.sending() || form.status !== 'Active') return;
    const fields = form.fields ?? [];
    const problems = answerProblems(fields, this.answers());
    this.problems.set(problems);
    if (Object.keys(problems).length) {
      this.message.set(Object.keys(problems).length === 1 ? 'One answer needs attention.' : `${Object.keys(problems).length} answers need attention.`);
      return;
    }
    this.message.set('');
    this.sending.set(true);
    this.api.submit(form.formId, answersForSubmit(fields, this.answers())).subscribe({
      next: r => {
        this.sending.set(false);
        if (r.status === API_SUCCESS && r.data && 'submissionId' in r.data) {
          this.done.set(r.data);
          this.doneMessage.set(r.message);
          return;
        }
        const refused = r.data && 'problems' in r.data ? r.data.problems : null;
        if (refused) this.problems.set(refused);
        this.message.set(r.message || 'The form was not sent.');
      },
      error: err => { this.sending.set(false); this.message.set(err?.error?.message || 'The form was not sent. Try again.'); },
    });
  }

  again(): void {
    this.done.set(null);
    this.answers.set({});
    this.problems.set({});
    this.message.set('');
  }
}
