import { Component, OnInit } from '@angular/core';
import { Location } from '@angular/common';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { ActivatedRoute } from '@angular/router';
import { AlertService, AuthenticationService,
    LookupService, CredentailService } from '@/_services';
import { LOOKUP_TYPES, ApiCode, Action, AuthResponse }  from '@/_models'
import { SpinnerService } from '@/_helpers';


@Component({
    selector: 'cu-credential',
    templateUrl: 'cu-credential.component.html'
})
export class CuCredentialComponent implements OnInit {

    public loading: any = false;
    public submitted: any = false;

    public title: any;
    public action: Action;
    public breadcrumb: any;
    public editCredentialId: any;

    public credentailForm: FormGroup;
    public currentActiveProfile: AuthResponse;

    public credentailTypeList: any;
    public statusList: any;

    public APPLICATION_STATUS: LOOKUP_TYPES;
    public CREDENTIAL_TYPE: LOOKUP_TYPES;

    constructor(
        private location: Location,
        private route: ActivatedRoute,
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private credentailService: CredentailService,
        private authenticationService: AuthenticationService,
        private spinnerService: SpinnerService,
        private lookupService: LookupService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.CREDENTIAL_TYPE = LOOKUP_TYPES.CREDENTIAL_TYPE;
        this.APPLICATION_STATUS = LOOKUP_TYPES.APPLICATION_STATUS;
        this.route.data.subscribe((data: any) => {
            this.title = data.title;
            this.action = data.action;
            this.breadcrumb = data.breadcrumb;
            if (this.action === Action.EDIT) {
                this.route.queryParams.subscribe((params: any) => {
                    this.editCredentialId = params.credentialId;
                });
            }
        });
    }

    ngOnInit() {
        this.getCredentialTypeByLookupType();
        this.getApplicationStatusByLookupType();
        if (this.action === Action.ADD) {
            this.credentailForm = this.formBuilder.group({
                credentialName: ['', Validators.required],
                credentialType: ['', Validators.required]
            });
        } else if (this.action === Action.EDIT) {
            this.fetchCredentialByCredentialId(this.editCredentialId);
        }
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.credentailForm.controls;
    }

    get cred() {
       return this.credentailForm.get('credentialContent');
    }

