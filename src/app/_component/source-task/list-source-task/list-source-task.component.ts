import { AuthResponse, SourceTask } from '@/_models';
import { AuthenticationService } from '@/_services';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';


@Component({
    selector: 'list-source-task',
    templateUrl: 'list-source-task.component.html'
})
export class ListSourceTaskComponent implements OnInit {

     // source list
    public searchLookup: any = '';
    public sourceTasks: SourceTask[] = [];
    public pageOfSourceTask: Array<SourceTask>;
    public currentActiveProfile: AuthResponse;

    public addButton: any;
    public refreshButton: any;
    public topHeader: any = [];

    constructor(
        private router: Router,
        private route: ActivatedRoute,
        private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            if (this.topHeader) {
                this.topHeader.forEach((header: any) => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    }
                });
            }
        });
    }

    ngOnInit() {
    }

    public refreshAction(): void {
    }

    public addSourceTask(): void {
		this.router.navigate(['/sourceTask/addSourceTask']);
	}

    public editSubLookupData(payload: SourceTask): void {
        this.router.navigate(['/sourceTask/editSourceTask'],
            {
                queryParams: {
                    taskDetailId: payload.taskDetailId
                }
            });
    }

    public menuAction(payload: any): any {
        if (payload.targetEvent === 'downloadData') {

        }
    }

    public onChangePage(pageOfSourceTask: Array<any>) {
        this.pageOfSourceTask = pageOfSourceTask;
    }

}