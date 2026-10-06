import { Component, inject, signal } from '@angular/core';
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
  imports: [ReactiveFormsModule, Field, FormDialog],
  template: `
    <app-form-dialog [heading]="'Reset password for ' + data.name" confirmLabel="Reset password"
                     (cancelled)="ref.close()" (confirmed)="submit()">
      <form [formGroup]="form" class="form-stack" (ngSubmit)="submit()">
        <app-field label="New password" for="resetPassword" [required]="true"
                   [control]="form.get('password')" [submitted]="submitted()"
                   hint="They will need this to sign in. It is stored hashed and cannot be read back.">
          <input id="resetPassword" type="password" class="input" formControlName="password"
                 autocomplete="new-password" placeholder="At least 8 characters" cdkFocusInitial />
        </app-field>
      </form>
    </app-form-dialog>
  `,
})
export class ResetPasswordDialog {
  readonly ref = inject<DialogRef<string>>(DialogRef);
  readonly data = inject<{ name: string }>(DIALOG_DATA);
  readonly submitted = signal(false);
  readonly form = new FormGroup({
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(8)] }),
  });

  submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.ref.close(this.form.getRawValue().password);
  }
}
