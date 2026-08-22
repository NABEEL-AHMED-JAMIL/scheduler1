import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { DatePipe } from '@angular/common';
import { Subscription } from 'rxjs';
import { AuthService, NotificationService } from '@/_services';
import { AppNotification } from '@/_models';
import * as echarts from 'echarts';
import './_content/app.less';

declare var $: any;

echarts.registerTheme('default', {
    textStyle: {
        fontFamily: "Montserrat, 'Lato', 'Open Sans', 'Helvetica Neue', Helvetica, Calibri, Arial, sans-serif"
    }
});

@Component({
    selector: 'app',
    templateUrl: 'app.component.html',
    providers: [DatePipe]
})
export class AppComponent implements OnInit, OnDestroy {

    public profileTime: string = '';
    private readonly chicagoTimeZone = 'America/Chicago';
    private profileTimer: any;

    public unreadCount = 0;
    public recentNotifications: AppNotification[] = [];
    private notificationsBootstrapped = false;
    private routerSubscription: Subscription;
    private unreadCountSubscription: Subscription;
    private recentSubscription: Subscription;

    constructor(public router: Router,
        public authService: AuthService,
        private datePipe: DatePipe,
        public notificationService: NotificationService) {
        this.routerSubscription = this.router.events.subscribe((event) => {
            if (event instanceof NavigationEnd) {
                this.bootstrapNotifications();
            }
        });
        this.unreadCountSubscription = this.notificationService.unreadCount$.subscribe((count) => this.unreadCount = count);
        this.recentSubscription = this.notificationService.recent$.subscribe((notifications) => this.recentNotifications = notifications);
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
        this.bootstrapNotifications();
        if (typeof $ !== 'undefined') {
            $(document).on('show.bs.dropdown.notificationLoad', '.notification-dropdown', () => {
                this.notificationService.loadRecent();
            });
        }
    }

    public ngOnDestroy(): void {
        if (this.profileTimer) {
            clearInterval(this.profileTimer);
        }
        if (typeof $ !== 'undefined') {
            $(document).off('show.bs.dropdown.notificationLoad');
        }
        if (this.routerSubscription) {
            this.routerSubscription.unsubscribe();
        }
        if (this.unreadCountSubscription) {
            this.unreadCountSubscription.unsubscribe();
        }
        if (this.recentSubscription) {
            this.recentSubscription.unsubscribe();
        }
    }

    private bootstrapNotifications(): void {
        if (this.notificationsBootstrapped || !this.authService.isLoggedIn()) {
            return;
        }
        this.notificationsBootstrapped = true;
        this.notificationService.connectLive();
        this.notificationService.refreshUnreadCount();
        this.notificationService.loadRecent();
    }

    public onNotificationClick(notification: AppNotification): void {
        this.notificationService.open(notification);
    }

    public onMarkAllRead(event: Event): void {
        event.stopPropagation();
        this.notificationService.markAllRead().subscribe();
        this.notificationService.markAllReadLocally();
    }

    private updateProfileTime(): void {
        const chicagoNow = new Date();
        this.profileTime = this.datePipe.transform(chicagoNow, 'HH:mm:ss', this.chicagoTimeZone) || '';
    }

    public logout(): void {
        this.authService.logout();
        this.notificationService.disconnectLive();
        this.notificationsBootstrapped = false;
        this.unreadCount = 0;
        this.recentNotifications = [];
    }

}
