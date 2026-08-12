import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, TenantService, AuthService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action } from '@/_models';
import { Tenant } from '@/_models/tenant.model';

/**
 * PLATFORM_ADMIN only (see RoleGuard on this route) -- provisions/renames/suspends tenants.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'tenants',
    templateUrl: 'tenants.component.html'
})
export class TenantsComponent implements OnInit {

    public ERROR = 'Error';
    public tenants: Tenant[] = [];
    public search: any = '';
    public tenantForm: FormGroup;
    public tenantAction: Action | null = null;
    public submitted = false;
    public isEditMode = false;
    public deleteTenant: Tenant | null = null;
    // 'Delete' left out on purpose -- a deleted tenant is never shown (see filteredTenants).
    public readonly statusOptions = ['Active', 'Suspended'];
    // '' means "no filter" -- applied before the free-text `search` box (see `filteredTenants`).
    public filterStatus: string = '';

    @ViewChild('closeTenantModal', { static: false })
    public closeTenantModal: any;
    @ViewChild('closeDeleteModal', { static: false })
    public closeDeleteModal: any;

    constructor(private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private tenantService: TenantService,
        public authService: AuthService) {
    }

    ngOnInit() {
        this.listTenants();
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.tenantForm.controls;
    }

    public get filteredTenants(): Tenant[] {
        return this.tenants.filter((tenant) =>
            tenant.status !== 'Delete' && (!this.filterStatus || tenant.status === this.filterStatus));
    }

    public get hasActiveFilters(): boolean {
        return !!(this.filterStatus || this.search);
    }

    public clearFilters(): void {
        this.filterStatus = '';
        this.search = '';
    }

    public listTenants(): void {
        this.spinnerService.show();
        this.tenantService.listTenants()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.tenants = response.data;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public addTenant(): void {
        this.tenantAction = Action.ADD;
        this.isEditMode = false;
        this.submitted = false;
        this.tenantForm = this.formBuilder.group({
            tenantName: ['', Validators.required],
            tenantCode: ['', Validators.required]
        });
    }

    public editTenant(tenant: Tenant): void {
        this.tenantAction = Action.EDIT;
        this.isEditMode = true;
        this.submitted = false;
        this.tenantForm = this.formBuilder.group({
            tenantId: [tenant.tenantId, Validators.required],
            tenantName: [tenant.tenantName, Validators.required],
            tenantCode: [{ value: tenant.tenantCode, disabled: true }]
        });
    }

    public submitTenant(): void {
        this.submitted = true;
        if (this.tenantForm.invalid) {
            return;
        }
        this.spinnerService.show();
        const payload = this.tenantForm.getRawValue();
        const request = this.isEditMode
            ? this.tenantService.updateTenant(payload)
            : this.tenantService.addTenant(payload);
        request.pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.isEditMode ? 'Tenant Updated' : 'Tenant Added');
                    this.closeTenantModal.nativeElement.click();
                    this.listTenants();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    /** Suspended blocks every user under this tenant from logging in (enforced server-side in
     * AuthServiceImpl.login) -- doesn't touch their data. */
    public toggleSuspend(tenant: Tenant): void {
        this.spinnerService.show();
        const nextStatus = tenant.status === 'Suspended' ? 'Active' : 'Suspended';
        this.tenantService.changeTenantStatus({ tenantId: tenant.tenantId, status: nextStatus as any })
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'Tenant Status');
                    this.listTenants();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public confirmDeleteTenant(tenant: Tenant): void {
        this.deleteTenant = tenant;
    }

    public processDeleteTenant(): void {
        if (!this.deleteTenant) {
            return;
        }
        this.spinnerService.show();
        this.tenantService.changeTenantStatus({ tenantId: this.deleteTenant.tenantId, status: 'Delete' as any })
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'Tenant Deleted');
                    this.closeDeleteModal.nativeElement.click();
                    this.deleteTenant = null;
                    this.listTenants();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

}
