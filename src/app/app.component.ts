import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AlertService, AuthenticationService } from '@/_services';
import { AuthResponse, ApiCode } from './_models';
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
            this.authenticationService.currentUser
            .subscribe(currentUser => {
                this.currentUser = currentUser;
                if (this.currentUser) {
                    this.userRole = currentUser.roles;
                }
            });
    }

    public hasAccess(roleList: any): any {
        return this.userRole.some(
            role => roleList.includes(role));
    }

    public logout(): any {
        this.spinnerService.show();
        this.authenticationService.logout()
        .pipe(first())
        .subscribe(
            data => {
                this.spinnerService.hide();
                if (data.status === ApiCode.ERROR) {
                    this.alertService.showError(data.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(data.message, ApiCode.SUCCESS);
                this.router.navigate(['/login']);
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

}