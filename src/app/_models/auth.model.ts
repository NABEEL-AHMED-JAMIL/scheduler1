/**
 * @author Nabeel Ahmed
 */
export interface AuthUser {
    accessToken: string;
    refreshToken: string;
    username: string;
    fullName: string;
    userRole: 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TENANT_USER';
    tenantId: any;
    appUserId: any;
}
