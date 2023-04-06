import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AbstractControl, FormBuilder,
    FormControl, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, AuthenticationService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import jwt_decode from "jwt-decode";

@Component({
    selector: 'reset-pass',
    templateUrl: 'reset-pass.component.html'
})
export class ResetPassComponent implements OnInit {

    public resetPassForm: FormGroup;
    public loading = false;
    public submitted = false;
    public tokenPayload: any;

    public newPassword = new FormControl(null, [
        (c: AbstractControl) => Validators.required(c),
        Validators.pattern(
            /(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*#?&^_-]).{8,}/
        ),
      ]);
    public confirmPassword = new FormControl(null, [
        (c: AbstractControl) => Validators.required(c),
        Validators.pattern(
          /(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*#?&^_-]).{8,}/
        ),
    ]);

    constructor(private formBuilder: FormBuilder,
        private _activatedRoute: ActivatedRoute,
        private router: Router,
        private authenticationService: AuthenticationService,
        private alertService: AlertService,
        private spinnerService: SpinnerService
    ) {
        this._activatedRoute.queryParamMap
        .subscribe(params => {
            try {
                if (!params?.get('token')) {
                    // redirect to forgot password with message token not there
                    this.alertService.showError('Invlaid url\n please enter email again.', 'Error');
                    this.router.navigate(['/forgotpass']);
                }
                this.tokenPayload = jwt_decode(params?.get('token'), { header: false });
                this.tokenPayload = JSON.parse(this.tokenPayload.sub);
            } catch (exception) {
                this.alertService.showError('Invlaid token\n please enter email again.', 'Error');
                this.router.navigate(['/forgotpass']);
            }
        });
    }

    ngOnInit() {
        // if the token is not valid show the message and aslo hide redirect to reset password
        this.spinnerService.hide()
        this.resetPassForm = this.formBuilder.group({
            appUserId: [this.tokenPayload.appUserId, Validators.required],
            email: [this.tokenPayload.email, Validators.required],
            username: [this.tokenPayload.username, Validators.required],
            newPassword: this.newPassword,
            confirmPassword: this.confirmPassword
        },
        {
          validator: this.confirmedValidator('newPassword', 'confirmPassword'),
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.resetPassForm.controls;
    }

    public confirmedValidator(controlName: string, matchingControlName: string): any {
        return (formGroup: FormGroup) => {
          const control = formGroup.controls[controlName];
          const matchingControl = formGroup.controls[matchingControlName];
          if (matchingControl.errors && !matchingControl.errors.confirmedValidator) {
            return;
          }
          if (control.value !== matchingControl.value) {
            matchingControl.setErrors({ confirmedValidator: true });
          } else {
            matchingControl.setErrors(null);
          }
        };
    }

    public onSubmit(): any {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.resetPassForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        this.authenticationService.resetPassword(this.resetPassForm.value)
            .pipe(first())
            .subscribe(
                response => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, ApiCode.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    this.router.navigate(['/login']);
                },
                error => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, 'Error');
                });
    }

}