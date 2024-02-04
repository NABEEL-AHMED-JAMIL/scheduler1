import { SpinnerService } from '@/_helpers';
import { ApiCode, AuthResponse, Notifaction } from '@/_models';
import { AlertService, AuthenticationService, NotificationService } from '@/_services';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';


@Component({
    selector: 'notifaction',
    templateUrl: 'notifaction.component.html'
})
export class NotifactionComponent implements OnInit {

    public currentActiveProfile: AuthResponse;

    public searchNotifaction: any = '';
    public notifactions: Notifaction[];
    public pageOfNotifactions: Array<Notifaction>;

    public refreshButton: any;
    public topHeader: any = [];

    constructor(private route: ActivatedRoute,
        private notificationService: NotificationService,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'refresh') {
                        this.refreshButton = header;
                    }
                });
            }
        });
    }

    ngOnInit() {
        this.fetchAllNotification();
    }

    public refreshAction(): void {
        this.fetchAllNotification();
    }

    // fetch all lookup
    public fetchAllNotification(): any {
        this.spinnerService.show();
        this.notificationService.fetchAllNotification(this.currentActiveProfile.username)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            this.notifactions = response.data;
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });
    }

    public readAction(payload: any): void {
        this.spinnerService.show();
        this.notificationService.updateNotification(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            this.alertService.showSuccess(response.message, ApiCode.ERROR);
            this.fetchAllNotification();
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error, ApiCode.ERROR);
        });

    }

    public onChangePage(pageOfNotifactions: Array<any>) {
        // update current page of items
        this.pageOfNotifactions = pageOfNotifactions;
    }

}