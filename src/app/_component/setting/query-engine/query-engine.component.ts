import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, QueryEngineService, StorageService } from '@/_services';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { ApiCode } from '@/_models';
import {
    DatabaseConnectionProfile,
    QueryDefinition,
    QueryExecution,
    QuerySchedule,
    QueryPreviewResponse,
    DATABASE_TYPES
} from '@/_models/query-engine.model';

/**
 * Query Engine -- create/store a SQL query against a tenant's own database connection, validate
 * + preview it (server-bounded, never the full result set), run it (backend streams the result
 * straight to a CSV in object storage -- see QueryExecutionServiceImpl on the backend; this page
 * never receives query row data itself except the small preview sample), and optionally attach
 * a recurring schedule that reuses the exact same execution path.
 *
 * Replaces (not "extends") the old /setting/searchEngine free-text-SQL-against-the-app's-own-
 * database PLATFORM_ADMIN console -- that page is a different, intentionally separate tool and
 * is left as-is; nothing here is built on top of it. See the design review for the full
 * rationale (multi-tenant connection profiles, encrypted query storage, read-only SQL
 * validation via a real parser, streamed CSV export).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'query-engine',
    templateUrl: 'query-engine.component.html'
})
export class QueryEngineComponent implements OnInit {

    @ViewChild('closeConnectionModal', { static: false }) closeConnectionModal: any;
    @ViewChild('closeDeleteConnectionModal', { static: false }) closeDeleteConnectionModal: any;
    @ViewChild('closeQueryModal', { static: false }) closeQueryModal: any;
    @ViewChild('closeDeleteQueryModal', { static: false }) closeDeleteQueryModal: any;
    @ViewChild('closeRunModal', { static: false }) closeRunModal: any;
    @ViewChild('closeScheduleModal', { static: false }) closeScheduleModal: any;

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public activeTab: 'connections' | 'queries' | 'executions' = 'queries';

    // ---------------------------------------------------------------- connections
    public connections: DatabaseConnectionProfile[] = [];
    public searchConnection = '';
    public connectionForm: FormGroup;
    public editingConnection: DatabaseConnectionProfile;
    public connectionSubmitted = false;
    public databaseTypeList = DATABASE_TYPES;
    public testingConnection = false;
    public connectionTestResult: { success: boolean; message: string } = null;
    public deleteConnectionId: any;

    // ---------------------------------------------------------------- queries
    public queries: QueryDefinition[] = [];
    public searchQuery = '';
    public queryForm: FormGroup;
    public editingQuery: QueryDefinition;
    public querySubmitted = false;
    public validating = false;
    public validationResult: { valid: boolean; message: string } = null;
    public previewing = false;
    public previewResult: QueryPreviewResponse = null;
    public deleteQueryId: any;

    // ---------------------------------------------------------------- run / schedule
    public runForm: FormGroup;
    public runningQuery: QueryDefinition;
    public running = false;
    public buckets: any[] = [];
    public scheduleForm: FormGroup;
    public schedulingQuery: QueryDefinition;
    public schedules: QuerySchedule[] = [];

    // ---------------------------------------------------------------- executions
    public executions: QueryExecution[] = [];
    public searchExecution = '';
    public readonly executionStatusOptions = ['PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'];
    public filterExecutionStatus = '';
    // '' means "no filter" -- applied on top of (before) searchConnection above.
    public filterDatabaseType = '';

    constructor(
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private queryEngineService: QueryEngineService,
        private storageService: StorageService,
        private searchFilterPipe: SearchFilterPipe) {
    }

    ngOnInit(): void {
        this.fetchAllConnections();
        this.fetchAllQueries();
        this.fetchAllExecutions();
        this.fetchAllSchedules();
        this.loadBuckets();
        this.resetConnectionForm();
        this.resetQueryForm();
    }

    public setActiveTab(tab: 'connections' | 'queries' | 'executions'): void {
        this.activeTab = tab;
    }

    private loadBuckets(): void {
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                }
            }, () => { /* non-blocking -- bucket picker just stays empty */ });
    }

    // =================================================================== CONNECTIONS

    public fetchAllConnections(): void {
        this.spinnerService.show();
        this.queryEngineService.fetchAllConnectionProfiles()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.connections = response.data || [];
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    get cf() {
        return this.connectionForm.controls;
    }

    private resetConnectionForm(): void {
        this.connectionSubmitted = false;
        this.editingConnection = null;
        this.connectionTestResult = null;
        this.connectionForm = this.formBuilder.group({
            profileName: ['', Validators.required],
            databaseType: ['POSTGRES', Validators.required],
            host: ['', Validators.required],
            port: [5432, Validators.required],
            databaseName: ['', Validators.required],
            username: ['', Validators.required],
            password: [''],
            additionalProperties: ['']
        });
    }

    public openAddConnection(): void {
        this.resetConnectionForm();
    }

    public openEditConnection(connection: DatabaseConnectionProfile): void {
        this.editingConnection = connection;
        this.connectionSubmitted = false;
        this.connectionTestResult = null;
        this.connectionForm = this.formBuilder.group({
            profileName: [connection.profileName, Validators.required],
            databaseType: [connection.databaseType, Validators.required],
            host: [connection.host, Validators.required],
            port: [connection.port, Validators.required],
            databaseName: [connection.databaseName, Validators.required],
            username: [connection.username, Validators.required],
            password: [''],
            additionalProperties: [connection.additionalProperties || '']
        });
    }

    public testConnectionInModal(): void {
        if (this.connectionForm.invalid) {
            this.connectionSubmitted = true;
            return;
        }
        this.testingConnection = true;
        this.connectionTestResult = null;
        const payload: DatabaseConnectionProfile = { ...this.connectionForm.value };
        if (this.editingConnection) {
            payload.databaseConnectionProfileId = this.editingConnection.databaseConnectionProfileId;
        }
        this.queryEngineService.testConnection(payload)
            .pipe(first())
            .subscribe((response) => {
                this.testingConnection = false;
                this.connectionTestResult = { success: response.status === ApiCode.SUCCESS, message: response.message };
            }, (error) => {
                this.testingConnection = false;
                this.connectionTestResult = { success: false, message: error };
            });
    }

    public saveConnection(): void {
        this.connectionSubmitted = true;
        if (this.connectionForm.invalid) {
            return;
        }
        this.spinnerService.show();
        const payload: DatabaseConnectionProfile = { ...this.connectionForm.value };
        if (!payload.password) {
            delete payload.password;
        }
        const isEdit = !!this.editingConnection;
        if (isEdit) {
            payload.databaseConnectionProfileId = this.editingConnection.databaseConnectionProfileId;
        }
        const call = isEdit
            ? this.queryEngineService.updateConnectionProfile(payload)
            : this.queryEngineService.addConnectionProfile(payload);
        call.pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllConnections();
                this.closeConnectionModal.nativeElement.click();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public confirmDeleteConnection(connection: DatabaseConnectionProfile): void {
        this.deleteConnectionId = connection.databaseConnectionProfileId;
    }

    public processDeleteConnection(): void {
        this.spinnerService.show();
        this.queryEngineService.deleteConnectionProfile(this.deleteConnectionId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllConnections();
                this.closeDeleteConnectionModal.nativeElement.click();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    // =================================================================== QUERIES

    public fetchAllQueries(): void {
        this.queryEngineService.fetchAllQueries()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.queries = response.data || [];
                }
            }, (error) => this.alertService.showError(error, this.ERROR));
    }

    private fetchAllSchedules(): void {
        this.queryEngineService.fetchAllSchedules()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.schedules = response.data || [];
                }
            }, () => { /* non-blocking -- schedule pills on the query list just won't show */ });
    }

    public scheduleForQuery(query: QueryDefinition): QuerySchedule | null {
        return this.schedules.find((s) => s.queryId === query.queryId && s.status !== 'Delete') || null;
    }

    get qf() {
        return this.queryForm.controls;
    }

    private resetQueryForm(): void {
        this.querySubmitted = false;
        this.editingQuery = null;
        this.validationResult = null;
        this.previewResult = null;
        this.queryForm = this.formBuilder.group({
            queryName: ['', Validators.required],
            databaseConnectionProfileId: ['', Validators.required],
            queryText: ['', Validators.required]
        });
    }

    public openAddQuery(): void {
        this.resetQueryForm();
    }

    public openEditQuery(query: QueryDefinition): void {
        this.querySubmitted = false;
        this.validationResult = null;
        this.previewResult = null;
        this.spinnerService.show();
        this.queryEngineService.fetchQueryById(query.queryId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.editingQuery = response.data;
                this.queryForm = this.formBuilder.group({
                    queryName: [this.editingQuery.queryName, Validators.required],
                    databaseConnectionProfileId: [this.editingQuery.databaseConnectionProfileId, Validators.required],
                    queryText: [this.editingQuery.queryText, Validators.required]
                });
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    /** The click target for opening the edit modal -- data-toggle="modal" fires immediately on
     * click, before openEditQuery's async fetchQueryById resolves, so the modal itself opens
     * right away (against the *previous* queryForm/editingQuery for an instant) and repaints
     * once the response lands -- same latency-hiding tradeoff every other edit modal in this
     * app already makes (see kafka-connection-profile.component.html's own openEditProfile). */
    public onOpenEditQueryClick(query: QueryDefinition): void {
        this.openEditQuery(query);
    }

    public validateQuery(): void {
        if (!this.qf.queryText.value) {
            return;
        }
        this.validating = true;
        this.validationResult = null;
        const payload: any = this.editingQuery
            ? { queryId: this.editingQuery.queryId, queryText: this.qf.queryText.value }
            : { queryText: this.qf.queryText.value };
        this.queryEngineService.validateQuery(payload)
            .pipe(first())
            .subscribe((response) => {
                this.validating = false;
                this.validationResult = { valid: response.status === ApiCode.SUCCESS, message: response.message };
            }, (error) => {
                this.validating = false;
                this.validationResult = { valid: false, message: error };
            });
    }

    public previewQuery(): void {
        if (!this.qf.queryText.value || !this.qf.databaseConnectionProfileId.value) {
            this.alertService.showError('Select a connection and enter a query first.', this.ERROR);
            return;
        }
        this.previewing = true;
        this.previewResult = null;
        const payload: any = {
            queryText: this.qf.queryText.value,
            databaseConnectionProfileId: this.qf.databaseConnectionProfileId.value
        };
        this.queryEngineService.previewQuery(payload)
            .pipe(first())
            .subscribe((response) => {
                this.previewing = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.previewResult = response.data;
            }, (error) => {
                this.previewing = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public saveQuery(): void {
        this.querySubmitted = true;
        if (this.queryForm.invalid) {
            return;
        }
        this.spinnerService.show();
        const payload: QueryDefinition = { ...this.queryForm.value };
        const isEdit = !!this.editingQuery;
        if (isEdit) {
            payload.queryId = this.editingQuery.queryId;
            payload.version = this.editingQuery.version;
        }
        const call = isEdit ? this.queryEngineService.updateQuery(payload) : this.queryEngineService.addQuery(payload);
        call.pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllQueries();
                this.closeQueryModal.nativeElement.click();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public confirmDeleteQuery(query: QueryDefinition): void {
        this.deleteQueryId = query.queryId;
    }

    public processDeleteQuery(): void {
        this.spinnerService.show();
        this.queryEngineService.deleteQuery(this.deleteQueryId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllQueries();
                this.closeDeleteQueryModal.nativeElement.click();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    // =================================================================== RUN

    public openRunQuery(query: QueryDefinition): void {
        this.runningQuery = query;
        this.runForm = this.formBuilder.group({
            outputBucket: ['', Validators.required],
            outputPrefix: [''],
            outputFileName: [`${query.queryName.replace(/[^a-zA-Z0-9_-]+/g, '_')}_export`, Validators.required]
        });
    }

    get rf() {
        return this.runForm.controls;
    }

    public runQuery(): void {
        if (this.runForm.invalid) {
            return;
        }
        this.running = true;
        this.queryEngineService.execute({
            queryId: this.runningQuery.queryId,
            outputBucket: this.rf.outputBucket.value,
            outputPrefix: this.rf.outputPrefix.value,
            outputFileName: this.rf.outputFileName.value
        }).pipe(first())
            .subscribe((response) => {
                this.running = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllExecutions();
                this.closeRunModal.nativeElement.click();
                this.activeTab = 'executions';
            }, (error) => {
                this.running = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    // =================================================================== SCHEDULE

    public openScheduleQuery(query: QueryDefinition): void {
        this.schedulingQuery = query;
        const existing = this.scheduleForQuery(query);
        this.scheduleForm = this.formBuilder.group({
            outputBucket: [existing ? existing.outputBucket : '', Validators.required],
            outputPrefix: [existing ? existing.outputPrefix : ''],
            outputFileNameTemplate: [existing ? existing.outputFileNameTemplate
                : `${query.queryName.replace(/[^a-zA-Z0-9_-]+/g, '_')}_{date}`, Validators.required],
            intervalMinutes: [existing ? existing.intervalMinutes : 60, [Validators.required, Validators.min(5)]]
        });
    }

    get sf() {
        return this.scheduleForm.controls;
    }

    public saveSchedule(): void {
        if (this.scheduleForm.invalid) {
            return;
        }
        this.spinnerService.show();
        const existing = this.scheduleForQuery(this.schedulingQuery);
        const payload: QuerySchedule = {
            queryId: this.schedulingQuery.queryId,
            databaseConnectionProfileId: this.schedulingQuery.databaseConnectionProfileId,
            outputBucket: this.sf.outputBucket.value,
            outputPrefix: this.sf.outputPrefix.value,
            outputFileNameTemplate: this.sf.outputFileNameTemplate.value,
            intervalMinutes: this.sf.intervalMinutes.value
        };
        const call = existing
            ? this.queryEngineService.updateSchedule({ ...payload, scheduleId: existing.scheduleId })
            : this.queryEngineService.addSchedule(payload);
        call.pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllSchedules();
                this.closeScheduleModal.nativeElement.click();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public removeSchedule(query: QueryDefinition): void {
        const existing = this.scheduleForQuery(query);
        if (!existing) {
            return;
        }
        this.spinnerService.show();
        this.queryEngineService.deleteSchedule(existing.scheduleId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, this.SUCCESS);
                this.fetchAllSchedules();
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    // =================================================================== EXECUTIONS

    public fetchAllExecutions(): void {
        this.queryEngineService.fetchAllExecutions()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.executions = response.data || [];
                }
            }, (error) => this.alertService.showError(error, this.ERROR));
    }

    public get filteredExecutions(): QueryExecution[] {
        const searched = this.searchFilterPipe.transform(this.executions, this.searchExecution) || [];
        if (!this.filterExecutionStatus) {
            return searched;
        }
        return searched.filter((e: QueryExecution) => e.status === this.filterExecutionStatus);
    }

    /** Non-deleted connections, with no search/type filter applied -- used for the tab count,
     * the "add a connection first" gating, and the query form's connection picker, none of
     * which should be affected by whatever's currently typed into the Connections tab's own
     * search/type filter (unlike filteredConnections below, which is for that tab's table). */
    public get activeConnections(): DatabaseConnectionProfile[] {
        return this.connections.filter((c) => c.status !== 'Delete');
    }

    public get filteredConnections(): DatabaseConnectionProfile[] {
        const searched = (this.searchFilterPipe.transform(this.connections, this.searchConnection) || [])
            .filter((c: DatabaseConnectionProfile) => c.status !== 'Delete');
        if (!this.filterDatabaseType) {
            return searched;
        }
        return searched.filter((c: DatabaseConnectionProfile) => c.databaseType === this.filterDatabaseType);
    }

    /** Non-deleted queries, with no search filter applied -- see activeConnections above for
     * why this is kept separate from filteredQueries (used for the tab badge count, which
     * shouldn't fluctuate with whatever's typed into the Queries tab's own search box). */
    public get activeQueries(): QueryDefinition[] {
        return this.queries.filter((q) => q.status !== 'Delete');
    }

    public get filteredQueries(): QueryDefinition[] {
        return (this.searchFilterPipe.transform(this.queries, this.searchQuery) || [])
            .filter((q: QueryDefinition) => q.status !== 'Delete');
    }

    public connectionName(databaseConnectionProfileId: any): string {
        const connection = this.connections.find((c) => c.databaseConnectionProfileId === databaseConnectionProfileId);
        return connection ? connection.profileName : `#${databaseConnectionProfileId}`;
    }

}
