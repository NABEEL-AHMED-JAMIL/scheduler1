export type NotificationType = 'JOB_COMPLETED' | 'JOB_FAILED' | 'JOB_SKIPPED' | 'TASK_ASSIGNED' | 'BATCH_DONE'
    | 'KAFKA_TEST_FAILED' | 'USER_ADDED' | 'FILE_SHARE_SENT' | 'FILE_SHARE_FAILED' | 'FILE_SHARED_WITH_YOU';

export type NotificationSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

export interface AppNotification {
    notificationId: number;
    type: NotificationType;
    severity: NotificationSeverity;
    title: string;
    message?: string;
    linkUrl?: string;
    read: boolean;
    dateCreated: string;
}
