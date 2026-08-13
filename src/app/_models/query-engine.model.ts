
export const DATABASE_TYPES = ['POSTGRES'];

export interface DatabaseConnectionProfile {
    databaseConnectionProfileId?: any;
    profileName: string;
    databaseType: string;
    host: string;
    port: number;
    databaseName: string;
    username: string;
    password?: string;
    passwordConfigured?: boolean;
    additionalProperties?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
}

export interface QueryDefinition {
    queryId?: any;
    queryName: string;
    queryText?: string;
    databaseConnectionProfileId: any;
    status?: string;
    version?: number;
    createdAt?: string;
    updatedAt?: string;
}

export interface QueryPreviewResponse {
    columns: string[];
    rows: { [key: string]: any }[];
    truncated: boolean;
}

export interface QueryExecutionRequest {
    queryId: any;
    databaseConnectionProfileId?: any;
    outputBucket: string;
    outputPrefix?: string;
    outputFileName: string;
}

export interface QueryExecution {
    executionId?: any;
    queryId: any;
    queryName?: string;
    scheduleId?: any;
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED';
    startedAt?: string;
    completedAt?: string;
    rowCount?: number;
    outputBucket?: string;
    outputKey?: string;
    errorMessage?: string;
}

export interface QuerySchedule {
    scheduleId?: any;
    queryId: any;
    queryName?: string;
    databaseConnectionProfileId: any;
    outputBucket: string;
    outputPrefix?: string;
    outputFileNameTemplate: string;
    intervalMinutes: number;
    nextRunAt?: string;
    status?: string;
}
