import { Component, OnInit, inject, signal } from '@angular/core';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AccountSecurityApi, PasswordRules } from '../../account/account-security.api';
import { PasswordRulesHint } from '../../account/password-rules';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Field } from '../../../shared/ui/field';
import { FormDialog } from '../../../shared/ui/form-dialog';

/**
 * An administrator's reset of somebody else's password.
 *
 * It used the generic text prompt, which showed the password in clear and could only be checked
 * after it had closed -- so a short one cost a toast, a reopened dialog and the password typed
 * again. The length rule is a validator here, shown on the field, as the user dialog does.
 */
@Component({
  selector: 'app-reset-password-dialog',
  imports: [ReactiveFormsModule, Field, FormDialog, PasswordRulesHint],
  template: `
    <app-form-dialog [heading]="'Reset password for ' + data.name" confirmLabel="Reset password"
                     (cancelled)="ref.close()" (confirmed)="submit()">
      <form [formGroup]="form" class="form-stack" (ngSubmit)="submit()">
        <app-field label="New password" for="resetPassword" [required]="true"
                   [control]="form.get('password')" [submitted]="submitted()"
                   hint="They will need this to sign in. It is stored hashed and cannot be read back.">
          <input id="resetPassword" type="password" class="input" formControlName="password"
                 autocomplete="new-password" cdkFocusInitial (input)="typed.set($any($event.target).value)" />
        </app-field>
        <!-- MIG-353: the person's workspace's rules; the server says which one a refused password broke. -->
        <app-password-rules [rules]="rules()" [password]="typed()" />
      </form>
    </app-form-dialog>
  `,
})
export class ResetPasswordDialog implements OnInit {
  readonly ref = inject<DialogRef<string>>(DialogRef);
  readonly data = inject<{ name: string; tenantId?: number | null }>(DIALOG_DATA);
  private readonly security = inject(AccountSecurityApi);
  readonly submitted = signal(false);
  readonly rules = signal<PasswordRules | null>(null);
  readonly typed = signal('');

  ngOnInit(): void {
    this.security.rulesFor(this.data.tenantId).subscribe({
      next: r => { if (r.status === API_SUCCESS && r.data) this.rules.set(r.data); },
      error: () => { /* the server still holds the rules */ },
    });
  }
  readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.ref.close(this.form.getRawValue().password);
  }
}
