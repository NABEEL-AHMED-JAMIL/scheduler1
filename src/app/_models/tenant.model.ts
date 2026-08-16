
export interface Tenant {
    tenantId?: any;
    uuid?: string;
    tenantName?: string;
    tenantCode?: string;
    status?: 'Active' | 'Inactive' | 'Suspended' | 'Delete';
    dateCreated?: string;
    userCount?: number;
    kafkaProfileCount?: number;
    bucketCount?: number;
    sourceTaskTypeCount?: number;
    sourceTaskCount?: number;
    sourceJobCount?: number;
}
