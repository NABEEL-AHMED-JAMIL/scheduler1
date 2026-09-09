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
    tenantId?: any;
    description?: any;
    queueTopicPartition?: any;
    serviceName?: any;
    totalTaskLink?:any;
    status?: any;

    kafkaConnectionProfileId?: any;

    kafkaConnectionProfileName?: any;
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

export interface LookupData {
    lookupId?: any;
    dateCreated?: any;
    description?: any;
    lookupValue?: any;
    lookupType?: any;
    encrypted?: any;
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
    bucket?: string;
    inputFolder?: string;
    outputFolder?: string;
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
    tabActive?: any;
};

export interface Scheduler {
    schedulerId?: any;
    startDate?: any;
    endDate?: any;
    startTime?: any;
    frequency?: any;
    intervalValue?: any;
    daysOfWeek?: any;
    dayOfMonth?: any;
    nextRunAt?: any;
    expired?: any;
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

export interface BucketSummary {
    label?: any;
    bucket?: any;
    provider?: any;
}

export interface ObjectSummary {
    name?: any;
    key?: any;
    folder?: any;
    size?: any;
    lastModified?: any;
    etag?: any;
    contentType?: any;
}

export interface ObjectMetadata {
    name?: any;
    key?: any;
    size?: any;
    lastModified?: any;
    etag?: any;
    contentType?: any;
    previewable?: any;
}

export interface BrowseObjectsResponse {
    objects?: ObjectSummary[];
    nextContinuationToken?: any;
}