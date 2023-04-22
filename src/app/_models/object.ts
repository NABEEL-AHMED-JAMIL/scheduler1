export interface Breadcrumb {
  label: string;
  url: string;
}

export interface AuthResponse {
  appUserId: any;
  token: any;
  type: any;
  refreshToken: any;
  username: any;
  email: any;
  roles: any;
}

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
  lookupType?: any;
  lookupValue?: any;
  description?: any;
  dateCreated?: any;
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

export enum Action { 
  NON,
  VIEW,
  EDIT,
  ADD,
  CLEAR,
  STT
};

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
    key: 'Inactive',
    value: 0,
  },
  {
    key: 'Active',
    value: 1
  },
  {
    key: 'Delete',
    value: 2,
  }
];

export interface AppUserResponse {
  appUserId?: any;
  firstName?: any;
  lastName?: any;
  timeZone?: any;
  username?: any;
  email?: any;
  roleResponse?: RoleResponse[];
  parentAppUser?: AppUserResponse;
  status?: any;
  dateCreated?: any;
}

export interface RoleResponse {
  roleId?: any;
  roleName?: any;
  status?: any;
  dateCreated?: any;
}

export enum LOOKUP_TYPES {
  QUEUE_FETCH_LIMIT = 'QUEUE_FETCH_LIMIT',
  SCHEDULER_LAST_RUN_TIME = 'SCHEDULER_LAST_RUN_TIME',
  EMAIL_SENDER = 'EMAIL_SENDER',
  RESET_PASSWORD_LINK = 'RESET_PASSWORD_LINK',
  SCHEDULER_TIMEZONE = 'SCHEDULER_TIMEZONE',
  SUPER_ADMIN = 'SUPER_ADMIN',
  APPLICATION_STATUS = 'APPLICATION_STATUS',
  TASKTYPE_OPTION = 'TASKTYPE_OPTION',
  STT_SIDEBAR = 'STT_SIDEBAR',
  REQUEST_METHOD = 'REQUEST_METHOD',
  ISDEFAULT = 'ISDEFAULT'
}

export interface STTSidebar {
  title?: any;
  router?: any;
  active?: any,
  type?: any;
  topHeader?: any;
}

export interface STTList {
  sttId: any;
  serviceName: any;
  description: any;
  dateCreated: any;
  status: any;
  taskType: any;
  totalTask: any;
  totalUser: any;
  totalForm: any;
  default: any;
}

export interface STTFormList {
  sttFId: any;
  sttFName: any;
  description: any;
  dateCreated: any;
  status: any;
  totalStt?: any;
  totalSection: any;
  totalControl: any;
  default?: any;
}

export interface STTSectionList {
  sttSId: any;
  sttSName: any;
  description: any;
  dateCreated: any;
  status: any;
  sttSOrder: any;
  totalStt: any;
  totalForm: any;
  totalControl: any;
  default?: any;
}

export interface STTControlList {
  sstCId: any;
  sstCOrder: any;
  sstCName: any;
  filedName: any;
  filedType: any;
  description: any;
  mandatory: any;
  status: any;
  default?: any;
  dateCreated: any;
  totalStt: any;
  totalSection: any;
  totalForm: any;
}