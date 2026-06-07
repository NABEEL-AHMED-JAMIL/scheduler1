import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '@/_services';
import './_content/app.less';


/**
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'app',
    templateUrl: 'app.component.html'
})
export class AppComponent {

    constructor(public router: Router, public authService: AuthService) {
    }

    public get showNav(): boolean {
        return this.authService.isLoggedIn() && !this.router.url.startsWith('/login');
    }

    public logout(): void {
        this.authService.logout();
    }

}
