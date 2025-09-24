export interface NameValue {
    name?: any;
    value?: any;
}

export interface HttpRequestInfo {
    data?: any;
    fileInfo?: FileInfo;
    fileInfos?: FileInfo[];
}

export interface FileInfo {
    file_name?: string;
    file_size?: number;
}

export interface SourceTaskType {
    sourceTaskTypeId?: any;
    description?: any;
    queueTopicPartition?: any;
    serviceName?: any;
    totalTaskLink?:any;
    status?: any;
    schemaRegister?: any;
    schemaPayload?: any;
}

export interface QMessage {
    jobQueueId?: any;
    startTime?: any;
    endTime?: any;
    skipTime?: any;
    jobStatus?: any;
    jobId?: any;
    jobName?: any;
    jobStatusMessage?: any;
    dateCreated?: any;
    jobSend?: any;
    runManual?: any;
    skipManual?: any;
}

// LookupData
export interface LookupData {
    lookupId?: any;
    dateCreated?: any;
    description?: any;
    lookupValue?: any;
    lookupType?: any;
    parent?: LookupData;
}

export interface SourceTask {
    taskDetailId?: any;
    taskName?: any;
    pipelineId?: any;
    taskPayload?: any;
    taskStatus?: any;
    homePageId?: any;
    sourceTaskType?: SourceTaskType;
    totalLinksJobs?: any;
}

export interface SourceJobDetail {
    jobId?: any;
    jobName?: any;
    jobStatus?: any;
    jobRunningStatus?: any;
    lastJobRun?: any;
    execution?: any;
    priority?: any;
    dateCreated?: any;
    taskDetail?: SourceTask;
    scheduler?: Scheduler;
};

export interface Scheduler {
    schedulerId?: any;
    startDate?: any;
    endDate?: any;
    startTime?: any;
    frequency?: any;
    recurrence?: any;
    recurrenceTime?: any;
};

export interface Paging {
    totalRecord?: number;
    pageSize?: number;
    currentPage?: number;
};

export interface QueryCriteria {
    taskDetailId?: any;
    columnName?: any;
    startDate?: any;
    endDate?: any;
    limit?: any;
    order?: any;
    page?: any;
    searchText?: SearchText;
};

export interface SearchText {
    itemName?: string;
    itemValue?: string;
};

export enum Action { NON, VIEW, EDIT, ADD, CLEAR };

export const STATUS_LIST: any = [
    {
        key: 'Active',
        value: 'Active'
    },
    {
        key: 'Inactive',
        value: 'Inactive',
    },
    {
        key: 'Delete',
        value: 'Delete',
    }
];