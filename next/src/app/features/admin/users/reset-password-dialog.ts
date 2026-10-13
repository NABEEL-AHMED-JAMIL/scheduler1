import { Component, ElementRef, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AccountSecurityApi, PasswordRules } from '../../account/account-security.api';
import { PasswordRulesHint, firstUnmetRule, newPasswordPlaceholder } from '../../account/password-rules';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

/** Who the dialog resets. `own` when the administrator is resetting their own password from the users screen. */
export interface ResetPasswordData {
  appUserId: number;
  name: string;
  tenantId?: number | null;
  own?: boolean;
}

/**
 * What a reset that happened hands back to the users screen: whose, and -- somebody else's only -- the password, so the
 * screen can offer "Copy password" once. It is never shown, never logged, and dropped when that notice goes.
 */
export interface ResetPasswordResult {
  name: string;
  own: boolean;
  password: string | null;
}

/**
 * An administrator's reset of somebody's password.
 *
 * The dialog makes the call itself and stays open until the server accepts the password. It used to close on submit
 * and leave the call to the users screen, which said the outcome in a toast -- and the server answered a refusal 200
 * with status ERROR. A refused reset (a recent password, a common one) looked like a done one: the owner passed on a
 * password the account never had, and its sign-in said "Invalid username or password" (2026-10-13). Now a refusal is
 * shown under the field in the server's words, with the typed password kept and the field focused, and only a reset
 * that happened closes the dialog.
 *
 * What the console can check (length, character classes) it checks before sending; what only the server can (not a
 * common password, not their sign-in name, not a recent one) the dialog says is checked on save.
 */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, PasswordRulesHint],
  template: `
    <app-form-dialog [heading]="'Reset password for ' + data.name" confirmLabel="Reset password" busyLabel="Resetting…"
                     [saving]="saving()" (cancelled)="cancel()" (confirmed)="submit()">
      <form [formGroup]="form" class="form-stack" (ngSubmit)="submit()" data-test="reset-password-form">
        <app-field label="New password" for="resetPassword" [required]="true"
                   [control]="form.get('password')" [submitted]="submitted()" [error]="fieldError()"
                   [hint]="data.own ? 'Your new password. It is stored hashed and cannot be read back.'
                     : 'They will need this to sign in, and choose their own at their next sign-in. It is stored hashed and cannot be read back.'">
          <input #passwordInput id="resetPassword" type="password" class="input" formControlName="password"
                 autocomplete="new-password" cdkFocusInitial [placeholder]="hint()" [readonly]="saving()"
                 (input)="typed.set($any($event.target).value); serverError.set('')" data-test="reset-password-input" />
        </app-field>
        <!-- MIG-353: the person's workspace's rules; the server says which one a refused password broke. -->
        <app-password-rules [rules]="rules()" [password]="typed()" [subject]="data.own ? 'own' : 'theirs'" />
        <p class="field-note text-[color:var(--text-muted)] mt-2" data-test="server-checked-note">
          {{ data.own ? 'Not a common password, and not one of your recent ones' : 'Not a common password, and not one of their recent ones' }}:
          those are checked when you reset.
        </p>
      </form>
    </app-form-dialog>
  `,
})
export class ResetPasswordDialog implements OnInit {
  readonly ref = inject<DialogRef<ResetPasswordResult>>(DialogRef);
  readonly data = inject<ResetPasswordData>(DIALOG_DATA);
  private readonly security = inject(AccountSecurityApi);
  private readonly http = inject(HttpClient);
  private readonly input = viewChild<ElementRef<HTMLInputElement>>('passwordInput');

  readonly submitted = signal(false);
  readonly saving = signal(false);
  readonly rules = signal<PasswordRules | null>(null);
  readonly hint = computed(() => newPasswordPlaceholder(this.rules()));
  readonly typed = signal('');
  /** The server's refusal, in its words, until the password is changed. */
  readonly serverError = signal('');
  /** A rule the console can check and the password misses, once a reset was tried (the chip says it while typing). */
  readonly ruleError = signal('');
  readonly fieldError = computed(() => this.serverError() || this.ruleError());

  readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  ngOnInit(): void {
    this.security.rulesFor(this.data.tenantId).subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) this.rules.set(r.data); },
      error: () => { /* the server still holds the rules */ },
    });
  }

  cancel(): void {
    if (this.saving()) return;
    this.ref.close();
  }

  submit(): void {
    // One reset in flight: Enter and the button both land here, and a second answer would race the first.
    if (this.saving()) return;
    this.submitted.set(true);
    this.serverError.set('');
    this.ruleError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const password = this.form.getRawValue().password;
    const missing = firstUnmetRule(this.rules(), password);
    if (missing) {
      this.ruleError.set(`Still needs ${missing}.`);
      this.focusField();
      return;
    }
    this.saving.set(true);
    // Escape and the backdrop wait for the answer too: closing mid-flight would hide whether it happened.
    this.ref.disableClose = true;
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/resetPassword`, { appUserId: this.data.appUserId, password }).subscribe({
      next: response => {
        if (response?.status === API_SUCCESS) {
          this.ref.disableClose = false;
          this.ref.close({ name: this.data.name, own: !!this.data.own, password: this.data.own ? null : password });
          return;
        }
        // A server from before refusals were 4xx says ERROR with 200: the same refusal.
        this.refused(response?.message);
      },
      error: err => this.refused(err?.error?.message),
    });
  }

  private refused(message: string | undefined): void {
    this.saving.set(false);
    this.ref.disableClose = false;
    this.serverError.set(message || 'The password could not be reset. Try again.');
    this.focusField();
  }

  /** Back to the field, with what was typed still in it, so the next try is an edit rather than a retype. */
  private focusField(): void {
    setTimeout(() => {
      const el = this.input()?.nativeElement;
      if (!el) return;
      el.focus();
      el.select();
    });
  }
}
