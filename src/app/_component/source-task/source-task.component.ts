import { Component, OnInit, ViewChild } from '@angular/core';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action, STATUS_LIST } from '@/_models';
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
import { parseTopicPartition } from '../../global-config';

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

  public searchSourceTaskDetails: any = '';

  public readonly statusFilterOptions = STATUS_LIST.filter((s: any) => s.value !== 'Delete');
  public statusFilter: any = 'All';

  public sourceTasks: SourceTask[] = [];

  public paging!: Paging;
  public queryCriteria!: QueryCriteria;

	public sourceTaskAction: Action | null = null;
	public sourceTaskType: SourceTaskType | null = null;

  public deleteViewSourceTask: SourceTask | null = null;
  public deleteSelectedIndex: any = null;
  public viewMode: 'table' | 'card' = 'table';

  private readonly VIEW_MODE_STORAGE_KEY = 'sourceTaskViewMode';

  public readonly pageSizeOptions = [50, 100, 150, 200];
  public pageSize = 50;
  public currentPage = 1;

  public expandedTaskId: any = null;
  public expandedTaskJobsLoading = false;
  private expandedTaskJobsCache: { [taskDetailId: string]: any[] } = {};

  constructor(private commomService: CommomService,
    private alertService: AlertService,
    private spinnerService: SpinnerService,
    private sourceTaskService: SourceTaskService,
    private searchFilterPipe: SearchFilterPipe) {
  }

  ngOnInit() {
    const savedViewMode = localStorage.getItem(this.VIEW_MODE_STORAGE_KEY);
    if (savedViewMode === 'table' || savedViewMode === 'card') {
      this.viewMode = savedViewMode;
    }

    this.queryCriteria = {
      page: 1,
      limit: 5000,
      order: 'DESC',
      columnName: 'st.task_detail_id'
    };
    this.loadSourceTaskTargetPage(this.queryCriteria);
  }

  public get filteredSourceTasks(): SourceTask[] {
    const searched = (this.searchFilterPipe.transform(this.sourceTasks, this.searchSourceTaskDetails) || [])
      .filter((task: SourceTask) => task.taskStatus !== 'Delete');
    if (this.statusFilter === 'All') {
      return searched;
    }
    return searched.filter((task) => task.taskStatus === this.statusFilter);
  }

  public get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredSourceTasks.length / this.pageSize));
  }

  public get pagedSourceTasks(): SourceTask[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.filteredSourceTasks.slice(start, start + this.pageSize);
  }

  public trackByTaskDetailId(_index: number, sourceTask: SourceTask): any {
    return sourceTask.taskDetailId;
  }

  public onSearchChange(searchText: any): void {
    this.searchSourceTaskDetails = searchText;
    this.currentPage = 1;
  }

  public onStatusFilterChange(status: any): void {
    this.statusFilter = status;
    this.currentPage = 1;
  }

  public goToPage(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) {
      return;
    }
    this.currentPage = page;
  }

  public onPageSizeChange(size: any): void {
    this.pageSize = Number(size) || this.pageSize;
    this.currentPage = 1;
  }

  private loadSourceTaskTargetPage(queryCriteria: QueryCriteria): void {
    this.listSourceTask(queryCriteria);
  }

  public refreshSourceTask(): void {
    this.listSourceTask(this.queryCriteria);
  }

  public setViewMode(mode: 'table' | 'card'): void {
    this.viewMode = mode;
    localStorage.setItem(this.VIEW_MODE_STORAGE_KEY, mode);
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

        if (this.currentPage > this.totalPages) {
          this.currentPage = this.totalPages;
        }
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

  public get expandedTaskJobs(): any[] {
    return this.expandedTaskJobsCache[this.expandedTaskId] || [];
  }

  public copyToClipboard(text: string): void {
    navigator.clipboard.writeText(text);
  }

  public taskTopic(queueTopicPartition: any): string {
    return parseTopicPartition(queueTopicPartition).topic;
  }

  public taskPartitions(queueTopicPartition: any): string {
    return parseTopicPartition(queueTopicPartition).partitions;
  }

  public toggleExpandTask(taskDetailId: any): void {
    if (this.expandedTaskId === taskDetailId) {
      this.expandedTaskId = null;
      return;
    }
    this.expandedTaskId = taskDetailId;
    if (this.expandedTaskJobsCache[taskDetailId]) {
      return;
    }
    this.expandedTaskJobsLoading = true;
    this.sourceTaskService.fetchAllLinkJobsWithSourceTaskId(taskDetailId)
      .pipe(first())
      .subscribe((response) => {
        this.expandedTaskJobsLoading = false;
        if (response.status === ApiCode.SUCCESS) {
          this.expandedTaskJobsCache[taskDetailId] = response.data || [];
          return;
        }
        this.alertService.showError(response.message, this.ERROR);
      }, (error) => {
        this.expandedTaskJobsLoading = false;
        this.alertService.showError(error, this.ERROR);
      });
  }

  public deleteSourceTask(viewSourceTask: SourceTask, selectedIndex: any): void {
    this.deleteViewSourceTask = viewSourceTask;
    this.deleteSelectedIndex = selectedIndex;
  }

  public canCloneTask(sourceTask: SourceTask): boolean {
    return sourceTask.taskStatus !== 'Delete';
  }

  public canDeleteTask(sourceTask: SourceTask): boolean {
    return sourceTask.taskStatus !== 'Delete';
  }

  public onCloneTaskClick(sourceTask: SourceTask, selectedIndex: any): void {
    if (!this.canCloneTask(sourceTask)) {
      return;
    }
    this.cloneSourceTask(sourceTask, selectedIndex);
  }

  public onDeleteTaskClick(sourceTask: SourceTask, selectedIndex: any): void {
    if (!this.canDeleteTask(sourceTask)) {
      return;
    }
    this.deleteSourceTask(sourceTask, selectedIndex);
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

        const realIndex = this.sourceTasks.findIndex(
          (task) => task.taskDetailId === this.deleteViewSourceTask?.taskDetailId);
        if (realIndex > -1) {
          this.sourceTasks.splice(realIndex, 1);
        }
        if (this.currentPage > this.totalPages) {
          this.currentPage = this.totalPages;
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
	}

}
