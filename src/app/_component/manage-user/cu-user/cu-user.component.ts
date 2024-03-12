import { Component, OnInit, Input, Output, ViewChild, EventEmitter } from '@angular/core';
import { AbstractControl, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { AlertService, LookupService, AuthenticationService, AppUserService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, AppUserList, AuthResponse, Action, LOOKUP_TYPES } from '@/_models';


@Component({
	selector: 'cu-user',
	templateUrl: 'cu-user.component.html'
})
export class CUUserComponent implements OnInit {

	public USER_TITLE: any = 'New User';
	public appUserForm: FormGroup;
	public currentActiveProfile: AuthResponse;
	public submitted: boolean = false;
	public SCHEDULER_TIMEZONE: LOOKUP_TYPES;
	public schedulerTimezoneList: any;

	public password = new FormControl(null, [
		(c: AbstractControl) => Validators.required(c),
		Validators.pattern(
			/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*#?&^_-]).{8,}/
		),
	]);

	@Input()
	public userAction: Action;
	@Input()
	public recivedAppUser: AppUserList;
	@Output()
	public senderEvent: EventEmitter<Action> = new EventEmitter();
	@ViewChild('closeAppUser', { static: false })
	public closeAppUser: any;

	constructor(private formBuilder: FormBuilder,
		private alertService: AlertService,
		private spinnerService: SpinnerService,
		private lookupService: LookupService,
		private appUserService: AppUserService,
		private authenticationService: AuthenticationService) {
		this.currentActiveProfile = authenticationService.currentUserValue;
		this.SCHEDULER_TIMEZONE = LOOKUP_TYPES.SCHEDULER_TIMEZONE;
		this.getSchedulerTimeZone();
	}

	ngOnInit() {
		if (this.userAction) {
			if ((this.userAction as Action) === Action.ADD) {
				this.USER_TITLE = 'New User';
				this.addUser();
			} else if ((this.userAction as Action) === Action.EDIT) {
				this.USER_TITLE = 'Edit User';
				this.editUser(this.recivedAppUser);
			}
		}
	}

	public addUser(): any {
		this.spinnerService.show();
		this.appUserForm = this.formBuilder.group({
			firstname: ['', Validators.required],
			lastname: ['', Validators.required],
			username: ['', Validators.required],
			email: ['', [Validators.required, Validators.email]],
			timeZone: ['', Validators.required],
			password: this.password
		});
		this.spinnerService.hide();
	}

	public editUser(appUser: AppUserList): void {
		this.spinnerService.show();
		this.appUserForm = this.formBuilder.group({
			appUserId: [appUser.appUserId, Validators.required],
			firstname: [appUser.firstName, Validators.required],
			lastname: [appUser.lastName, Validators.required],
			username: [appUser.username, Validators.required],
			email: [appUser.email, [Validators.required, Validators.email]],
			timeZone: [appUser.timeZone.lookupValue, Validators.required]
		});
		this.f.username.disable();
		this.f.email.disable();
		this.spinnerService.hide();
	}

	public confirmedValidator(controlName: string, matchingControlName: string): any {
		return (formGroup: FormGroup) => {
			const control = formGroup.controls[controlName];
			const matchingControl = formGroup.controls[matchingControlName];
			if (matchingControl.errors && !matchingControl.errors.confirmedValidator) {
				return;
			}
			if (control.value !== matchingControl.value) {
				matchingControl.setErrors({ confirmedValidator: true });
			} else {
				matchingControl.setErrors(null);
			}
		};
	}

	// SCHEDULER_TIMEZONE
	public getSchedulerTimeZone(): void {
		this.spinnerService.show();
		let payload = {
			lookupType: this.SCHEDULER_TIMEZONE
		}
		this.lookupService.fetchLookupByLookupType(payload)
			.pipe(first())
			.subscribe((response: any) => {
				this.spinnerService.hide();
				if (response.status === ApiCode.ERROR) {
					this.alertService.showError(response.message, ApiCode.ERROR);
					return;
				}
				this.schedulerTimezoneList = response.data
			}, (error: any) => {
				this.spinnerService.hide();
				this.alertService.showError(error.message, ApiCode.ERROR);
			});
	}

	public submit(): void {
		this.submitted = true;
		this.spinnerService.show();
		if (this.appUserForm.invalid) {
			this.spinnerService.hide();
			return;
		}
		let payload = {
			accessUserDetail: {
				rootUser: this.hasAccess(['ROLE_MASTER_ADMIN']),
				appUserId: this.currentActiveProfile.appUserId,
				username: this.currentActiveProfile.username
			},
			...this.appUserForm.getRawValue()
		}
		this.appUserService.addEditAppUserAccount(payload)
			.pipe(first())
			.subscribe((response: any) => {
				this.submitted = false;
				this.spinnerService.hide();
				if (response.status === ApiCode.ERROR) {
					this.alertService.showError(response.message, ApiCode.ERROR);
					return;
				}
				this.closeAppUser.nativeElement.click();
				this.resetEvent(Action.EDIT);
				this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
			}, (error: any) => {
				this.submitted = false;
				this.spinnerService.hide();
				this.alertService.showError(error, ApiCode.ERROR);
			});
	}

	// convenience getter for easy access to form fields
	get f() {
		return this.appUserForm.controls;
	}

	public resetEvent(action: Action): void {
		this.senderEvent.emit(action);
	}

	public hasAccess(roleList: any): void {
		return this.currentActiveProfile.roles.some(r => roleList.includes(r));
	}

}