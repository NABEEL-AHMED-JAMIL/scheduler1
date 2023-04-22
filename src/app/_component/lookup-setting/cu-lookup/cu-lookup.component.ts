import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, LookupService, AuthenticationService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode } from '@/_models';
import { AuthResponse, LookupData, Action } from '@/_models/index';


@Component({
    selector: 'cu-lookup',
    templateUrl: 'cu-lookup.component.html'
})
export class CULookupComponent implements OnInit {	

    public LOOKUP_DATA_TITLE: any = 'New LookupData';
	public lookupDataForm: FormGroup;
	public currentActiveProfile: AuthResponse;
	public submitted: boolean = false;

	@Input()
	public lookUpAction: Action;
	@Input()
	public recivedLookupData: LookupData;
	@Output()
	public senderEvent: EventEmitter<Action> = new EventEmitter();
	@ViewChild('closeLookupData', {static: false})
	public closeLookupData: any;

	constructor(private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private lookupService: LookupService,
		private authenticationService: AuthenticationService) {
			this.currentActiveProfile = authenticationService.currentUserValue;
	}

    ngOnInit() {
		if (this.lookUpAction) {
			if ((this.lookUpAction as Action) === Action.ADD) {
				this.LOOKUP_DATA_TITLE = 'New LookupData';
				this.addSourceTaskTaypeForm();
			} else if ((this.lookUpAction as Action) === Action.EDIT) {
				this.LOOKUP_DATA_TITLE = 'Edit LookupData';
				this.editLookupData(this.recivedLookupData);
			} else if ((this.lookUpAction as Action) === Action.VIEW) {
				this.LOOKUP_DATA_TITLE = 'View LookupData';
				this.editLookupData(this.recivedLookupData);
			}
		}
    }

    public submitLookupData(): void {
		if ((this.lookUpAction as Action) === Action.ADD) {
			this.addLookupData();
		} else if ((this.lookUpAction as Action) === Action.EDIT) {
			this.updateLookupData();
		}
    }

	public addSourceTaskTaypeForm(): any {
		this.spinnerService.show();
		this.lookupDataForm = this.formBuilder.group({
			description: ['', Validators.required],
			lookupValue: ['', Validators.required],
			lookupType: ['', Validators.required],
			parentLookupId: [this.recivedLookupData ? this.recivedLookupData.lookupId: null]
        });
		this.spinnerService.hide();
	}

	public addLookupData(): void {
		this.submitted = true;
		this.spinnerService.show();
		if (this.lookupDataForm.invalid) {
			this.spinnerService.hide();
			return;
		}
		let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
		   ...this.lookupDataForm.value
        }
        this.lookupService.addLookupData(payload)
            .pipe(first())
			.subscribe((response) => {
				this.submitted = false;
                this.spinnerService.hide();
				if(response.status === ApiCode.ERROR) {
					this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
				}
                this.closeLookupData.nativeElement.click();
                this.resetEvent(Action.ADD);
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
			}, (error) => {
				this.submitted = false;
				this.spinnerService.hide();
				this.alertService.showError(error, ApiCode.ERROR);
			});
	}

	public editLookupData(lookupData:LookupData): void {
		this.spinnerService.show();
		this.lookupDataForm = this.formBuilder.group({
			lookupId: [lookupData.lookupId, Validators.required],
			description: [lookupData.description, Validators.required],
			lookupValue: [lookupData.lookupValue, Validators.required],
			lookupType: [lookupData.lookupType, Validators.required],
			parentLookupId: [lookupData?.parent?.lookupId ? lookupData?.parent?.lookupId: null]
        });
		this.spinnerService.hide();
	}

	public updateLookupData(): void {
		this.submitted = true;
		this.spinnerService.show();
		if (this.lookupDataForm.invalid) {
			this.spinnerService.hide();
			return;
		}
		let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
		   ...this.lookupDataForm.value
        }
        this.lookupService.updateLookupData(payload)
            .pipe(first())
			.subscribe((response) => {
				this.submitted = false;
                this.spinnerService.hide();
				if(response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
				}
                this.closeLookupData.nativeElement.click();
                this.resetEvent(Action.EDIT);
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
			}, (error) => {
				this.submitted = false;
				this.spinnerService.hide();
				this.alertService.showError(error, ApiCode.ERROR);
			});
	}

	// convenience getter for easy access to form fields
	get lookupData() {
		return this.lookupDataForm.controls;
	}

	public resetEvent(action: Action): void {
		this.senderEvent.emit(action);
	}
    
}