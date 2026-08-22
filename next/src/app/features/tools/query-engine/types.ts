export interface DbConnection {
  databaseConnectionProfileId: number;
  profileName: string;
  databaseType: string;
  host: string;
  port: number;
  databaseName: string;
  username: string;
  passwordConfigured?: boolean;
  additionalProperties?: string;
  status: string;
  createdAt?: string;
}

export interface QueryDefinition {
  queryId: number;
  queryName: string;
  queryText: string;
  databaseConnectionProfileId: number;
  status: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QueryExecution {
  executionId: number;
  queryId: number;
  queryName?: string;
  scheduleId?: number;
  status: string;
  startedAt?: string;
  completedAt?: string;
  rowCount?: number;
  outputBucket?: string;
  outputKey?: string;
  errorMessage?: string;
}

export interface QuerySchedule {
  scheduleId: number;
  queryId: number;
  queryName?: string;
  databaseConnectionProfileId?: number;
  outputBucket?: string;
  outputPrefix?: string;
  outputFileNameTemplate?: string;
  intervalMinutes?: number;
  nextRunAt?: string;
  status: string;
}

export interface PreviewResult {
  columns: string[];
  rows: any[][];
  truncated?: boolean;
}
