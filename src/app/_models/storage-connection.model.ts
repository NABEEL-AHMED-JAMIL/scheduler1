export type StorageProvider = 'MINIO' | 'S3' | 'AZURE' | 'FTP' | 'FTPS';

export const STORAGE_PROVIDERS: { value: StorageProvider; label: string; hint: string }[] = [
    { value: 'S3', label: 'AWS S3', hint: 'Access key + secret, or leave both blank to use the host IAM role.' },
    { value: 'AZURE', label: 'Azure Blob', hint: 'Connection string, or account name + account key.' },
    { value: 'MINIO', label: 'MinIO', hint: 'Endpoint URL plus access key and secret.' },
    { value: 'FTP', label: 'FTP', hint: 'Plain FTP -- credentials and file contents are not encrypted in transit.' },
    { value: 'FTPS', label: 'FTPS', hint: 'FTP over TLS. Explicit (port 21) unless implicit is enabled (port 990).' }
];

export interface StorageConnection {
    storageConnectionId?: any;
    tenantId?: any;
    connectionName?: string;
    alias?: string;
    provider?: StorageProvider;
    description?: string;

    bucketName?: string;
    endpoint?: string;
    region?: string;
    accessKey?: string;
    secretKey?: string;
    secretKeyConfigured?: boolean;

    azureAccountName?: string;
    azureConnectionString?: string;
    azureConnectionStringConfigured?: boolean;

    host?: string;
    port?: number;
    username?: string;
    password?: string;
    passwordConfigured?: boolean;
    baseDirectory?: string;
    passiveMode?: boolean;
    implicitTls?: boolean;

    isDefault?: boolean;
    status?: 'Active' | 'Inactive' | 'Delete';
    connectionStatus?: string;
    lastTestedAt?: string;
    lastTestMessage?: string;
    dateCreated?: string;
}

export function isFtpProvider(provider: StorageProvider): boolean {
    return provider === 'FTP' || provider === 'FTPS';
}
