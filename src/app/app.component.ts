import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { AuthService } from '@/_services';
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
        this.initDropdownAutoFlip();
    }

    public ngOnDestroy(): void {
        if (this.profileTimer) {
            clearInterval(this.profileTimer);
        }
        if (typeof $ !== 'undefined') {
            $(document).off('show.bs.dropdown.autoFlip');
        }
    }

    private initDropdownAutoFlip(): void {
        if (typeof $ === 'undefined') {
            return;
        }
        $(document).on('show.bs.dropdown.autoFlip', '.dropdown', function (this: HTMLElement) {
            const $dropdown = $(this);
            const $menu = $dropdown.find('.dropdown-menu').first();
            const $toggle = $dropdown.find('[data-toggle="dropdown"]').first();
            if (!$menu.length || !$toggle.length) {
                return;
            }

            $dropdown.removeClass('dropup');
            $menu.css({ visibility: 'hidden', display: 'block' });

            const toggleRect = $toggle[0].getBoundingClientRect();
            const menuHeight = $menu.outerHeight();

            let lowerBound = window.innerHeight;
            let upperBound = 0;
            $dropdown.parents().each(function (this: HTMLElement) {
                const overflowY = $(this).css('overflow-y');
                if ((overflowY === 'auto' || overflowY === 'scroll') && this.scrollHeight > this.clientHeight) {
                    const rect = this.getBoundingClientRect();
                    lowerBound = Math.min(lowerBound, rect.bottom);
                    upperBound = Math.max(upperBound, rect.top);
                }
            });

            const spaceBelow = lowerBound - toggleRect.bottom;
            const spaceAbove = toggleRect.top - upperBound;
            if (spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow) {
                $dropdown.addClass('dropup');
            }

            $menu.css({ visibility: '', display: '' });
        });
    }

    private updateProfileTime(): void {
        const chicagoNow = new Date();
        this.profileTime = this.datePipe.transform(chicagoNow, 'HH:mm:ss', this.chicagoTimeZone) || '';
    }

    public logout(): void {
        this.authService.logout();
    }

}
