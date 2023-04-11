import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { first } from 'rxjs/operators';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';

@Component({
  selector: 'search-engine',
  templateUrl: 'search-engine.component.html'
})
export class SearchEngineComponent implements OnInit {
    
    public searchDetails: any = ''; 
    public jsonPayload: any;
    public tableQueryForm: FormGroup;
    
    constructor(
        private fb: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private settingService: SettingService) {
    }
    
    ngOnInit() {
        this.tableQueryFormInit();
    }

    public tableQueryFormInit(): any {
        this.jsonPayload = null;
        this.spinnerService.show();
        this.tableQueryForm = this.fb.group({
            query: ['', Validators.required],
        });
        this.spinnerService.hide();
	}

    public dynamicQueryResponse(): void {
        this.spinnerService.show();
        if (this.tableQueryForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.jsonPayload = null;
        this.settingService.dynamicQueryResponse(this.tableQueryForm.value)
            .pipe(first())
            .subscribe((response) => {
                if(response.status === ApiCode.SUCCESS) {
                    this.jsonPayload = response.data;
                    this.spinnerService.hide();
                } else {
                    this.spinnerService.hide();
                    this.alertService.showError(response.message, 'Error');
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, 'Error');
            });
    }

}
