#!/usr/bin/env node
// MIG-222 / MIG-266: captures the answers the characterisation visits are given
// (src/app/characterisation/fixtures.live.ts) from a running platform, read-only.
//
//   TA_TOKEN=$(../../etl-platform/scripts/mint-test-token.sh 4537) \
//   PA_TOKEN=$(../../etl-platform/scripts/mint-test-token.sh 1000) \
//   node scripts/characterisation/capture-fixtures.mjs [gateway, default http://localhost:9098]
//
// Only GETs and the POSTs the console uses to read (listSourceTask, fetchLogs). Every list is cut
// to two rows; every credential-like, e-mail, address and endpoint value and every person's display
// name is replaced; ids stay, so the visits can name them. Review the diff: a capture is a new baseline for every screen.
import { writeFileSync } from 'node:fs';

const gateway = (process.argv[2] ?? 'http://localhost:9098').replace(/\/+$/, '') + '/api/v1';
const tokens = { TA: process.env.TA_TOKEN, PA: process.env.PA_TOKEN };
if (!tokens.TA || !tokens.PA) {
  console.error('TA_TOKEN and PA_TOKEN are required (scripts/mint-test-token.sh 4537 and 1000)');
  process.exit(2);
}

const SCRUB = /(accesskey|secret|password|token|apikey|connectionstring|email|username|endpoint|bootstrapservers|recipient|address|phone|hostname|sasl|keystore|truststore|avatar)/i;

// People's display names: the fixtures carry no real person, and the console's own role-wording guard
// (src/app/role-wording.spec.ts) would rightly refuse an account named "Platform Admin" in the source.
const PERSON = /(byname$|^fullname$|^adminname$|^ownername$|^displayname$)/i;

function scrub(value, key = '') {
  if (Array.isArray(value)) return value.slice(0, 2).map(v => scrub(v, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (PERSON.test(k) && typeof v === 'string' && v !== '') {
        out[k] = 'Casey Baseline';
      } else if (SCRUB.test(k) && !/configured$/i.test(k) && typeof v === 'string' && v !== '') {
        out[k] = /email|username|recipient/i.test(k) ? 'person@example.com' : 'redacted';
      } else {
        out[k] = scrub(v, k);
      }
    }
    return out;
  }
  if (typeof value === 'string' && /@/.test(value) && /\.[a-z]{2,}$/i.test(value) && !/\s/.test(value)) {
    return 'person@example.com';
  }
  return value;
}

