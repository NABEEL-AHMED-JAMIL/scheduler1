import { Component, OnInit } from '@angular/core';
import { ApiCode } from '../../_models/index';
import { Router, ActivatedRoute } from '@angular/router';
import { AlertService, HomeService } from '@/_services';
import { SpinnerService, prettyPrint } from '@/_helpers';
import { first } from 'rxjs/operators';

@Component({
  selector: 'job-history-action',
  templateUrl: 'job-history-action.component.html'
})
export class JobHistoryActionComponent implements OnInit {

  public sourceJob: any;
  public sourceJobQueues: any;
  public sourceJobStatistics: any;
  public searchQMessageForm: any = '';
  public selectedQMessage: any = '';
  public ERROR: any = 'Error';
  public homePageId: any = '';
  public pipelineId: any = '';

  constructor(private router: Router,
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

  public weeklyHrRunningStatisticsDimensionDetail(targetDate: any, targetHr: any, jobStatus: any, jobId: any): void {
    this.spinnerService.show();
    this.homeService.weeklyHrRunningStatisticsDimensionDetail(targetDate, targetHr, jobStatus, jobId)
      .pipe(first())
      .subscribe((response) => {
        if (response.status === ApiCode.SUCCESS) {
          this.sourceJob = response.data?.sourceJob;
          this.homePageId = this.sourceJob?.taskDetail?.homePageId;
          if (this.sourceJob?.taskDetail?.pipelineId) {
            this.pipelineId = '(Pipeline ID:' + this.sourceJob?.taskDetail?.pipelineId + ')';
          }
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

  public get taskTopic(): string {
    return this.parseTopicPartition().topic;
  }

  public get taskPartitions(): string {
    return this.parseTopicPartition().partitions;
  }

  // queueTopicPartition is stored as "topic=<name>&partitions=[<list>]" — parse it for display
  private parseTopicPartition(): { topic: string; partitions: string } {
    const raw = String(this.sourceJob?.taskDetail?.sourceTaskType?.queueTopicPartition || '');
    const match = raw.match(/topic=([^&]*)&partitions=\[(.*?)\]/);
    if (match) {
      return { topic: match[1] || '-', partitions: match[2] || '-' };
    }
    return { topic: raw || '-', partitions: '-' };
  }

  public showQMessageDetail(queueData: any): void {
    this.selectedQMessage = prettyPrint(queueData?.jobStatusMessage);
  }

  public logsDeatilQMessage(queueData: any, index: any): any {
    this.router.navigate(['jobList/jobLogs'],
      {
        queryParams: {
          jobId: queueData?.jobId,
          jobQueueId: queueData?.jobQueueId
        }
      });
  }


}
