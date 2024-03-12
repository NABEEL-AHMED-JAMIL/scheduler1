import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { first } from 'rxjs/operators';
import { AlertService, AuthenticationService, LookupService } from '@/_services';
import { AbstractControl, FormBuilder, 
    FormControl, FormGroup, Validators } from '@angular/forms';
import { Location } from '@angular/common';
import { SpinnerService } from '@/_helpers';
import { ApiCode, LOOKUP_TYPES } from '@/_models';


@Component({
    selector: 'register',
    templateUrl: 'register.component.html'
})
export class RegisterComponent implements OnInit {

    public registerForm: FormGroup;
    public loading: any = false;
    public submitted: any = false;
    public SCHEDULER_TIMEZONE: LOOKUP_TYPES;
    public schedulerTimezoneList: any;

    public password = new FormControl(null, [
        (c: AbstractControl) => Validators.required(c),
        Validators.pattern(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*#?&^_-]).{8,}/),
    ]);

    constructor(
        private router: Router,
        private formBuilder: FormBuilder,
        private authenticationService: AuthenticationService,
        private spinnerService: SpinnerService,
        private alertService: AlertService,
        private lookupService: LookupService,
        private location: Location) {
        this.SCHEDULER_TIMEZONE = LOOKUP_TYPES.SCHEDULER_TIMEZONE;
        this.getSchedulerTimeZone();
    }

    ngOnInit() {
        this.registerForm = this.formBuilder.group({
            firstname: ['', Validators.required],
            lastname: ['', Validators.required],
            username: ['', Validators.required],
            email: ['', [Validators.required, Validators.email]],
            timeZone: ['', Validators.required],
            password: this.password
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.registerForm.controls;
    }

    // SCHEDULER_TIMEZONE
    public getSchedulerTimeZone(): void {
        this.spinnerService.show();
        let payload = {
            lookupType: this.SCHEDULER_TIMEZONE
        }
        this.lookupService.fetchLookupByLookupType(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.schedulerTimezoneList = response.data
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
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
        if (this.registerForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        this.authenticationService.signupAppUser(this.registerForm.value)
            .pipe(first())
            .subscribe((response: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.router.navigate(['/login']);
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public back(): any {
        this.location.back();
    }

}