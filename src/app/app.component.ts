import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AuthService } from '@/_services';
import './_content/app.less';

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

    public get isFlushRoute(): boolean {
        return this.router.url === '/';
    }

    public get userInitials(): string {
        const name = this.authService.currentUser?.fullName || this.authService.currentUser?.username || '';
        const parts = name.trim().split(/\s+/).filter(Boolean);
        if (parts.length === 0) {
            return '?';
        }
        return parts.length === 1
            ? parts[0].charAt(0).toUpperCase()
            : (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
    }

    public get userRoleLabel(): string {
        const role = this.authService.currentUser?.userRole;
        switch (role) {
            case 'PLATFORM_ADMIN': return 'Platform Admin';
            case 'TENANT_ADMIN': return 'Tenant Admin';
            case 'TENANT_USER': return 'Tenant User';
            default: return '';
        }
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
