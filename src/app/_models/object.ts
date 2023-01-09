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
}

export const SOURCE_TASK_TYPE: SourceTaskType[] = [
  {
		sourceTaskTypeId: 1000,
		description: "[consumer test]",
		queueTopicPartition: "topic=test-topic&partitions=[*]",
		serviceName: "Test"
	},
	{
		sourceTaskTypeId: 1001,
		description: "[only for file type (non of image)]",
		queueTopicPartition: "topic=scrapping-topic&partitions=[0]",
		serviceName: "Web Scrapping"
	},
	{
		sourceTaskTypeId: 1002,
		description: "[only html data to other format (xml|css|xlsx|json)]",
		queueTopicPartition: "topic=scrapping-topic&partitions=[1]",
		serviceName: "Data Scrapping"
	},
	{
		sourceTaskTypeId: 1003,
		description: "[only image scrapping diff type of image]",
		queueTopicPartition: "topic=scrapping-topic&partitions=[2]",
		serviceName: "Image Scraping"
	},
	{
		sourceTaskTypeId: 1004,
		description: "[only for monitoring]",
		queueTopicPartition: "topic=comparison-topic&partitions=[0]",
		serviceName: "Image Comparison"
	},
	{
		sourceTaskTypeId: 1005,
		description: "[only for monitoring]",
		queueTopicPartition: "topic=comparison-topic&partitions=[1]",
		serviceName: "Data Comparison"
	},
	{
		sourceTaskTypeId: 1006,
		description: "[only for monitoring]",
		queueTopicPartition: "topic=comparison-topic&partitions=[2]",
		serviceName: "Web Comparison"
	},
	{
		sourceTaskTypeId: 1007,
		description: "[user uplaod file xlsx|css and extract the data as per the requirement and reportment (json|xlsx|css|xlsx)]",
		queueTopicPartition: "topic=extraction-topic&partitions=[*]",
		serviceName: "Data Extraction"
	}
];

// LookupData
export interface LookupData {
    lookupId?: any;
    dateCreated?: any;
    description?: any;
    lookupValue?: any;
    lookupType?: any;
    parent?: LookupData;
}

export const LOOKUP_DATA: LookupData[] = [
    {
        lookupId: 1001,
        dateCreated: "2021-03-31 22:09:43",
        description: "This Scheduler use for send the sourceJob into the queue",
        lookupValue: "2022-06-13T22:36:36.530",
        lookupType: "SCHEDULER_LAST_RUN_TIME"
    }, {
        lookupId: 1002,
        dateCreated: "2021-03-31 23:06:48",
        description: "This Queue fetch size use to fetch the limit of data from db",
        lookupValue: "50",
        lookupType: "QUEUE_FETCH_LIMIT"
    }
];

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

export const SOURCE_TASK_DETAIL: SourceTask[] = [
    {
      taskDetailId: 1001,
      taskName: "Test Source 2",
      taskStatus: "Active",
      sourceTaskType: {
        sourceTaskTypeId: "1000",
        serviceName: "Test",
        description: "[consumer test]",
        queueTopicPartition: "topic=test-topic&partitions=[*]"
      },
      totalLinksJobs: 0
    },
    {
      taskDetailId: 1006,
      taskName: "Test Source 12",
      taskStatus: "Active",
      sourceTaskType: {
        sourceTaskTypeId: "1000",
        serviceName: "Test",
        description: "[consumer test]",
        queueTopicPartition: "topic=test-topic&partitions=[*]"
      },
      totalLinksJobs: 0
    },
    {
      taskDetailId: 1005,
      taskName: "Test Source 12",
      taskStatus: "Active",
      sourceTaskType: {
        sourceTaskTypeId: "1000",
        serviceName: "Test",
        description: "[consumer test]",
        queueTopicPartition: "topic=test-topic&partitions=[*]"
      },
      totalLinksJobs: 0
    },
    {
      taskDetailId: 1007,
      taskName: "Test 19",
      taskStatus: "Active",
      sourceTaskType: {
        sourceTaskTypeId: "1001",
        serviceName: "Web Scrapping",
        description: "[only for file type (non of image)]",
        queueTopicPartition: "topic=scrapping-topic&partitions=[0]"
      },
      totalLinksJobs: 0
    },
    {
      taskDetailId: 1000,
      taskName: "Test Source 1",
      taskStatus: "Active",
      sourceTaskType: {
        sourceTaskTypeId: "1000",
        serviceName: "Test",
        description: "[consumer test]",
        queueTopicPartition: "topic=test-topic&partitions=[*]"
      },
      totalLinksJobs: 5
    }
];

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
  appUserId?: any;
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

export const SEARCH_TASK_LIST: String[] = [
  'taskDetailId',
  'taskName',
  'taskStatus',
  'totalLinksJobs',
  'sourceTaskTypeId',
  'serviceName'
];

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