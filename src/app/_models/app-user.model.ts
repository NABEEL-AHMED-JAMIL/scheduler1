
export interface AppUserRecord {
    appUserId?: any;
    uuid?: string;
    tenantId?: any;
    tenantName?: string;

    tenantActive?: boolean;
    username?: string;

    password?: string;
    fullName?: string;
    userRole?: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';
    status?: 'Active' | 'Inactive' | 'Delete';
    dateCreated?: string;
    lastLoginAt?: string;
}
