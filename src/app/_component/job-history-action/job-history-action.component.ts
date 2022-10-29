import { Component, OnInit, ViewChild } from '@angular/core';
import { slideInOutAnimation } from '../../_content/slide-in-out.animation';
import { SourceJobService, SourceTaskService, AlertService } from '@/_services/index';
import { Router, ActivatedRoute } from '@angular/router';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';

@Component({
    selector: 'job-history-action',
    templateUrl: 'job-history-action.component.html',
    animations: [slideInOutAnimation],
    host: {
        '[@slideInOutAnimation]': ''
    }
})
export class JobHistoryActionComponent implements OnInit {

    public jobDeatil:any;
    public jobQueueHistory:any;

    constructor(private _router: Router,
        private _activatedRoute: ActivatedRoute,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private sourceJobService: SourceJobService) {
    }

    ngOnInit() {
    }

    public backClicked(): void {
    }


}
