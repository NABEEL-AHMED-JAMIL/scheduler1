import { Component, OnInit, ViewChild } from '@angular/core';
import { AbstractControl, FormBuilder,
    FormControl, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AlertService, AuthenticationService,
    AppUserService, LookupService
} from '@/_services';
import { LOOKUP_TYPES, ApiCode }  from '@/_models'
import { SpinnerService } from '@/_helpers';
import { AuthResponse, AppUserResponse } from '@/_models/index';

@Component({
    templateUrl: 'profile.component.html', 
})
export class ProfileComponent implements OnInit {

    @ViewChild('closebutton', { static: false })
	public closebutton: any;
    public loading: any = false;
    public submitted: any = false;
    public appUserForm: FormGroup;
    public updatePassForm: FormGroup;
    public timeZoneForm: FormGroup;
    public appUserResponse: AppUserResponse;
    public currentActiveProfile: AuthResponse;
    public SCHEDULER_TIMEZONE: LOOKUP_TYPES;
    public timeZoneList: any;

    public oldPassword = new FormControl(null, [
        (c: AbstractControl) => Validators.required(c)
      ]);
    public newPassword = new FormControl(null, [
        (c: AbstractControl) => Validators.required(c),
        Validators.pattern(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*#?&^_-]).{8,}/),
      ]);
    public confirmPassword = new FormControl(null, [
        (c: AbstractControl) => Validators.required(c),
        Validators.pattern(/(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[@$!%*#?&^_-]).{8,}/),
    ]);

    constructor(
        private router: Router,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private authenticationService: AuthenticationService,
        private appUserService: AppUserService,
        private spinnerService: SpinnerService,
        private lookupService: LookupService) {
        this.currentActiveProfile = authenticationService.currentUserByProfile;
        this.SCHEDULER_TIMEZONE = LOOKUP_TYPES.SCHEDULER_TIMEZONE;
    }

    ngOnInit() {
        this.appUserForm = this.formBuilder.group({
            appUserId: ['', Validators.required],
            firstName: ['', Validators.required],
            lastName: ['', Validators.required],
            username: ['', Validators.required],
            email: ['', Validators.required],
            parentAppUser: [''],
            role: ['', Validators.required]
        });
        
        // update pass
        this.updatePassForm = this.formBuilder.group({
            appUserId: ['', Validators.required],
            username: ['', Validators.required],
            email: ['', Validators.required],
            oldPassword: this.oldPassword,
            newPassword: this.newPassword,
            confirmPassword: this.confirmPassword
        },
        {
          validator: this.confirmedValidator('newPassword', 'confirmPassword'),
        });
        // update timezone
        this.timeZoneForm = this.formBuilder.group({
            appUserId: ['', Validators.required],
            username: ['', Validators.required],
            email: ['', Validators.required],
            timeZone: ['', Validators.required]
        });
        this.getAppUserProfile();
        this.getTimeZoneByLookupType();
    }

    public getTimeZoneByLookupType() {
        this.spinnerService.show();
        let payload = {
            lookupType: this.SCHEDULER_TIMEZONE,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.lookupService.fetchLookupByLookupType(payload)
        .pipe(first())
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.timeZoneList = response.data
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public getAppUserProfile() {
        this.spinnerService.show();
        this.appUserService.getAppUserProfile(this.currentActiveProfile.username)
        .pipe(first())
        .subscribe(
            response => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.appUserResponse = response.data;
                this.appUserForm.patchValue({
                    appUserId: this.appUserResponse.appUserId,
                    firstName: this.appUserResponse.firstName,
                    lastName: this.appUserResponse.lastName,
                    username: this.appUserResponse.username,
                    email: this.appUserResponse.email,
                    parentAppUser: this.appUserResponse?.parentAppUser?.username,
                    role: this.appUserResponse.roleResponse?.[0].roleName
                });
                this.updatePassForm.patchValue({
                    appUserId: this.appUserResponse.appUserId,
                    username: this.appUserResponse.username,
                    email: this.appUserResponse.email
                });
                this.timeZoneForm.patchValue({
                    appUserId: this.appUserResponse.appUserId,
                    username: this.appUserResponse.username,
                    email: this.appUserResponse.email,
                    timeZone: this.appUserResponse.timeZone
                });
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });        
    }

    public updateAppUserProfile() {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.appUserForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        this.appUserService.updateAppUserProfile(this.appUserForm.value)
        .pipe(first())
        .subscribe(
            response => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.appUserResponse.firstName = response.data.firstName;
                this.appUserResponse.lastName = response.data.lastName;
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            },
            error => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });

    }

    public updateAppUserPassword() {
        this.spinnerService.show();
        // stop here if form is invalid
        if (this.updatePassForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        this.appUserService.updateAppUserPassword(this.updatePassForm.value)
        .pipe(first())
        .subscribe(
            response => {
                this.loading = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.logoutAppUser();
            },
            error => {
                this.loading = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public updateAppUserTimeZone() {
    }

    public closeAppUserAccount() {
		this.spinnerService.show();
		this.appUserService.closeAppUserAccount(this.appUserResponse)
		.pipe(first())
		.subscribe((response) => {
            this.spinnerService.hide();
            this.closebutton.nativeElement.click();
			if(response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
			}
            this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
            // logout the account
            this.logoutAppUser();
		}, (error) => {
			this.spinnerService.hide();
			this.alertService.showError(error, ApiCode.ERROR);
		});
    }

    public logoutAppUser() {
        this.authenticationService.logout()
        .pipe(first())
        .subscribe(
            data => {
                this.spinnerService.hide();
                if (data.status === ApiCode.ERROR) {
                    this.alertService.showError(data.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess('Logout successfully', ApiCode.SUCCESS);
                this.router.navigate(['/login']);
            },
            error => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    // convenience getter for easy access to form fields
    get appUserF() {
        return this.appUserForm.controls;
    }

    get updatePassF() {
        return this.updatePassForm.controls;
    }

    public hasAccess(roleList: any) {
        return this.currentActiveProfile.roles.some(r=> roleList.includes(r));
    }

    public confirmedValidator(controlName: string, matchingControlName: string) {
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

}