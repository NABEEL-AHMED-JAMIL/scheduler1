import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AlertService, AppUserService, TenantService, AuthService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { first } from 'rxjs/operators';
import { ApiCode, Action } from '@/_models';
import { AppUserRecord } from '@/_models/app-user.model';
import { Tenant } from '@/_models/tenant.model';

/**
 * TENANT_ADMIN+ (see RoleGuard on this route). What's actually visible/editable is further
 * scoped server-side by role (see AppUserServiceImpl) -- a Tenant Admin only ever sees their
 * own tenant's users here and can't grant Platform Admin or move a user to another tenant, so
 * this component doesn't need to duplicate that logic, just not render controls for things the
 * backend would reject anyway (see isPlatformAdmin below).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'users',
    templateUrl: 'users.component.html'
})
export class UsersComponent implements OnInit {

    public ERROR = 'Error';
    public users: AppUserRecord[] = [];
    public tenants: Tenant[] = [];
    public search: any = '';
    public userForm: FormGroup;
    public resetPasswordForm: FormGroup;
    public userAction: Action | null = null;
    public submitted = false;
    public isEditMode = false;
    public resetPasswordTarget: AppUserRecord | null = null;
    public deleteUser: AppUserRecord | null = null;
    public readonly roleOptions = ['PLATFORM_ADMIN', 'TENANT_ADMIN', 'TENANT_USER'];
    // 'Delete' left out on purpose -- a deleted user is never shown (see filteredUsers), so
    // filtering *for* Delete would always yield nothing.
    public readonly statusOptions = ['Active', 'Inactive'];
    // Dropdown filters, applied on top of (before) the free-text `search` box below --
    // '' means "no filter" for each. filterTenantId only has any effect for a Platform Admin
    // (a Tenant Admin's own list is already scoped server-side to their one tenant).
    public filterTenantId: string = '';
    public filterRole: string = '';
    public filterStatus: string = '';

    @ViewChild('closeUserModal', { static: false })
    public closeUserModal: any;
    @ViewChild('closeResetPasswordModal', { static: false })
    public closeResetPasswordModal: any;
    @ViewChild('closeDeleteModal', { static: false })
    public closeDeleteModal: any;

    constructor(private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private appUserService: AppUserService,
        private tenantService: TenantService,
        public authService: AuthService) {
    }

    ngOnInit() {
        this.listUsers();
        if (this.isPlatformAdmin) {
            this.tenantService.listTenants().pipe(first()).subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.tenants = response.data;
                }
            });
        }
    }

    public get isPlatformAdmin(): boolean {
        return this.authService.currentUser?.userRole === 'PLATFORM_ADMIN';
    }

    // Applied before the `search` free-text box (see `| searchFilter: search` in the template) --
    // dropdown filters narrow the working set first, then the text box searches within it.
    public get filteredUsers(): AppUserRecord[] {
        // Soft-deleted users are never shown, regardless of the Status filter -- see the
        // analogous note on filteredSourceTaskTypes in setting.component.ts.
        return this.users.filter((user) =>
            user.status !== 'Delete'
            && (!this.filterTenantId || String(user.tenantId) === this.filterTenantId)
            && (!this.filterRole || user.userRole === this.filterRole)
            && (!this.filterStatus || user.status === this.filterStatus));
    }

    public get hasActiveFilters(): boolean {
        return !!(this.filterTenantId || this.filterRole || this.filterStatus || this.search);
    }

    public clearFilters(): void {
        this.filterTenantId = '';
        this.filterRole = '';
        this.filterStatus = '';
        this.search = '';
    }

    // convenience getter for easy access to form fields
    get f() {
        return this.userForm.controls;
    }

    public listUsers(): void {
        this.spinnerService.show();
        this.appUserService.listUsers()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.users = response.data;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public addUser(): void {
        this.userAction = Action.ADD;
        this.isEditMode = false;
        this.submitted = false;
        this.userForm = this.formBuilder.group({
            fullName: ['', Validators.required],
            username: ['', [Validators.required, Validators.email]],
            password: ['', [Validators.required, Validators.minLength(8)]],
            userRole: ['TENANT_USER', Validators.required],
            tenantId: ['']
        });
    }

    public editUser(user: AppUserRecord): void {
        this.userAction = Action.EDIT;
        this.isEditMode = true;
        this.submitted = false;
        this.userForm = this.formBuilder.group({
            appUserId: [user.appUserId, Validators.required],
            fullName: [user.fullName, Validators.required],
            username: [{ value: user.username, disabled: true }],
            userRole: [user.userRole, Validators.required],
            tenantId: [user.tenantId]
        });
    }

    public submitUser(): void {
        this.submitted = true;
        if (this.userForm.invalid) {
            return;
        }
        this.spinnerService.show();
        const payload = this.userForm.getRawValue();
        const request = this.isEditMode
            ? this.appUserService.updateUser(payload)
            : this.appUserService.addUser(payload);
        request.pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.isEditMode ? 'User Updated' : 'User Added');
                    this.closeUserModal.nativeElement.click();
                    this.listUsers();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public toggleActive(user: AppUserRecord): void {
        this.spinnerService.show();
        const nextStatus = user.status === 'Active' ? 'Inactive' : 'Active';
        this.appUserService.changeUserStatus({ appUserId: user.appUserId, status: nextStatus as any })
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'User Status');
                    this.listUsers();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public openResetPassword(user: AppUserRecord): void {
        this.resetPasswordTarget = user;
        this.resetPasswordForm = this.formBuilder.group({
            password: ['', [Validators.required, Validators.minLength(8)]]
        });
    }

    public submitResetPassword(): void {
        if (this.resetPasswordForm.invalid || !this.resetPasswordTarget) {
            return;
        }
        this.spinnerService.show();
        this.appUserService.resetPassword({
            appUserId: this.resetPasswordTarget.appUserId,
            password: this.resetPasswordForm.value.password
        }).pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'Password Reset');
                    this.closeResetPasswordModal.nativeElement.click();
                    this.resetPasswordTarget = null;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    public confirmDeleteUser(user: AppUserRecord): void {
        this.deleteUser = user;
    }

    public processDeleteUser(): void {
        if (!this.deleteUser) {
            return;
        }
        this.spinnerService.show();
        this.appUserService.changeUserStatus({ appUserId: this.deleteUser.appUserId, status: 'Delete' as any })
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, 'User Deleted');
                    this.closeDeleteModal.nativeElement.click();
                    this.deleteUser = null;
                    this.listUsers();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

}
