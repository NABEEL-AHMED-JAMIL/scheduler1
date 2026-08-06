import { Component, OnInit, ViewChild } from '@angular/core';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action } from '@/_models';
import {
  Paging,
  QueryCriteria,
  SourceTaskType,
  SourceTask
} from '@/_models/index';
import {
  SourceTaskService,
  AlertService,
  CommomService
} from '@/_services/index';

/**
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'source-task',
  templateUrl: 'source-task.component.html',
})
export class SourceTaskComponent implements OnInit {

	@ViewChild('closebutton', {static: false})
	public closebutton!: any;
  public file: File | null = null;
  public ERROR = 'Error';
  public SOURCE_TASK_DETAIL_FETCH = 'SourceTask Fetch';
  public DELETE_SOURCE_TASK = "Source Task Delete";
  // search detail
  public searchSourceTaskDetails: any = ''; 
  // source list
  public sourceTasks: SourceTask[] = [];
  // pagint
  public paging!: Paging;
  public queryCriteria!: QueryCriteria;
  // source tasktype
	public sourceTaskAction: Action | null = null;
	public sourceTaskType: SourceTaskType | null = null;
  // taskDetail
  public viewSourceTask: SourceTask | null = null;

  public deleteViewSourceTask: SourceTask | null = null;
  public deleteSelectedIndex: any = null;
  public viewMode: 'table' | 'card' = 'table';


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

  public setViewMode(mode: 'table' | 'card'): void {
    this.viewMode = mode;
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

  public cloneSourceTask(sourceTask: SourceTask, selectedIndex: any): void {
    this.spinnerService.show();
    this.sourceTaskService.fetchSourceTaskWithSourceTaskId(sourceTask.taskDetailId)
      .pipe(first())
      .subscribe((response) => {
        if (response.status !== ApiCode.SUCCESS) {
          this.spinnerService.hide();
          this.alertService.showError(response.message, this.ERROR);
          return;
        }

        const task = response.data;
        const payload: any = {
          taskName: task.taskName,
          sourceTaskType: {
            sourceTaskTypeId: task?.sourceTaskType?.sourceTaskTypeId
          },
          taskPayload: task.taskPayload,
          taskStatus: task.taskStatus,
          homePageId: task.homePageId,
          pipelineId: task.pipelineId,
          xmlTagsInfo: task.xmlTagsInfo
        };

        this.sourceTaskService.addSourceTask(payload)
          .pipe(first())
          .subscribe((addResponse) => {
            this.spinnerService.hide();
            if (addResponse.status === ApiCode.SUCCESS) {
              this.alertService.showSuccess(addResponse.message, 'Clone Task');
              this.listSourceTask(this.queryCriteria);
              return;
            }
            this.alertService.showError(addResponse.message, this.ERROR);
          }, (error) => {
            this.spinnerService.hide();
            this.alertService.showError(error, this.ERROR);
          });
      }, (error) => {
        this.spinnerService.hide();
        this.alertService.showError(error, this.ERROR);
      });
  }

  public processDeleteSourceTask(): void {
    this.spinnerService.show();
    this.sourceTaskService
    .deleteSourceTask(this.deleteViewSourceTask)
    .pipe(first())
    .subscribe((response) => {
      if(response.status === ApiCode.SUCCESS) {
        this.spinnerService.hide();
        // look up the real index in the unfiltered backing array by id -- deleteSelectedIndex
        // was captured from the *ngFor over the filtered (searchFilter) view, so it doesn't
        // line up with this.sourceTasks whenever a search term is active
        const realIndex = this.sourceTasks.findIndex(
          (task) => task.taskDetailId === this.deleteViewSourceTask?.taskDetailId);
        if (realIndex > -1) {
          this.sourceTasks.splice(realIndex, 1);
        }
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
