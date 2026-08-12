import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, KafkaConnectionProfileService, AuthService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    KafkaConnectionProfile,
    KAFKA_SECURITY_PROTOCOLS,
    KAFKA_SASL_MECHANISMS,
    isSaslProtocol,
    isSslProtocol
} from '@/_models/kafka-connection-profile.model';

/**
 * List/add/edit/delete Kafka connection profiles (local or remote clusters) and pick which one
 * is each tenant's default -- see KafkaConnectionResolver on the backend for the full
 * resolution order (a Source Task Type's own profile, or its tenant's routing override, can
 * still take priority over this "default" pick -- see the Source Task Type form's own picker).
 * When a tenant has no default and no Source Task Type override, the platform-wide shared
 * default (if any) is used, then the original env-var-driven cluster -- this screen is purely
 * additive on top of that.
 * @author Nabeel Ahmed
 */
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
    // Dropdown filters, applied on top of (before) the free-text search box -- '' means "no
    // filter" for each. Scope only matters (and is only shown) for a Platform Admin, same
    // condition as the Scope column itself.
    // 'Delete' left out on purpose -- a deleted profile is never shown (see filteredProfiles).
    public readonly statusOptions = ['Active', 'Inactive'];
    public filterScope: string = '';
    public filterSecurityProtocol: string = '';
    public filterStatus: string = '';

    public profileForm: FormGroup;
    public editingProfile: KafkaConnectionProfile;
    public submitted: boolean = false;

    /** Set while a Test Connection call (from the modal, before Save) is in flight. */
    public testingInModal: boolean = false;
    public modalTestResult: { success: boolean; message: string } = null;

    /** Row-level "Test" button -- keyed by kafkaConnectionProfileId so only that row shows a spinner. */
    public testingRowId: any = null;

    public deleteProfileId: any;

    constructor(
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private kafkaConnectionProfileService: KafkaConnectionProfileService,
        private authService: AuthService) {
        this.isPlatformAdmin = this.authService.currentUser?.userRole === 'PLATFORM_ADMIN';
    }

    /** Whether the current user may edit/delete/set-default/clear-default this profile --
     * PLATFORM_ADMIN can manage any profile; a tenant admin only their own tenant's (never a
     * platform-wide/shared one, and fetchAllProfiles never returns another tenant's to begin
     * with). The backend (KafkaConnectionProfileServiceImpl.scopedFind) already rejects these
     * the same way -- this just keeps the UI from showing an action button that would always
     * fail with a confusing "Profile not found" instead of making clear up front why it can't
     * be used. */
    public canManage(profile: KafkaConnectionProfile): boolean {
        if (this.isPlatformAdmin) {
            return true;
        }
        return !!profile.tenantId && profile.tenantId === this.authService.currentUser?.tenantId;
    }

    ngOnInit(): void {
        this.fetchAllProfiles();
        this.resetProfileForm();
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
        this.profileForm = this.formBuilder.group({
            profileName: ['', Validators.required],
            environmentLabel: [''],
            bootstrapServers: ['', Validators.required],
            securityProtocol: ['PLAINTEXT', Validators.required],
            saslMechanism: [''],
            saslUsername: [''],
            saslPassword: [''],
            sslKeystoreLocation: [''],
            sslKeystorePassword: [''],
            sslKeyPassword: [''],
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
        this.profileForm = this.formBuilder.group({
            profileName: [profile.profileName, Validators.required],
            environmentLabel: [profile.environmentLabel || ''],
            bootstrapServers: [profile.bootstrapServers, Validators.required],
            securityProtocol: [profile.securityProtocol, Validators.required],
            saslMechanism: [profile.saslMechanism || ''],
            saslUsername: [profile.saslUsername || ''],
            saslPassword: [''],
            sslKeystoreLocation: [profile.sslKeystoreLocation || ''],
            sslKeystorePassword: [''],
            sslKeyPassword: [''],
            sslTruststoreLocation: [profile.sslTruststoreLocation || ''],
            sslTruststorePassword: [''],
            additionalProperties: [profile.additionalProperties || ''],
            status: [profile.status]
        });
    }

    /** Tests connectivity for whatever's currently in the modal form -- works before Save too
     * (an unsaved profile is tested from the form values directly). */
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

    /** Row action -- tests an already-saved profile by id, no form involved. */
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
