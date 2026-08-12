import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, AlertService } from '@/_services';


/**
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'login',
    templateUrl: 'login.component.html'
})
export class LoginComponent implements OnInit {

    public loginForm!: FormGroup;
    public submitted: boolean = false;
    public error: string = '';
    private returnUrl: string = '/home';

    constructor(private fb: FormBuilder,
        private authService: AuthService,
        private alertService: AlertService,
        private route: ActivatedRoute,
        private router: Router) {
    }

    ngOnInit(): void {
        // already logged in -> straight to home
        if (this.authService.isLoggedIn()) {
            this.router.navigate(['/home']);
            return;
        }
        this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/home';
        this.loginForm = this.fb.group({
            username: ['', Validators.required],
            password: ['', Validators.required]
        });
    }

    public get f(): any {
        return this.loginForm.controls;
    }

    public submit(): void {
        this.submitted = true;
        this.error = '';
        if (this.loginForm.invalid) {
            return;
        }
        const { username, password } = this.loginForm.value;
        this.authService.login(username, password).subscribe((errorMessage) => {
            if (errorMessage) {
                this.error = errorMessage;
                this.alertService.showError(this.error, 'Login Failed');
                return;
            }
            this.router.navigateByUrl(this.returnUrl);
        }, (error) => {
            this.error = 'Could not reach the server. Please try again.';
            this.alertService.showError(error, 'Login Failed');
        });
    }
}
