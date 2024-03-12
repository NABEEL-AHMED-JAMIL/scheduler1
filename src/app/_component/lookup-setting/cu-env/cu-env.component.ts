import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, EnvVarService, AuthenticationService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode } from '@/_models';
import { AuthResponse, EnvVaraible, Action } from '@/_models/index';


@Component({
    selector: 'cu-env',
    templateUrl: 'cu-env.component.html'
})
export class CUEnvComponent implements OnInit {	

    public ENV_TITLE: any = 'New Env';
	public evnForm: FormGroup;
	public currentActiveProfile: AuthResponse;
	public submitted: boolean = false;

    @Input()
	public envVaraibleAction: Action;
    @Input()
	public recivedEnvVaraible: EnvVaraible;
    @Output()
	public senderEvent: EventEmitter<Action> = new EventEmitter();
    @ViewChild('closeEnvVaraible', {static: false})
	public closeEnvVaraible: any;


	constructor(private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private envVarService: EnvVarService,
		private authenticationService: AuthenticationService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
	}

    ngOnInit() {
        if (this.envVaraibleAction) {
			if ((this.envVaraibleAction as Action) === Action.ADD) {
				this.ENV_TITLE = 'New Env';
				this.addEnvVaraibleForm();
			} else if ((this.envVaraibleAction as Action) === Action.EDIT) {
				this.ENV_TITLE = 'Edit Env';
				this.editEnvVaraibleForm(this.recivedEnvVaraible);
			} else if ((this.envVaraibleAction as Action) === Action.VIEW) {
				this.ENV_TITLE = 'View Env';
				this.editEnvVaraibleForm(this.recivedEnvVaraible);
			}
		}
    }

    public submitEnv(): void {
		if ((this.envVaraibleAction as Action) === Action.ADD) {
			this.addEnvVaraible();
		} else if ((this.envVaraibleAction as Action) === Action.EDIT) {
			this.updateEnvVaraible();
		}
    }

	public addEnvVaraibleForm(): any {
		this.spinnerService.show();
		this.evnForm = this.formBuilder.group({
			envKey: ['', Validators.required],
        });
		this.spinnerService.hide();
	}

    public editEnvVaraibleForm(envVaraible:EnvVaraible): void {
		this.spinnerService.show();
		this.evnForm = this.formBuilder.group({
			envKeyId: [envVaraible.envKeyId, Validators.required],
			envKey: [envVaraible.envKey, Validators.required]
        });
		this.spinnerService.hide();
	}

	public addEnvVaraible(): void {
		this.submitted = true;
		this.spinnerService.show();
		if (this.evnForm.invalid) {
			this.spinnerService.hide();
			return;
		}
		let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
		   ...this.evnForm.value
        }
        this.envVarService.addEnv(payload)
            .pipe(first())
			.subscribe((response: any) => {
				this.submitted = false;
                this.spinnerService.hide();
				if(response.status === ApiCode.ERROR) {
					this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
				}
                this.closeEnvVaraible.nativeElement.click();
                this.resetEvent(Action.ADD);
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
			}, (error: any) => {
				this.submitted = false;
				this.spinnerService.hide();
				this.alertService.showError(error, ApiCode.ERROR);
			});
	}

	public updateEnvVaraible(): void {
		this.submitted = true;
		this.spinnerService.show();
		if (this.evnForm.invalid) {
			this.spinnerService.hide();
			return;
		}
		let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           },
		   ...this.evnForm.value
        }
        this.envVarService.editEnv(payload)
            .pipe(first())
			.subscribe((response: any) => {
				this.submitted = false;
                this.spinnerService.hide();
				if(response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
				}
                this.closeEnvVaraible.nativeElement.click();
                this.resetEvent(Action.EDIT);
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
			}, (error: any) => {
				this.submitted = false;
				this.spinnerService.hide();
				this.alertService.showError(error, ApiCode.ERROR);
			});
	}

	// convenience getter for easy access to form fields
	get envVariable() {
		return this.evnForm.controls;
	}

	public resetEvent(action: Action): void {
		this.senderEvent.emit(action);
	}
    
}