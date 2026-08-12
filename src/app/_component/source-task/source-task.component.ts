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
  // status filter -- Active/Inactive, on top of the free-text search. 'Delete' left out of
  // the options on purpose -- a deleted task is never shown at all (see filteredSourceTasks),
  // so filtering *for* Delete would always yield nothing.
  public readonly statusFilterOptions = STATUS_LIST.filter((s: any) => s.value !== 'Delete');
  public statusFilter: any = 'All';
  // source list
  public sourceTasks: SourceTask[] = [];
  // pagint
  public paging!: Paging;
  public queryCriteria!: QueryCriteria;
  // source tasktype
	public sourceTaskAction: Action | null = null;
	public sourceTaskType: SourceTaskType | null = null;

  public deleteViewSourceTask: SourceTask | null = null;
  public deleteSelectedIndex: any = null;
  public viewMode: 'table' | 'card' = 'table';
  // View mode (table/card) is remembered across reloads -- without this, refreshing
  // the page (or the in-app Refresh button re-creating this component) always fell
  // back to the 'table' default and silently threw away the user's choice.
  private readonly VIEW_MODE_STORAGE_KEY = 'sourceTaskViewMode';
  // Client-side pagination -- the API is fetched with a large limit (all rows) and
  // filtered/paged here so search + paging can stay instant and in sync.
  public readonly pageSizeOptions = [50, 100, 150, 200];
  public pageSize = 50;
  public currentPage = 1;
  // Row expand (table view) -- task payload/schema detail + linked jobs, same pattern as
  // Job List's expand panel (linked task + queue/run history). Linked jobs are only fetched
  // the first time a row is expanded, then cached per taskDetailId so re-collapsing/
  // re-expanding the same row doesn't refetch.
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
    // set the default value for query criteria
    this.queryCriteria = {
      page: 1,
      limit: 5000,
      order: 'DESC',
      columnName: 'st.task_detail_id'
    };
    this.loadSourceTaskTargetPage(this.queryCriteria);
  }

  // Filtered (search + status applied) list -- the single source of truth pagination is
  // computed from, so the page count always matches what search/filter would show.
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

  /** trackBy for both the card grid and table view -- taskDetailId is each row's stable
   * identity, so Angular can diff by it instead of default object identity and skip
   * re-rendering rows that didn't actually change. */
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
        // clamp instead of resetting to page 1 -- keeps the user's place on a
        // manual refresh, only pulling back if the list shrank under them
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
