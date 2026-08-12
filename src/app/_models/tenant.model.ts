/**
 * @author Nabeel Ahmed
 */
export interface Tenant {
    tenantId?: any;
    uuid?: string;
    tenantName?: string;
    tenantCode?: string;
    status?: 'Active' | 'Inactive' | 'Suspended' | 'Delete';
    dateCreated?: string;
    userCount?: number;
}
