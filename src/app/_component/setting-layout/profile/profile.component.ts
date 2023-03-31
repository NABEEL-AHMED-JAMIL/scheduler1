import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, AuthenticationService, AppUserService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, AppUserResponse } from '@/_models/index';

@Component({
    templateUrl: 'profile.component.html', 
})
export class ProfileComponent implements OnInit {

    public appUserForm: FormGroup;
    public updatePassForm: FormGroup;
    public timeZoneForm: FormGroup;
    public appUserResponse: AppUserResponse;
    public authResponse: AuthResponse;

    constructor(private alertService: AlertService,
        private authenticationService: AuthenticationService,
        private appUserService: AppUserService,
        private spinnerService: SpinnerService) {
        this.authResponse = authenticationService.currentUserValue;
        console.log(this.authResponse);
    }

    ngOnInit() {
        this.getAppUserProfile();
    }

    public getAppUserProfile() {

    }

    public updateAppUserProfile() {
    }

    public updateAppUserPassword() {
    }

    public updateAppUserTimeZone() {
    }

    public closeAppUserAccount() {
    }

    

}