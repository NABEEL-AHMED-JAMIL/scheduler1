import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AuthService } from '@/_services';
import './_content/app.less';


/**
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'app',
    templateUrl: 'app.component.html',
    providers: [DatePipe]
})
export class AppComponent implements OnInit, OnDestroy {

    public profileTime: string = '';
    private readonly chicagoTimeZone = 'America/Chicago';
    private profileTimer: any;

    constructor(public router: Router,
        public authService: AuthService,
        private datePipe: DatePipe) {
    }

    public get showNav(): boolean {
        return this.authService.isLoggedIn() && !this.router.url.startsWith('/login');
    }

    public ngOnInit(): void {
        this.updateProfileTime();
        this.profileTimer = setInterval(() => this.updateProfileTime(), 1000);
    }

    public ngOnDestroy(): void {
        if (this.profileTimer) {
            clearInterval(this.profileTimer);
        }
    }

    private updateProfileTime(): void {
        const chicagoNow = new Date();
        this.profileTime = this.datePipe.transform(chicagoNow, 'HH:mm:ss', this.chicagoTimeZone) || '';
    }

    public logout(): void {
        this.authService.logout();
    }

}
