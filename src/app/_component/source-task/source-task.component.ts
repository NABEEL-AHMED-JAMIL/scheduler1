import { Component, OnInit, ViewChild } from '@angular/core';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action } from '@/_models';
import { Paging, QueryCriteria, SourceTaskType, SourceTask } from '@/_models/index';
import { SourceTaskService, AlertService, CommomService } from '@/_services/index';

@Component({
  selector: 'source-task',
  templateUrl: 'source-task.component.html',
})
export class SourceTaskComponent implements OnInit {

	@ViewChild('closebutton', {static: false})
	public closebutton;
  public file: File;
  public ERROR = 'Error';
  public SOURCE_TASK_DETAIL_FETCH = 'SourceTask Fetch';
  public DELETE_SOURCE_TASK = "Source Task Delete";
  // search detail
  public searchSourceTaskDetails: any = ''; 
  // source list
  public sourceTasks: SourceTask[] = [];
  // pagint
  public paging: Paging;
  public queryCriteria: QueryCriteria;
  // source tasktype
	public sourceTaskAction: Action;
	public sourceTaskType: SourceTaskType;
  // taskDetail
  public viewSourceTask: SourceTask;

  public deleteViewSourceTask: SourceTask;
  public deleteSelectedIndex: any
  
  constructor(private commomService: CommomService,
    private alertService: AlertService,
    private spinnerService: SpinnerService,
    private sourceTaskService: SourceTaskService) {
  }

  ngOnInit() {
    // set the default value for query criteria
    this.queryCriteria = {
      page: 1,
      limit: 5000,
      order: 'DESC',
      columnName: 'st.task_detail_id'
    };
    this.loadSourceTaskTargetPage(this.queryCriteria);
  }

  private loadSourceTaskTargetPage(queryCriteria: QueryCriteria): void {
    this.listSourceTask(queryCriteria);
  }

  public refreshSourceTask(): void {
    this.listSourceTask(this.queryCriteria);
  }

  public listSourceTask(queryCriteria:QueryCriteria): void {
    this.spinnerService.show();
    this.sourceTaskService
    .listSourceTask(queryCriteria)
    .pipe(first())
    .subscribe((response) => {
      if(response.status === ApiCode.SUCCESS) {
        this.sourceTasks = response.data;
        this.paging = response.paging;
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

  public viewSourceTaskType(sourceTaskType:SourceTaskType): void {
    this.spinnerService.show();
    this.sourceTaskAction = Action.VIEW;
    this.sourceTaskType = sourceTaskType;
    this.spinnerService.hide();
  }

  public viewLinkJobWithSourceTask(viewSourceTask: SourceTask): void {
    this.spinnerService.show();
    this.viewSourceTask = viewSourceTask;
    this.spinnerService.hide();
  }

  public deleteSourceTask(viewSourceTask: SourceTask, selectedIndex: any): void {
    this.deleteViewSourceTask = viewSourceTask;
    this.deleteSelectedIndex = selectedIndex;
  }

  public processDeleteSourceTask(): void {
    this.spinnerService.show();
    this.sourceTaskService
    .deleteSourceTask(this.deleteViewSourceTask)
    .pipe(first())
    .subscribe((response) => {
      if(response.status === ApiCode.SUCCESS) {
        this.spinnerService.hide();
        this.deleteViewSourceTask.taskStatus = 'Delete';
        this.sourceTasks[this.deleteSelectedIndex] = this.deleteViewSourceTask;
        this.alertService.showSuccess(response.message, this.DELETE_SOURCE_TASK);
        this.closebutton.nativeElement.click();
        this.deleteViewSourceTask = null;
        this.deleteSelectedIndex = null;
      } else {
        this.spinnerService.hide();
        this.alertService.showError(response.message, this.ERROR);
      }
    }, (error) => {
      this.spinnerService.hide();
      this.alertService.showError(error, this.ERROR);
    });
  }

  public downloadSourceTask(sourceTask: SourceTask): void {
    this.spinnerService.show();
    this.commomService.createFile(sourceTask);
    this.spinnerService.hide();
  }

  public resetEvent(action:Action): void {
		this.sourceTaskAction = null;
    this.viewSourceTask = null;
	}

}
