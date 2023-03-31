import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, SettingService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode } from '@/_models';
import { LookupData, Action } from '@/_models/index';

@Component({
    selector: 'look-up',
    templateUrl: 'lookup.component.html'
})
export class LookupComponent implements OnInit {	

	public ERROR: string = 'Error';
    public submitted: boolean = false;
	public LOOKUP_DATE_ADDED: any = 'LookupData Added';
	public LOOKUP_DATE_UPDATE: any = 'LookupData Update';
    public LOOKUP_DATA_TITLE: any = 'New LookupData';
	public lookupDataForm: FormGroup;

	@Input()
	public lookUpAction: Action;
	@Input()
	public recivedLookupData: LookupData;
	@Output()
	public senderEvent: EventEmitter<Action> = new EventEmitter();
	@ViewChild('closeLookupData', {static: false})
	public closeLookupData;

	constructor(private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private settingService: SettingService) {
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
		this.spinnerService.show();
		if (this.lookupDataForm.invalid) {
			this.spinnerService.hide();
			return;
		}
        this.settingService.addLookupData(this.lookupDataForm.value)
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.closeLookupData.nativeElement.click();
					this.resetEvent(Action.ADD);
					this.alertService.showSuccess(response.message, this.LOOKUP_DATE_ADDED);
				} else {
					this.spinnerService.hide();
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.spinnerService.hide();
				this.alertService.showError(error, this.ERROR);
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
		this.spinnerService.show();
		if (this.lookupDataForm.invalid) {
			this.spinnerService.hide();
			return;
		}
        this.settingService.updateLookupData(this.lookupDataForm.value)
            .pipe(first())
			.subscribe((response) => {
				if(response.status === ApiCode.SUCCESS) {
					this.spinnerService.hide();
					this.closeLookupData.nativeElement.click();
					this.resetEvent(Action.EDIT);
					this.alertService.showSuccess(response.message, this.LOOKUP_DATE_UPDATE);
				} else {
					this.spinnerService.hide();
					this.alertService.showError(response.message, this.ERROR);
				}
			}, (error) => {
				this.spinnerService.hide();
				this.alertService.showError(error, this.ERROR);
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