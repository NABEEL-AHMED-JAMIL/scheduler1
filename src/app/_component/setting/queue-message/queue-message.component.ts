import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { QMessage } from '@/_models/index';
import { first } from 'rxjs/operators';
import { EChartOption } from 'echarts';
import { ApiCode, NameValue } from '@/_models';
import { DatePipe } from '@angular/common';


@Component({
  selector: 'queue-message',
  templateUrl: 'queue-message.component.html',
  providers: [DatePipe]
})
export class QueueMessageComponent implements OnInit {

    public ERROR: string = 'Error';
    public searchQMessageForm: any = '';
    public qMessageSearcForm: FormGroup;
    public sourceJobRunningStatistics: EChartOption;
    public jobStatusList: any = ['Queue', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt'];
    public jobRunningData: NameValue[] = [
      {
        value: 0,
        name: 'Queue'
      },
      {
        value: 0,
        name: 'Running'
      },
      {
        value: 0,
        name: 'Failed'
      },
      {
        value: 0,
        name: 'Completed'
      },
      {
        value: 0,
        name: 'Skip'
      },
      {
        value: 0,
        name: 'Interrupt'
      }
    ];
  public queueDatas: QMessage[] = [];
  public today_date: any;
  public last_7th_date: any;

	constructor(
      private fb: FormBuilder,
      public datepipe: DatePipe,
      private alertService: AlertService,
      private spinnerService: SpinnerService,
      private settingService: SettingService) {
	}

    ngOnInit() {
      let todayDate = new Date();
      this.today_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd');
      todayDate.setDate(todayDate.getDate() - 6);
      this.last_7th_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd');
      this.addQMessageFormInit();
    }

    public addQMessageFormInit(): any {
        this.fetchLogs({
            'fromDate': this.last_7th_date,
            'toDate': this.today_date,
            'jobStatuses': []
        });
        this.spinnerService.show();
        this.qMessageSearcForm = this.fb.group({
            jobQId: [],
            fromDate: [this.last_7th_date],
            toDate: [this.today_date],
            jobStatuses: [],
            jobId: []
        });
        this.spinnerService.hide();
	}

   
    public submitQMessageFilter(): void {
      let payload = {
        jobQId: this.qMessageSearcForm.get('jobQId').value ? this.qMessageSearcForm.get('jobQId').value.split(',').map(Number) : null,
        fromDate: this.qMessageSearcForm.get('fromDate').value,
        toDate: this.qMessageSearcForm.get('toDate').value,
        jobStatuses: this.qMessageSearcForm.get('jobStatuses').value ? [this.qMessageSearcForm.get('jobStatuses').value] : null,
        jobId: this.qMessageSearcForm.get('jobId').value ? this.qMessageSearcForm.get('jobId').value.split(',').map(Number) : null
      }
      this.fetchLogs(payload);
    }

    public fetchLogs(payload: any): void {
      this.spinnerService.show();
      this.settingService.fetchLogs(payload)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.spinnerService.hide();
          this.queueDatas = response.data.sourceJobQueues;
          if (response.data.jobStatusStatistic) {
              this.drawJobRunningStatistics(response.data.jobStatusStatistic);
          } else {
              this.drawJobRunningStatistics(this.jobRunningData);
          }
        } else {
          this.spinnerService.hide();
          this.alertService.showError(response.message, this.ERROR);
        }
      }, (error) => {
        this.spinnerService.hide();
        this.alertService.showError(error, this.ERROR);
      });
    }

    public deleteQMessage(queueData: any, index: any) {
      this.spinnerService.show();
      this.settingService.failJobLogs(queueData?.jobQueueId)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.submitQMessageFilter();
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

    public interruptQMessage(queueData: any, index: any) {
      this.spinnerService.show();
      this.settingService.interruptJobLogs(queueData?.jobQueueId)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.submitQMessageFilter();
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

    public drawJobRunningStatistics(dataPaload: any): void {
      this.sourceJobRunningStatistics = {
        toolbox: {
          top: '7px',
          feature: {}
        },
        title: {
          text: 'Running Job',
          left: 'center',
          top: '5px'
        },
        tooltip: {
          trigger: 'item'
        },
        series: [
          {
            name: 'Job Statistics',
            type: 'pie',
            top: '30px',
            radius: ['0%', '90%'],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 10,
              borderColor: '#fff',
              borderWidth: 1
            },
            label: {
              show: false,
              position: 'center'
            },
            emphasis: {
              label: {
                show: false,
                fontSize: 40,
                fontWeight: 'bold'
              }
            },
            labelLine: {
              show: true
            },
            data: dataPaload
          }
        ]
      };
    }
}