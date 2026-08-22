import { Component, OnInit } from '@angular/core';
import { AlertService, NotificationService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, AppNotification } from '@/_models';

@Component({
    selector: 'notification-center',
    templateUrl: 'notification-center.component.html'
})
export class NotificationCenterComponent implements OnInit {

    public ERROR = 'Error';
    public notifications: AppNotification[] = [];
    public unreadOnly = false;
    public currentPage = 1;
    public pageSize = 20;
    public totalRecord = 0;

    constructor(private alertService: AlertService,
        private spinnerService: SpinnerService,
        public notificationService: NotificationService) {
    }

    ngOnInit() {
        this.load();
    }

    public get totalPages(): number {
        return Math.max(1, Math.ceil(this.totalRecord / this.pageSize));
    }

    public setFilter(unreadOnly: boolean): void {
        if (this.unreadOnly === unreadOnly) {
            return;
        }
        this.unreadOnly = unreadOnly;
        this.currentPage = 1;
        this.load();
    }

    public load(): void {
        this.spinnerService.show();
        this.notificationService.list(this.unreadOnly, this.currentPage, this.pageSize)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.notifications = response.data || [];
                    this.totalRecord = response.paging?.totalRecord || 0;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public goToPage(page: number): void {
        if (page < 1 || page > this.totalPages || page === this.currentPage) {
            return;
        }
        this.currentPage = page;
        this.load();
    }

    public onMarkAllRead(): void {
        this.notificationService.markAllRead().pipe(first()).subscribe((response) => {
            if (response.status === ApiCode.SUCCESS) {
                this.notifications = this.notifications.map((n) => ({ ...n, read: true }));
                this.notificationService.markAllReadLocally();
            } else {
                this.alertService.showError(response.message, this.ERROR);
            }
        });
    }

    public onRowClick(notification: AppNotification): void {
        this.notificationService.open(notification);
    }

    public glyphClass(notification: AppNotification): string {
        switch (this.notificationService.iconClass(notification)) {
            case 'ok': return 'glyphicon-ok';
            case 'err': return 'glyphicon-remove';
            case 'warn': return 'glyphicon-warning-sign';
            case 'task': return 'glyphicon-user';
            default: return 'glyphicon-info-sign';
        }
    }

}
