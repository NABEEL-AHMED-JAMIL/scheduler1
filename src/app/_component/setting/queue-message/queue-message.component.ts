import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService, prettyPrint } from '@/_helpers';
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
    public selectedQMessage: any = '';
    public qMessageSearcForm!: FormGroup;
    public sourceJobRunningStatistics!: EChartOption;
    public jobStatusList: any = ['Queue', 'Start', 'Running', 'Failed', 'Completed', 'Skip', 'Interrupt'];
    public jobRunningData: NameValue[] = [
      {
        value: 0,
        name: 'Queue'
      },
      {
        value: 0,
        name: 'Start'
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
            'jobStatuses': ['Queue']
        });
        this.spinnerService.show();
        this.qMessageSearcForm = this.fb.group({
            jobQId: [],
            fromDate: [this.last_7th_date],
            toDate: [this.today_date],
            jobStatuses: ['Queue'],
            jobId: []
        });
        this.spinnerService.hide();
	}

   
    public submitQMessageFilter(): void {
      const jobQIdControl = this.qMessageSearcForm.get('jobQId');
      const fromDateControl = this.qMessageSearcForm.get('fromDate');
      const toDateControl = this.qMessageSearcForm.get('toDate');
      const jobStatusesControl = this.qMessageSearcForm.get('jobStatuses');
      const jobIdControl = this.qMessageSearcForm.get('jobId');
      let payload = {
        jobQId: jobQIdControl?.value ? jobQIdControl.value.split(',').map(Number) : null,
        fromDate: fromDateControl?.value,
        toDate: toDateControl?.value,
        jobStatuses: jobStatusesControl?.value ? [jobStatusesControl.value] : null,
        jobId: jobIdControl?.value ? jobIdControl.value.split(',').map(Number) : null
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

    public showQMessageDetail(queueData: any): void {
      this.selectedQMessage = prettyPrint(queueData?.jobStatusMessage);
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
      // keyed lowercase so the color matches regardless of the casing the API returns
      const colorByStatus: { [key: string]: string } = {
        'queue': '#0c7c8c',
        'start': '#4f46e5',
        'running': '#b5730a',
        'failed': '#c0392b',
        'completed': '#1d7a3f',
        'skip': '#1c6ea4',
        'interrupt': '#6a3bbf',
        'inflight': '#0c7c8c'
      };
      const categories = (dataPaload || []).map((d: any) => d.name);
      const values = (dataPaload || []).map((d: any) => ({
        value: d.value,
        itemStyle: { color: colorByStatus[String(d.name || '').trim().toLowerCase()] || '#4f46e5' }
      }));
      this.sourceJobRunningStatistics = {
        title: {
          text: 'Queue Status',
          left: 'center',
          top: '5px',
          textStyle: {
            fontSize: 14,
            color: '#36424d'
          }
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' }
        },
        grid: {
          left: '3%',
          right: '10%',
          bottom: '3%',
          top: '40px',
          containLabel: true
        },
        xAxis: {
          type: 'value',
          minInterval: 1,
          splitLine: { lineStyle: { color: '#eef2f4' } }
        },
        yAxis: {
          type: 'category',
          data: categories,
          axisTick: { show: false }
        },
        series: [
          {
            name: 'Queue Status',
            type: 'bar',
            barWidth: '55%',
            itemStyle: { borderRadius: [0, 4, 4, 0] },
            label: {
              show: true,
              position: 'right',
              fontWeight: 'bold',
              color: '#36424d'
            },
            data: values
          }
        ]
      };
    }
}