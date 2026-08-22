import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, StorageConnectionService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    isFtpProvider,
    StorageConnection,
    StorageProvider,
    STORAGE_PROVIDERS
} from '@/_models/storage-connection.model';

@Component({
    selector: 'storage-connection',
    templateUrl: 'storage-connection.component.html'
})
export class StorageConnectionComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public connections: StorageConnection[] = [];
    public providers = STORAGE_PROVIDERS;
    public searchConnection: any = '';
    public filterProvider = '';

    public connectionForm: FormGroup;
    public submitted = false;
    public loading = false;
    public editingConnection: StorageConnection = null;
    public deleteTarget: StorageConnection = null;
    public testingId: any = null;

    @ViewChild('closeConnectionModal', { static: false })
    public closeConnectionModal: ElementRef<HTMLButtonElement>;

    constructor(
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private storageConnectionService: StorageConnectionService) {
    }

    ngOnInit(): void {
        this.fetchAllConnections();
    }

    public get f() {
        return this.connectionForm.controls;
    }

    public get selectedProvider(): StorageProvider {
        return this.connectionForm ? this.connectionForm.controls.provider.value : null;
    }

    public get isFtp(): boolean {
        return isFtpProvider(this.selectedProvider);
    }

    public get isFtps(): boolean {
        return this.selectedProvider === 'FTPS';
    }

    public get isAzure(): boolean {
        return this.selectedProvider === 'AZURE';
    }

    public get isS3(): boolean {
        return this.selectedProvider === 'S3';
    }

    public get isMinio(): boolean {
        return this.selectedProvider === 'MINIO';
    }

    public get isFtpFamily(): boolean {
        return this.selectedProvider === 'FTP' || this.selectedProvider === 'FTPS';
    }

    public discoveredBuckets: string[] = [];
    public discoveringBuckets = false;
    public discoverBucketsError = '';

    /**
     * Asks the server which buckets these credentials can see, so the name can be picked
     * rather than typed. Sends the form as-is: on a new connection that carries the freshly
     * entered secret, and on an existing one the id, which the server uses to fall back to the
     * stored secret (it is never sent back to the browser to be re-submitted).
     */
    public discoverBuckets(): void {
        if (!this.connectionForm) {
            return;
        }
        this.discoveringBuckets = true;
        this.discoverBucketsError = '';
        this.storageConnectionService.discoverBuckets(this.connectionForm.getRawValue())
            .pipe(first())
            .subscribe((response) => {
                this.discoveringBuckets = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.discoveredBuckets = response.data || [];
                    if (!this.discoveredBuckets.length) {
                        this.discoverBucketsError = response.message;
                    }
                } else {
                    this.discoverBucketsError = response.message;
                }
            }, (error) => {
                this.discoveringBuckets = false;
                this.discoverBucketsError = (error && error.error && error.error.message) || 'Could not list buckets.';
            });
    }

    public clearDiscoveredBuckets(): void {
        this.discoveredBuckets = [];
        this.discoverBucketsError = '';
    }

    public get providerHint(): string {
        const match = this.providers.find((p) => p.value === this.selectedProvider);
        return match ? match.hint : '';
    }

    public get filteredConnections(): StorageConnection[] {
        const term = (this.searchConnection || '').toString().trim().toLowerCase();
        return this.connections.filter((connection) => {
            if (this.filterProvider && connection.provider !== this.filterProvider) {
                return false;
            }
            if (!term) {
                return true;
            }
            return [connection.connectionName, connection.alias, connection.bucketName, connection.host]
                .some((field) => (field || '').toLowerCase().indexOf(term) > -1);
        });
    }

    public get activeCount(): number {
        return this.connections.filter((c) => c.status === 'Active').length;
    }

    public get verifiedCount(): number {
        return this.connections.filter((c) => c.connectionStatus === 'SUCCESS').length;
    }

    public providerLabel(provider: StorageProvider): string {
        const match = this.providers.find((p) => p.value === provider);
        return match ? match.label : provider;
    }

    public isFtpConnection(connection: StorageConnection): boolean {
        return isFtpProvider(connection.provider);
    }

    /** What this connection points at, in one line -- differs per provider. */
    public targetOf(connection: StorageConnection): string {
        if (this.isFtpConnection(connection)) {
            const port = connection.port ? ':' + connection.port : '';
            return `${connection.host || '-'}${port}${connection.baseDirectory || '/'}`;
        }
        return connection.bucketName || connection.alias || '-';
    }

    public fetchAllConnections(): void {
        this.storageConnectionService.fetchAllConnections()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.connections = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => this.alertService.showError(error, this.ERROR));
    }

    public openAddConnection(): void {
        this.clearDiscoveredBuckets();
        this.editingConnection = null;
        this.submitted = false;
        this.buildForm(null);
    }

    public openEditConnection(connection: StorageConnection): void {
        this.clearDiscoveredBuckets();
        this.editingConnection = connection;
        this.submitted = false;
        this.buildForm(connection);
    }

    private buildForm(connection: StorageConnection): void {
        this.connectionForm = this.formBuilder.group({
            storageConnectionId: [connection ? connection.storageConnectionId : null],
            connectionName: [connection ? connection.connectionName : '', Validators.required],
            alias: [connection ? connection.alias : '', Validators.required],
            provider: [connection ? connection.provider : 'S3', Validators.required],
            description: [connection ? connection.description : ''],
            bucketName: [connection ? connection.bucketName : ''],
            endpoint: [connection ? connection.endpoint : ''],
            region: [connection ? connection.region : ''],
            accessKey: [connection ? connection.accessKey : ''],
            secretKey: [''],
            azureAccountName: [connection ? connection.azureAccountName : ''],
            azureConnectionString: [''],
            host: [connection ? connection.host : ''],
            port: [connection ? connection.port : null],
            username: [connection ? connection.username : ''],
            password: [''],
            baseDirectory: [connection ? connection.baseDirectory : ''],
            passiveMode: [connection ? connection.passiveMode !== false : true],
            implicitTls: [connection ? connection.implicitTls === true : false],
            status: [connection ? connection.status : 'Active']
        });
    }

    public onProviderChange(): void {
        // Default the port to whatever the newly-picked protocol normally listens on, but only
        // when the user hasn't typed one -- never overwrite a port they set deliberately.
        if (this.isFtp && !this.connectionForm.controls.port.value) {
            this.connectionForm.controls.port.setValue(this.isFtps && this.f.implicitTls.value ? 990 : 21);
        }
    }

    public onImplicitTlsChange(): void {
        const port = this.connectionForm.controls.port.value;
        if (port === 21 || port === 990 || !port) {
            this.connectionForm.controls.port.setValue(this.f.implicitTls.value ? 990 : 21);
        }
    }

    public saveConnection(): void {
        this.submitted = true;
        if (!this.connectionForm || this.connectionForm.invalid) {
            return;
        }
        const payload: StorageConnection = { ...this.connectionForm.value };
        // Blank secrets mean "keep what's stored" on the backend, so don't send empty strings
        // that would read as an attempt to set a value.
        if (!payload.secretKey) { delete payload.secretKey; }
        if (!payload.azureConnectionString) { delete payload.azureConnectionString; }
        if (!payload.password) { delete payload.password; }

        this.loading = true;
        this.spinnerService.show();
        const request = this.editingConnection
            ? this.storageConnectionService.updateConnection(payload)
            : this.storageConnectionService.addConnection(payload);
        request.pipe(first()).subscribe((response) => {
            this.loading = false;
            this.spinnerService.hide();
            if (response.status === ApiCode.SUCCESS) {
                this.alertService.showSuccess(response.message, this.SUCCESS);
                if (this.closeConnectionModal) {
                    this.closeConnectionModal.nativeElement.click();
                }
                this.fetchAllConnections();
            } else {
                this.alertService.showError(response.message, this.ERROR);
            }
        }, (error) => {
            this.loading = false;
            this.spinnerService.hide();
            this.alertService.showError(error, this.ERROR);
        });
    }

    public testConnection(connection: StorageConnection): void {
        this.testingId = connection.storageConnectionId;
        this.storageConnectionService.testConnection(connection.storageConnectionId)
            .pipe(first())
            .subscribe((response) => {
                this.testingId = null;
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.fetchAllConnections();
            }, (error) => {
                this.testingId = null;
                this.alertService.showError(error, this.ERROR);
                this.fetchAllConnections();
            });
    }

    public confirmDeleteConnection(connection: StorageConnection): void {
        this.deleteTarget = connection;
    }

    public processDeleteConnection(): void {
        if (!this.deleteTarget) {
            return;
        }
        this.spinnerService.show();
        this.storageConnectionService.deleteConnection(this.deleteTarget.storageConnectionId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.deleteTarget = null;
                    this.fetchAllConnections();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public clearFilters(): void {
        this.searchConnection = '';
        this.filterProvider = '';
    }

    public get hasActiveFilters(): boolean {
        return !!this.searchConnection || !!this.filterProvider;
    }

}
