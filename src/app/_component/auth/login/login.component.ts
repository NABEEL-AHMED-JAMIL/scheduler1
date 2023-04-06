import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, AuthenticationService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models/index';

@Component({
    selector: 'login',
    templateUrl: 'login.component.html'
})
export class LoginComponent implements OnInit {

    public loginForm: FormGroup;
    public loading = false;
    public submitted = false;
    public returnUrl: string;

    constructor(
        private formBuilder: FormBuilder,
        private route: ActivatedRoute,
        private router: Router,
        private authenticationService: AuthenticationService,
        private alertService: AlertService,
        private spinnerService: SpinnerService) {
        // redirect to home if already logged in
        if (this.authenticationService.currentUserValue) {
            this.router.navigate(['/']);
        }
    }

    ngOnInit() {
        this.spinnerService.hide()
        this.loginForm = this.formBuilder.group({
            username: ['', Validators.required],
            password: ['', Validators.required]
        });
        // get return url from route parameters or default to '/'
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/';
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.loginForm.controls;
    }

    public onSubmit(): any {
        this.submitted = true;
        this.spinnerService.show();
        // stop here if form is invalid
        if (this.loginForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        this.authenticationService.signInAppUser(this.f.username.value, this.f.password.value)
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
                    this.router.navigate([this.returnUrl]);
                },
                error => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
    }

    public register(): any {
        this.router.navigate(['/register']);
    }
}