async function call(who, method, path, body) {
  const response = await fetch(gateway + path, {
    method,
    headers: { Authorization: `Bearer ${tokens[who]}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} answered ${response.status} without JSON`);
  }
}

const live = {};
async function take(who, method, path, body, key = `${method} ${path.split('?')[0]}`) {
  const answer = await call(who, method, path, body);
  live[key] = scrub(answer);
  return answer;
}

const first = (answer, ...path) => {
  let node = answer?.data;
  for (const p of path) node = node?.[p];
  return Array.isArray(node) ? node[0] : node;
};

// Shell
await take('TA', 'GET', '/notification.json/unreadCount');
await take('TA', 'GET', '/notification.json/list?limit=20&page=1');
// Source Jobs
const jobs = await take('TA', 'GET', '/sourceJob.json/listSourceJob');
const jobId = first(jobs)?.jobId;
await take('TA', 'GET', `/sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=${jobId}`);
const runs = await take('TA', 'GET', `/sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=${jobId}`);
const jobQueueId = first(runs, 'jobQueues')?.jobQueueId;
await take('TA', 'GET', `/sourceJob.json/findSourceJobAuditLog?jobId=${jobId}&jobQueueId=${jobQueueId}`);
await take('TA', 'GET', `/aiPrompt.json/runsForJob?jobQueueId=${jobQueueId}`);
await take('TA', 'GET', '/aiAgent.json/fetchAllAgents');
// Source Tasks
const tasks = await take('TA', 'POST', '/sourceTask.json/listSourceTask?limit=1000', {});
const taskId = first(tasks)?.taskDetailId;
await take('TA', 'GET', `/sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=${taskId}`);
await take('TA', 'GET', '/kafkaConnectionProfile.json/fetchAllProfiles');
await take('TA', 'GET', '/setting.json/taskReferences?kind=TASK_GROUP', undefined, 'GET /setting.json/taskReferences?kind=TASK_GROUP');
await take('TA', 'GET', '/setting.json/taskReferences?kind=HOME_PAGE', undefined, 'GET /setting.json/taskReferences?kind=HOME_PAGE');
await take('TA', 'GET', '/setting.json/topics');
// Pipelines and forms
const pipelines = await take('TA', 'GET', '/pipeline.json/list?limit=50&page=1');
const pipeline = first(pipelines, 'rows');
await take('TA', 'GET', `/pipeline.json/fields?pipelineKey=${pipeline?.pipelineKey}`);
await take('TA', 'GET', `/pipeline.json/definition?pipelineId=${encodeURIComponent(pipeline?.pipelineId)}`);
await take('TA', 'GET', `/pipeline.json/listForTopic?sourceTaskTypeId=${pipeline?.sourceTaskTypeId}`);
// Queue and Reports: the week and the month before the characterisation clock (2026-09-28)
await take('TA', 'POST', '/message.json/fetchLogs', { fromDate: '2026-09-22', toDate: '2026-09-28' });
await take('TA', 'GET', '/report.json/runs?startDate=2026-08-29&endDate=2026-09-28');
await take('TA', 'GET', '/aiPrompt.json/usage');
// Document Converter, Object browser
await take('TA', 'GET', '/documentConverter.json/fetchAllTasks');
await take('TA', 'GET', '/documentConverter.json/supportedFormats');
const buckets = await take('TA', 'GET', '/storage.json/buckets');
await take('TA', 'GET', `/storage.json/listObjects?bucket=${encodeURIComponent(first(buckets)?.bucket)}`);
// Prompts, Model connections
const prompts = await take('TA', 'GET', '/aiPrompt.json/list');
const promptId = first(prompts)?.promptId;
await take('TA', 'GET', `/aiPrompt.json/get?promptId=${promptId}`);
await take('TA', 'GET', `/aiPrompt.json/runs?limit=10&promptId=${promptId}`);
await take('TA', 'GET', '/aiConnection.json/list');
// Access profiles, Tenants (the platform administrator's list)
await take('TA', 'GET', '/pageAccess.json/pages');
await take('TA', 'GET', '/pageAccess.json/listProfiles');
await take('TA', 'GET', '/pageAccess.json/listPeople');
await take('PA', 'GET', '/tenant.json/listTenants');
// Analytics, saved queries and dashboards, storage connections
await take('TA', 'GET', '/analyticsDataset.json/fetchAllDatasets');
await take('TA', 'GET', '/analyticsWorkspace.json/fetchAllDashboards');
await take('TA', 'GET', '/analyticsWorkspace.json/fetchAllAnalyses');
await take('TA', 'GET', '/analyticsLibrary.json/fetchAllQueries');
await take('TA', 'GET', '/storageConnection.json/fetchAllConnections');

const ids = { jobId, jobQueueId, taskId, promptId, pipelineId: pipeline?.pipelineId, bucket: first(buckets)?.bucket };
const out = `// Generated by scripts/characterisation/capture-fixtures.mjs on ${new Date().toISOString().slice(0, 10)} -- see fixtures.ts.
// Workspace A's administrator (4537) and, for the tenant list, the platform administrator (1000); two rows per list,
// credentials, e-mails, addresses, endpoints and people's names replaced.
/* eslint-disable */
export const LIVE_IDS = ${JSON.stringify(ids)} as const;

export const LIVE: Record<string, unknown> = ${JSON.stringify(live, null, 2)};
`;
writeFileSync(new URL('../../src/app/characterisation/fixtures.live.ts', import.meta.url), out);
console.log('captured', Object.keys(live).length, 'answers; ids', ids);
