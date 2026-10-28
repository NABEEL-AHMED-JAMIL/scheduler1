/**
 * Every action media-service writes to a report's Activity (its report_audit rows), as of media-service 880b3da (2026-10-27),
 * found by grepping its audit calls: `grep -rn 'reports.audit(' media-service/src/main/java`. A new one there belongs here,
 * and report-activity.spec.ts then asks it to have its words in REPORT_ACTIVITY.
 */
export const MEDIA_REPORT_AUDIT_ACTIONS: { action: string; writtenBy: string; detail: string[] }[] = [
  { action: 'report.created', writtenBy: 'ReportService.request', detail: ['templateId'] },
  { action: 'report.requested', writtenBy: 'ReportService.request', detail: ['jobId', 'templateVersion', 'snapshotId'] },
  { action: 'report.generated', writtenBy: 'GenerationWorker', detail: ['version', 'jobId', 'templateVersion', 'snapshotId'] },
  { action: 'report.failed', writtenBy: 'GenerationWorker', detail: ['jobId', 'code'] },
  { action: 'report.archived', writtenBy: 'ReportService.archive', detail: [] },
  { action: 'report.deleted', writtenBy: 'ReportService.delete', detail: ['label', 'name', 'versions', 'files'] },
  { action: 'report.files.left', writtenBy: 'ReportService.delete', detail: ['files', 'keys'] },
  { action: 'report.downloaded', writtenBy: 'ReportService.download', detail: ['version', 'format', 'served'] },
  { action: 'report.delivered', writtenBy: 'ReportService.deliver', detail: ['version', 'format', 'via', 'signed', 'served'] },
  { action: 'report.version.voided', writtenBy: 'ReportService.voidVersion', detail: ['version', 'reason'] },
  { action: 'report.approval.requested', writtenBy: 'ReviewService.request', detail: ['version', 'requestId', 'secondApprover', 'note'] },
  { action: 'report.approval.first', writtenBy: 'ReviewService.decide', detail: ['version', 'requestId', 'byName'] },
  { action: 'report.approval.rejected', writtenBy: 'ReviewService.decide', detail: ['version', 'requestId', 'byName', 'note'] },
  { action: 'report.approved', writtenBy: 'ApprovalService.approve', detail: ['version', 'signed', 'sha256', 'byName', 'why', 'firstApproval'] },
  { action: 'report.approved.signed', writtenBy: 'ApprovalService.approve', detail: ['version', 'signed', 'sha256', 'byName', 'firstApproval', 'signers'] },
];
