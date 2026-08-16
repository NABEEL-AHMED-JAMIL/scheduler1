import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, KafkaConnectionProfileService, AuthService, StorageService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, BucketSummary } from '@/_models';
import {
    KafkaConnectionProfile,
    KAFKA_SECURITY_PROTOCOLS,
    KAFKA_SASL_MECHANISMS,
    isSaslProtocol,
    isSslProtocol
} from '@/_models/kafka-connection-profile.model';

const SSL_SECRET_PREFIX = 'kafka-secrets/';

@Component({
    selector: 'kafka-connection-profile',
    templateUrl: 'kafka-connection-profile.component.html'
})
export class KafkaConnectionProfileComponent implements OnInit {

    @ViewChild('closeProfileModal', {static: false})
    public closeProfileModal: any;
    @ViewChild('closeDeleteProfileModal', {static: false})
    public closeDeleteProfileModal: any;

    public ERROR: string = 'Error';
    public SUCCESS: string = 'Success';
    public searchProfile: any = '';

    public profiles: KafkaConnectionProfile[] = [];
    public securityProtocolList: string[] = KAFKA_SECURITY_PROTOCOLS;
    public saslMechanismList: string[] = KAFKA_SASL_MECHANISMS;
    public isSaslProtocol = isSaslProtocol;
    public isSslProtocol = isSslProtocol;
    public readonly isPlatformAdmin: boolean;

    public readonly statusOptions = ['Active', 'Inactive'];
    public filterScope: string = '';
    public filterSecurityProtocol: string = '';
    public filterStatus: string = '';

    public profileForm: FormGroup;
    public editingProfile: KafkaConnectionProfile;
    public submitted: boolean = false;

    public testingInModal: boolean = false;
    public modalTestResult: { success: boolean; message: string } = null;

    public testingRowId: any = null;

    public deleteProfileId: any;

    public buckets: BucketSummary[] = [];
    public keystoreFile: File = null;
    public truststoreFile: File = null;
    public uploadingKeystore: boolean = false;
    public uploadingTruststore: boolean = false;

    public showProtocolHelp: boolean = false;
    public showSaslHelp: boolean = false;
    public showSslHelp: boolean = false;

    public toggleProtocolHelp(): void {
        this.showProtocolHelp = !this.showProtocolHelp;
    }

    public toggleSaslHelp(): void {
        this.showSaslHelp = !this.showSaslHelp;
    }

    public toggleSslHelp(): void {
        this.showSslHelp = !this.showSslHelp;
    }

    constructor(
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private kafkaConnectionProfileService: KafkaConnectionProfileService,
        private storageService: StorageService,
        private authService: AuthService) {
        this.isPlatformAdmin = this.authService.currentUser?.userRole === 'PLATFORM_ADMIN';
    }

    public canManage(profile: KafkaConnectionProfile): boolean {
        if (this.isPlatformAdmin) {
            return true;
        }
        return !!profile.tenantId && profile.tenantId === this.authService.currentUser?.tenantId;
    }

    ngOnInit(): void {
        this.fetchAllProfiles();
        this.resetProfileForm();
        this.loadBuckets();
    }

