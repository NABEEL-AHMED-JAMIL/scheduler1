import { Component, OnInit } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertService, HomeService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { Options } from 'ngx-qrcode-styling';

@Component({
    selector: 'job-history-action',
    templateUrl: 'job-history-action.component.html'
})
export class JobHistoryActionComponent implements OnInit {

    public sourceJob:any;
    public sourceJobQueues:any;
    public sourceJobStatistics: any;
    public searchQMessageForm: any = '';
    public ERROR = 'Error';
    public pdfUrl: "";

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private homeService: HomeService) {
        this._activatedRoute.queryParamMap
        .subscribe(params => {
            this.weeklyHrRunningStatisticsDimensionDetail(params?.get('targetDate'),
                params?.get('targetHr'), params?.get('jobStatus'), params?.get('jobId'));
        });
    }

    ngOnInit() {
    }

    public weeklyHrRunningStatisticsDimensionDetail(targetDate:any, targetHr: any, jobStatus: any, jobId:any): void {
        this.spinnerService.show();
        this.homeService.weeklyHrRunningStatisticsDimensionDetail(targetDate, targetHr, jobStatus, jobId)
        .pipe(first())
        .subscribe((response) => {
          if(response.status === ApiCode.SUCCESS) {
            this.sourceJob = response.data?.sourceJob;
            this.pdfUrl = this.sourceJob?.pdfReportUrl
            this.sourceJobQueues = response.data?.sourceJobQueues;
            this.sourceJobStatistics = response.data?.sourceJobStatistics;
            this.spinnerService.hide();
          } else {
            this.spinnerService.hide();
            this.alertService.showError(response.message, this.ERROR);
          }
        }, (error) => {
          this.spinnerService.hide();
          this.alertService.showError(error, this.ERROR);
        });
    }

    public logsDeatilQMessage(queueData: any, index: any): any {

    }


}
