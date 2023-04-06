import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, AuthenticationService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models'

@Component({
    selector: 'forgot-pass',
    templateUrl: 'forgot-pass.component.html'
})
export class ForgotPassComponent implements OnInit {

    public forgotForm: FormGroup;
    public loading = false;
    public submitted = false;

    constructor(private formBuilder: FormBuilder,
        private router: Router,
        private authenticationService: AuthenticationService,
        private alertService: AlertService,
        private spinnerService: SpinnerService
    ) {}

    ngOnInit() {
        this.spinnerService.hide()
        this.forgotForm = this.formBuilder.group({
            email: ['', Validators.required],
        });
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.forgotForm.controls;
    }

    public onSubmit(): any {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.forgotForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        this.authenticationService.forgotPassword(this.forgotForm.value)
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
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
    }

}