    private loadBuckets(): void {
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                }
            }, () => { /* non-critical -- bucket picker just stays empty */ });
    }

    public onKeystoreFileSelected(event: any): void {
        this.keystoreFile = event && event.target && event.target.files ? event.target.files[0] : null;
    }

    public onTruststoreFileSelected(event: any): void {
        this.truststoreFile = event && event.target && event.target.files ? event.target.files[0] : null;
    }

    public uploadKeystore(): void {
        if (!this.f.sslKeystoreBucket.value) {
            this.alertService.showError('Choose a bucket first.', this.ERROR);
            return;
        }
        if (!this.keystoreFile) {
            this.alertService.showError('Choose a keystore file first.', this.ERROR);
            return;
        }
        this.uploadingKeystore = true;
        const prefix = SSL_SECRET_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '/';
        this.storageService.uploadObject(this.f.sslKeystoreBucket.value, prefix, this.keystoreFile)
            .pipe(first())
            .subscribe((response) => {
                this.uploadingKeystore = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.f.sslKeystoreLocation.setValue(prefix + this.keystoreFile.name);
                this.alertService.showSuccess('Keystore uploaded.', this.SUCCESS);
            }, (error) => {
                this.uploadingKeystore = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public uploadTruststore(): void {
        if (!this.f.sslTruststoreBucket.value) {
            this.alertService.showError('Choose a bucket first.', this.ERROR);
            return;
        }
        if (!this.truststoreFile) {
            this.alertService.showError('Choose a truststore file first.', this.ERROR);
            return;
        }
        this.uploadingTruststore = true;
        const prefix = SSL_SECRET_PREFIX + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '/';
        this.storageService.uploadObject(this.f.sslTruststoreBucket.value, prefix, this.truststoreFile)
            .pipe(first())
            .subscribe((response) => {
                this.uploadingTruststore = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.f.sslTruststoreLocation.setValue(prefix + this.truststoreFile.name);
                this.alertService.showSuccess('Truststore uploaded.', this.SUCCESS);
            }, (error) => {
                this.uploadingTruststore = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    get f() {
        return this.profileForm.controls;
    }

    public get availableSecurityProtocols(): string[] {
        return Array.from(new Set(this.profiles
            .filter((p) => p.status !== 'Delete')
            .map((p) => p.securityProtocol)
            .filter((p) => !!p))).sort();
    }

    public get filteredProfiles(): KafkaConnectionProfile[] {
        return this.profiles.filter((profile) =>
            profile.status !== 'Delete'
            && (!this.filterScope || (this.filterScope === 'Platform' ? !profile.tenantId : !!profile.tenantId))
            && (!this.filterSecurityProtocol || profile.securityProtocol === this.filterSecurityProtocol)
            && (!this.filterStatus || profile.status === this.filterStatus));
    }

    public get hasActiveFilters(): boolean {
        return !!(this.filterScope || this.filterSecurityProtocol || this.filterStatus || this.searchProfile);
    }

    public clearFilters(): void {
        this.filterScope = '';
        this.filterSecurityProtocol = '';
        this.filterStatus = '';
        this.searchProfile = '';
    }

    public fetchAllProfiles(): void {
        this.spinnerService.show();
        this.kafkaConnectionProfileService.fetchAllProfiles()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.profiles = response.data || [];
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    private resetProfileForm(): void {
        this.submitted = false;
        this.editingProfile = null;
        this.modalTestResult = null;
        this.keystoreFile = null;
        this.truststoreFile = null;
        this.showProtocolHelp = false;
        this.showSaslHelp = false;
        this.showSslHelp = false;
        this.profileForm = this.formBuilder.group({
            profileName: ['', Validators.required],
            environmentLabel: [''],
            bootstrapServers: ['', Validators.required],
            securityProtocol: ['PLAINTEXT', Validators.required],
            saslMechanism: [''],
            saslUsername: [''],
            saslPassword: [''],
            sslKeystoreBucket: [''],
            sslKeystoreLocation: [''],
            sslKeystorePassword: [''],
            sslKeyPassword: [''],
            sslTruststoreBucket: [''],
            sslTruststoreLocation: [''],
            sslTruststorePassword: [''],
            additionalProperties: ['']
        });
    }

    public openAddProfile(): void {
        this.resetProfileForm();
    }

    public openEditProfile(profile: KafkaConnectionProfile): void {
        this.editingProfile = profile;
        this.submitted = false;
        this.modalTestResult = null;
        this.keystoreFile = null;
        this.truststoreFile = null;
        this.showProtocolHelp = false;
        this.showSaslHelp = false;
        this.showSslHelp = false;
        this.profileForm = this.formBuilder.group({
            profileName: [profile.profileName, Validators.required],
            environmentLabel: [profile.environmentLabel || ''],
            bootstrapServers: [profile.bootstrapServers, Validators.required],
            securityProtocol: [profile.securityProtocol, Validators.required],
            saslMechanism: [profile.saslMechanism || ''],
            saslUsername: [profile.saslUsername || ''],
            saslPassword: [''],
            sslKeystoreBucket: [profile.sslKeystoreBucket || ''],
            sslKeystoreLocation: [profile.sslKeystoreLocation || ''],
            sslKeystorePassword: [''],
            sslKeyPassword: [''],
            sslTruststoreBucket: [profile.sslTruststoreBucket || ''],
            sslTruststoreLocation: [profile.sslTruststoreLocation || ''],
            sslTruststorePassword: [''],
            additionalProperties: [profile.additionalProperties || ''],
            status: [profile.status]
        });
    }

    public testConnectionInModal(): void {
        if (this.profileForm.invalid) {
            this.submitted = true;
            return;
        }
        this.testingInModal = true;
        this.modalTestResult = null;
        const payload: KafkaConnectionProfile = { ...this.profileForm.value };
        if (this.editingProfile) {
            payload.kafkaConnectionProfileId = this.editingProfile.kafkaConnectionProfileId;
        }
        this.kafkaConnectionProfileService.testConnection(payload)
            .pipe(first())
            .subscribe((response) => {
                this.testingInModal = false;
                this.modalTestResult = { success: response.status === ApiCode.SUCCESS, message: response.message };
            }, (error) => {
                this.testingInModal = false;
                this.modalTestResult = { success: false, message: error };
            });
    }

    public testConnectionForRow(profile: KafkaConnectionProfile): void {
        this.testingRowId = profile.kafkaConnectionProfileId;
        this.kafkaConnectionProfileService.testConnection({ kafkaConnectionProfileId: profile.kafkaConnectionProfileId })
            .pipe(first())
            .subscribe((response) => {
                this.testingRowId = null;
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.fetchAllProfiles();
            }, (error) => {
                this.testingRowId = null;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public saveProfile(): void {
        this.submitted = true;
        if (this.profileForm.invalid) {
            return;
        }
        if (isSaslProtocol(this.f.securityProtocol.value) &&
            (!this.f.saslMechanism.value || !this.f.saslUsername.value)) {
            this.alertService.showError('SASL mechanism and username are required for this security protocol.', this.ERROR);
            return;
        }
        if (isSslProtocol(this.f.securityProtocol.value) && !this.f.sslTruststoreLocation.value) {
            this.alertService.showError('A truststore location is required for this security protocol.', this.ERROR);
            return;
        }
        this.spinnerService.show();
        const payload: KafkaConnectionProfile = { ...this.profileForm.value };
        if (!payload.saslPassword) {
            delete payload.saslPassword;
        }
        if (!payload.sslKeystorePassword) {
            delete payload.sslKeystorePassword;
        }
        if (!payload.sslKeyPassword) {
            delete payload.sslKeyPassword;
        }
        if (!payload.sslTruststorePassword) {
            delete payload.sslTruststorePassword;
        }
        if (this.editingProfile) {
            payload.kafkaConnectionProfileId = this.editingProfile.kafkaConnectionProfileId;
            this.kafkaConnectionProfileService.updateProfile(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.spinnerService.hide();
                    if (response.status !== ApiCode.SUCCESS) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.fetchAllProfiles();
                    this.closeProfileModal.nativeElement.click();
                }, (error) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        } else {
            this.kafkaConnectionProfileService.addProfile(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.spinnerService.hide();
                    if (response.status !== ApiCode.SUCCESS) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.fetchAllProfiles();
                    this.closeProfileModal.nativeElement.click();
                }, (error) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        }
    }

    public setAsDefault(profile: KafkaConnectionProfile): void {
        this.spinnerService.show();
        this.kafkaConnectionProfileService.setAsDefault(profile.kafkaConnectionProfileId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllProfiles();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public clearDefault(): void {
        this.spinnerService.show();
        this.kafkaConnectionProfileService.clearDefault()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllProfiles();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public confirmDeleteProfile(profile: KafkaConnectionProfile): void {
        this.deleteProfileId = profile.kafkaConnectionProfileId;
    }

    public processDeleteProfile(): void {
        this.spinnerService.show();
        this.kafkaConnectionProfileService.deleteProfile(this.deleteProfileId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                const realIndex = this.profiles.findIndex((p) => p.kafkaConnectionProfileId === this.deleteProfileId);
                if (realIndex > -1) {
                    this.profiles.splice(realIndex, 1);
                }
                this.closeDeleteProfileModal.nativeElement.click();
                this.deleteProfileId = null;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

}
