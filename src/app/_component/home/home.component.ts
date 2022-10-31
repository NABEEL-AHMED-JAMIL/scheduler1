import { Component, OnInit } from '@angular/core';
import { ApiCode, NameValue } from '../../_models/index';
import { Router } from '@angular/router';
import { EChartOption } from 'echarts';
import { first } from 'rxjs/operators';
import { AlertService, HomeService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { Subscription } from 'rxjs';
import { DatePipe } from '@angular/common'

@Component({
  selector: 'home',
  templateUrl: 'home.component.html',
  providers: [DatePipe]
})
export class HomeComponent implements OnInit {

  public ERROR = 'Error';
  // search detail
  public searchSourceJobDetails: any = ''; 
  public sourceJobWeeklyRunningStatisticsDimensionData: any;
  public viewRunningJobDate: any;
  public jobStatusData: NameValue[] = [
    {
      value: 0,
      name: 'Active'
    },
    {
      value: 0,
      name: 'Inactive'
    },
    {
      value: 0,
      name: 'Delete'
    }
  ];
  public jobRunningData: NameValue[] = [
    {
      value: 0,
      name: 'Completed'
    },
    {
      value: 0,
      name: 'Running'
    },
    {
      value: 0,
      name: 'Failed'
    }
  ];
  private weeklyRunningJobData: NameValue[];
  // hours
  private hours: string[] = [
    '12AM', '1AM', '2AM', '3AM', '4AM', '5AM',
    '6AM', '7AM', '8AM', '9AM','10AM','11AM',
    '12PM', '1PM', '2PM', '3PM', '4PM', '5PM',
    '6PM', '7PM', '8PM', '9PM', '10PM', '11PM'
  ];

  // data pattern -> day|hr|total count
  private heatMapData: any = [[0, 0, 0]]
  .map(function (item) {
    // day|hr|total count
    return [item[1], item[0], item[2] || '-'];
  });

  public subscription!: Subscription;
  public sourceJobStatusStatistics: EChartOption;
  public sourceJobRunningStatistics: EChartOption;
  public sourceJobWeeklyRunningStatistics: EChartOption;
  public sourceJobWeeklyHrsRunningStatistics: EChartOption;
  public today_date: any;
  public last_7th_date: any;

  constructor(public datepipe: DatePipe,
    private alertService: AlertService,
    private spinnerService: SpinnerService,
    private homeService: HomeService,
    private router: Router) { }

  ngOnInit() {
    let todayDate = new Date();
    this.today_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd');
    todayDate.setDate(todayDate.getDate() - 6);
    this.last_7th_date = this.datepipe.transform(todayDate, 'yyyy-MM-dd');
    this.jobStatusStatistics();
    this.jobRunningStatistics();
    this.weeklyRunningJobStatistics();
    this.weeklyHrsRunningJobStatistics();
  }

  public jobStatusStatistics(): void {
    this.homeService.jobStatusStatistics()
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.spinnerService.hide();
          this.jobStatusData = response.data;
          this.drawJobStatusStatistics(this.jobStatusData);
        } else {
          this.drawJobStatusStatistics(this.jobStatusData);
          this.spinnerService.hide();
        }
    }, (error) => {
      this.alertService.showError(error, this.ERROR);
      this.spinnerService.hide();
    });
  }

  public drawJobStatusStatistics(dataPaload: any): void {
    this.sourceJobStatusStatistics = {
      toolbox: {
        top: '7px',
        feature: {
          myRefresh: {
              show: true,
              title: 'Refresh',
              top: '7px',
              icon: 'image://https://www.svgrepo.com/show/199951/refresh.svg',
              onclick: () => {
                this.jobStatusStatistics();
              }
          }
        }
      },
      title: {
        text: 'Job Status',
        left: 'center',
        top: '7px'
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        left: 'center',
        bottom: '2%',
      },
      series: [
        {
          name: 'Job Status',
          type: 'pie',
          radius: ['40%', '60%'],
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
            show: false
          },
          data: dataPaload
        }
      ]
    }
  }

  public jobRunningStatistics(): void {
    this.homeService.jobRunningStatistics()
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.spinnerService.hide();
          this.jobRunningData = response.data;
          this.drawJobRunningStatistics(this.jobRunningData);
        } else {
          this.drawJobRunningStatistics(this.jobRunningData);
          this.spinnerService.hide();
        }
    }, (error) => {
      this.alertService.showError(error, this.ERROR);
      this.spinnerService.hide();
    });
  }

  public drawJobRunningStatistics(dataPaload: any): void {
    this.sourceJobRunningStatistics = {
      toolbox: {
        top: '7px',
        feature: {
          myRefresh: {
              show: true,
              title: 'Refresh',
              top: '7px',
              icon: 'image://https://www.svgrepo.com/show/199951/refresh.svg',
              onclick: () => {
                this.jobRunningStatistics();
              }
          }
        }
      },
      title: {
        text: 'Running Job',
        left: 'center',
        top: '5px'
      },
      tooltip: {
        trigger: 'item'
      },
      legend: {
        left: 'center',
        bottom: '2%'
      },
      series: [
        {
          name: 'Job Statistics',
          type: 'pie',
          radius: ['0%', '60%'],
          // color: ['#00b04f', '#ff0000', '#ffbf00'],
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

  public weeklyRunningJobStatistics(): void {
    //this.spinnerService.show();
    this.homeService.weeklyRunningJobStatistics(this.last_7th_date, this.today_date)
    .pipe(first())
    .subscribe((response) => {
      if(response.status === ApiCode.SUCCESS) {
        this.spinnerService.hide();
        this.weeklyRunningJobData = response.data;
        let dayIndex = [0,0,0,0,0,0,0];
        this.weeklyRunningJobData.forEach( (element) => {
          if (element.name === 'Mon') {
            dayIndex[0] = element.value;
          } else if (element.name === 'Tue'){
            dayIndex[1] = element.value;
          } else if (element.name === 'Wed'){
            dayIndex[2] = element.value;
          } else if (element.name === 'Thu'){
            dayIndex[3] = element.value;
          } else if (element.name === 'Fri'){
            dayIndex[4] = element.value;
          } else if (element.name === 'Sat'){
            dayIndex[5] = element.value;
          } else if (element.name === 'Sun'){
            dayIndex[6] = element.value;            
          }
        });
        this.drawSourceJobWeeklyRunningStatistics(dayIndex);
      } else {
        this.drawSourceJobWeeklyRunningStatistics([0,0,0,0,0,0,0]);
        this.spinnerService.hide();
      }
    }, (error) => {
    this.alertService.showError(error, this.ERROR);
    this.spinnerService.hide();
    });
  }

  public drawSourceJobWeeklyRunningStatistics(dataPaload: any): void {
    this.sourceJobWeeklyRunningStatistics = {
      toolbox: {
        top: '7px',
        feature: {
          myRefresh: {
              show: true,
              title: 'Refresh',
              top: '7px',
              icon: 'image://https://www.svgrepo.com/show/199951/refresh.svg',
              onclick: () => {
                this.weeklyRunningJobStatistics();
              }
          }
        }
      },
      title: {
        text: 'Weekly Queue Job Statistics',
        left: 'center',
        top: '5px'
      },
      tooltip: {
        trigger: 'axis',
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: [
        {
          type: 'category',
          data: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
          axisTick: {
            alignWithLabel: true
          }
        }
      ],
      yAxis: [
        {
          type: 'value'
        }
      ],
      series: [
        {
          name: 'Jobs',
          type: 'bar',
          barWidth: '60%',
          data: dataPaload
        }
      ]
    };
  }
  
  public weeklyHrsRunningJobStatistics(): void {
    this.homeService.weeklyHrsRunningJobStatistics(this.last_7th_date, this.today_date)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.spinnerService.hide();
          this.heatMapData = response.data;
          this.drawWeeklyHrsRunningJobStatistics(
            this.heatMapData.map(function (item: any) {
              return [item.hr, item.dayCode, item.count || '-'];
          }));
          return;
        }
        this.alertService.showError(response.message, this.ERROR);
    }, (error) => {
      this.alertService.showError(error, this.ERROR);
    });
  }

  public drawWeeklyHrsRunningJobStatistics(dataPaload: any): void {
    this.sourceJobWeeklyHrsRunningStatistics = {
      toolbox: {
        top: '7px',
        feature: {
          myRefresh: {
              show: true,
              title: 'Refresh',
              top: '7px',
              icon: 'image://https://www.svgrepo.com/show/199951/refresh.svg',
              onclick: () => {
                this.weeklyHrsRunningJobStatistics();
              }
          }
        }
      },
      title: {
        text: 'Weekday Hrs Queue Job Statistics',
        left: 'center',
        top: '5px'
      },
      tooltip: {
        position: 'top'
      },
      grid: {
        height: '60%',
        top: '25%'
      },
      xAxis: {
        type: 'category',
        data: this.hours,
        splitArea: {
          show: true
        }
      },
      yAxis: {
        type: 'category',
        data: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
        splitArea: {
          show: true
        }
      },
      visualMap: [
        {
          min: 0,
          max: 2000,
          calculable: false,
          orient: 'vertical',
          left: '97%',
          top: '40',
          color: ['green', 'black' , '#8a6d3b', 'darkred'],
        }
      ],
      series: [
        {
          name: 'Daily Job Run',
          type: 'heatmap',
          data: dataPaload,
          label: {
            show: true
          },
          emphasis: {
            itemStyle: {
              shadowBlur: 10,
              shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
          }
        }
      ]
    };
  }

  public weeklyHrRunningStatisticsDimension(targetDate:any, targetHr: any): void {
    this.spinnerService.show();
    this.homeService.weeklyHrRunningStatisticsDimension(targetDate, targetHr)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.sourceJobWeeklyRunningStatisticsDimensionData = response.data;
          this.spinnerService.hide();
        } else {
          this.alertService.showError(response.message, this.ERROR);
          this.spinnerService.hide();
        }
    }, (error) => {
      this.alertService.showError(error, this.ERROR);
      this.spinnerService.hide();
    });
  }

  public viewRunningJobDateByTargetClickJobStatistics(targetDate:any, targetHr: any): void {
    this.spinnerService.show();
    this.homeService.viewRunningJobDateByTargetClickJobStatistics(targetDate, targetHr)
      .pipe(first())
      .subscribe((response) => {
        if(response.status === ApiCode.SUCCESS) {
          this.viewRunningJobDate = response.data;
          this.spinnerService.hide();
        } else {
          this.alertService.showError(response.message, this.ERROR);
          this.spinnerService.hide();
        }
    }, (error) => {
      this.alertService.showError(error, this.ERROR);
      this.spinnerService.hide();
    });
  }

  private selectMap: any;
  public onChartEvent(event: any, type: string) {
    this.searchSourceJobDetails = '';
    // fine the data from the main data with the target event
    this.selectMap = this.heatMapData.find(data=> { 
      return (data.hr == event?.data[0] && data.dayCode == event?.data[1]
        && data.count == event?.data[2]);
      });
    this.weeklyHrRunningStatisticsDimension(this.selectMap?.date, this.selectMap?.hr);
  }

  public sourceJobCountAction(sourceJob: any, type: string): any {
    this.router.navigate(['jobList/jobHistory'],
    { 
      queryParams: {
        jobId: sourceJob?.jobId,
        jobStatus: type,
        targetDate: this.selectMap?.date,
        targetHr: this.selectMap?.hr
      }
    });
  }

}

