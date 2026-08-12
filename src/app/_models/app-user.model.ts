/**
 * @author Nabeel Ahmed
 */
export interface AppUserRecord {
    appUserId?: any;
    uuid?: string;
    tenantId?: any;
    tenantName?: string;
    /** False when this user's tenant has been deleted/suspended -- their own `status` field
     * stays whatever it was (deleting a tenant doesn't cascade to its users), so this is what
     * actually reflects whether they can log in. Undefined for a PLATFORM_ADMIN (not tenant-bound). */
    tenantActive?: boolean;
    username?: string;
    /** Write-only -- set on add/resetPassword, never populated back on a read. */
    password?: string;
    fullName?: string;
    userRole?: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';
    status?: 'Active' | 'Inactive' | 'Delete';
    dateCreated?: string;
    lastLoginAt?: string;
}
