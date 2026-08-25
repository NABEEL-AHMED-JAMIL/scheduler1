import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { API_SUCCESS } from '../../core/api/api.config';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule],
  templateUrl: './login.html',
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly submitting = signal(false);
  readonly error = signal('');

  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  submit(): void {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    const { username, password } = this.form.getRawValue();
    this.auth.login(username, password).subscribe({
      next: response => {
        this.submitting.set(false);
        if (response.status === API_SUCCESS) {
          // Land where they were headed before the guard intervened, when there was somewhere.
          // Only a path from this application is followed, so a crafted returnUrl cannot send
          // someone to another site after signing in.
          const requested = this.route.snapshot.queryParamMap.get('returnUrl') ?? '';
          const safe = requested.startsWith('/') && !requested.startsWith('//')
            ? requested : '/';
          void this.router.navigateByUrl(safe);
        } else {
          this.error.set(response.message || 'Sign in failed.');
        }
      },
      error: err => {
        this.submitting.set(false);
        this.error.set(err?.error?.message || 'Could not reach the server.');
      },
    });
  }
}