    public getCredentialTypeByLookupType(): void {
        this.spinnerService.show();
        let payload = {
            lookupType: this.CREDENTIAL_TYPE,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.lookupService.fetchLookupByLookupType(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.credentailTypeList = response.data
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public getApplicationStatusByLookupType(): void {
        this.spinnerService.show();
        let payload = {
            lookupType: this.APPLICATION_STATUS,
            validate: false,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.lookupService.fetchLookupByLookupType(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            this.statusList = response.data;
            this.statusList.subLookupData = this.statusList.subLookupData
            .filter(lookup => {
                return lookup.lookupValue != '2';
            });
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });
    }

    public onCredentailTypeSelected(event: any): void {
        const value = event.target.value;
        if (value === '0') {
            // BASIC_AUTH
            this.submitted = false;
            this.credentailForm.removeControl('credentialContent');
            this.addBasicAuth();
            return;
        } else if (value === '1') {
            // CERTIFICATE
            this.submitted = false;
            this.credentailForm.removeControl('credentialContent');
            this.addCertificate();
            return;
        } else if (value === '2') {
            // AUTHORIZATION_CODE
            this.submitted = false;
            this.credentailForm.removeControl('credentialContent');
            this.addAuthorizationCode();
            return;
        } else if (value === '3') {
            // AWS_AUTH
            this.submitted = false;
            this.credentailForm.removeControl('credentialContent');
            this.addAwsAuth();
            return;
        } else if (value === '4') {
            // FIREBASE
            this.submitted = false;
            this.credentailForm.removeControl('credentialContent');
            this.addFirebase();
            return;
        } else if (value === '5') {
            // FIREBASE
            this.submitted = false;
            this.credentailForm.removeControl('credentialContent');
            this.addFtp();
            return;
        }
    }

    // BASIC_AUTH
    public addBasicAuth(): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                username: ['', [Validators.required]],
                password: ['', [Validators.required]]
            }
        ));
     }

    public editBasicAuth(payload: any): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                username: [payload.username, [Validators.required]],
                password: [payload.password, [Validators.required]]
            }
        ));
    }

     // CERTIFICATE
    public addCertificate(): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                certificate: ['', [Validators.required]],
                certKey: ['', [Validators.required]],
                certKeyPassword: ['', [Validators.required]]
            }
        ));
    }

    public editCertificate(payload: any): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                certificate: [payload?.certificate, [Validators.required]],
                certKey: [payload?.certKey, [Validators.required]],
                certKeyPassword: [payload?.certKeyPassword, [Validators.required]]
            }
        ));
    }

    // AUTHORIZATION_CODE
    public addAuthorizationCode(): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                clientId: ['', [Validators.required]],
                clientSecret: ['', [Validators.required]],
                authenticationUrl: ['', [Validators.required]],
                tokenUrl: ['', [Validators.required]],
                scope: ['', [Validators.required]]
            }
        ));
    }

    public editAuthorizationCode(payload: any): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                clientId: [payload?.clientId, [Validators.required]],
                clientSecret: [payload?.clientSecret, [Validators.required]],
                authenticationUrl: [payload?.authenticationUrl, [Validators.required]],
                tokenUrl: [payload?.tokenUrl, [Validators.required]],
                scope: [payload?.scope, [Validators.required]]
            }
        ));
    }

    // AWS_AUTH
    public addAwsAuth(): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                clientId: ['', [Validators.required]],
                clientSecret: ['', [Validators.required]],
                region: [''],
                bucket: [''],
                other: ['']
            }
        ));
    }

    public editAwsAuth(payload: any): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                region: [payload?.region, [Validators.required]],
                clientId: [payload?.clientId, [Validators.required]],
                clientSecret: [payload?.clientSecret, [Validators.required]],
                bucket: [payload?.bucket],
                other: [payload?.other]
            }
        ));
    }

    // FIREBASE
    public addFirebase(): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                firePayload: ['', [Validators.required]]
            }
        ));
    }

    public editFirebase(payload: any): void {
        debugger
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                firePayload: [payload?.firePayload, [Validators.required]]
            }
        ));
    }

    // FTP
    public addFtp(): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                host: ['', [Validators.required]], // IP
                port: ['', [Validators.required]], // PORT
                user: ['', [Validators.required]], // USER
                password: ['', [Validators.required]], // PASS
                directoryPath: ['']
            }
        ));
    }

    public editFtp(payload: any): void {
        this.credentailForm.addControl('credentialContent', 
            this.formBuilder.group({
                host: [payload?.host, [Validators.required]], // IP
                port: [payload?.port, [Validators.required]], // PORT
                user: [payload?.user, [Validators.required]], // USER
                password: [payload?.password, [Validators.required]], // PASS
                directoryPath: [payload?.directoryPath]
            }
        ));
    }

    public fetchCredentialByCredentialId(editCredentialId: any): void {
        this.spinnerService.show();
        let payload = {
            credentialId: editCredentialId,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
           }
        }
        this.credentailService.fetchCredentialByCredentialId(payload)
        .pipe(first())
        .subscribe((response: any) => {
            this.spinnerService.hide();
            if (response.status === ApiCode.ERROR) {
                this.alertService.showError(response.message, ApiCode.ERROR);
                return;
            }
            response = response.data;
            this.credentailForm = this.formBuilder.group({
                credentialId: [response?.credentialId, Validators.required],
                credentialName: [response?.credentialName, Validators.required],
                credentialType: [response?.credentialType?.lookupValue, Validators.required],
                status: [response?.status?.lookupValue, [Validators.required]],
            });
            if (response?.credentialType?.lookupValue === 0) {
                this.editBasicAuth(response?.credentialContent);
            } else if (response?.credentialType?.lookupValue === 1) {
                this.editCertificate(response?.credentialContent);
            } else if (response?.credentialType?.lookupValue === 2) {
                this.editAuthorizationCode(response?.credentialContent);
            } else if (response?.credentialType?.lookupValue === 3) {
                this.editAwsAuth(response?.credentialContent);
            } else if (response?.credentialType?.lookupValue === 4) {
                this.editFirebase(response?.credentialContent);
            } else if (response?.credentialType?.lookupValue === 5) {
                this.editFtp(response?.credentialContent);
            }
        }, (error: any) => {
            this.spinnerService.hide();
            this.alertService.showError(error.message, ApiCode.ERROR);
        });

    }

    public onSubmit(): any {
        this.spinnerService.show();
        this.submitted = true;
        // stop here if form is invalid
        if (this.credentailForm.invalid) {
            this.spinnerService.hide();
            return;
        }
        this.loading = true;
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username,
           },
           ...this.credentailForm.value
        }
        if (this.action === Action.ADD) {
            this.credentailService.addCredential(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.back();
                }, (error: any) => {
                    this.loading = false;
                    this.submitted = false;
                    this.spinnerService.hide();
                    this.alertService.showError(error.message, ApiCode.ERROR);
                });
        } else if (this.action === Action.EDIT) {
            this.credentailService.updateCredential(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.back();
            }, (error: any) => {
                this.loading = false;
                this.submitted = false;
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
        }
    }

    public back(): any {
        this.location.back();
    }


}