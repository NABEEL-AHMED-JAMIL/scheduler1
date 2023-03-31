import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertService, AuthenticationService } from '@/_services';
import { AuthResponse } from './_models';
import './_content/app.less';
import { first } from 'rxjs/operators';
import { SpinnerService } from '@/_helpers';

@Component({
    selector: 'app',
    templateUrl: 'app.component.html'
})
export class AppComponent {

    public currentUser: AuthResponse;
    public userRole: any;

    constructor(
        private router: Router,
        private spinnerService: SpinnerService,
        private alertService: AlertService,
        private authenticationService: AuthenticationService) {
            this.authenticationService.currentUser.subscribe(currentUser => {
                this.currentUser = currentUser;
                if (this.currentUser) {
                    this.userRole = currentUser.roles;
                }
            });
    }

    public hasAccess(roleList: any) {
        return this.userRole.some(r=> roleList.includes(r));
    }

    public logout() {
        this.spinnerService.show();
        this.authenticationService.logout()
        .pipe(first())
        .subscribe(
            data => {
                this.spinnerService.hide();
                if (data.status == 'ERROR') {
                    this.alertService.showError(data.message, 'Error');
                    return;
                }
                this.alertService.showSuccess('Logout successfully', 'Sucess');
                this.router.navigate(['/login']);
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, 'Error');
            });
    }

}