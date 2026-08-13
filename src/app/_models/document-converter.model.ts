
export interface DocumentConverterFormatFamily {
    key: string;
    label: string;
    inputFormats: string[];
    outputFormats: string[];
}

export interface DocumentConverterTask {
    documentConverterTaskId?: any;
    taskName?: string;
    inputFileName?: string;
    inputFormat?: string;
    inputContentType?: string;
    inputFileSize?: number;
    outputFormat?: string;
    outputFileName?: string;
    outputContentType?: string;
    outputFileSize?: number;
    bucketName?: string;
    inputStorageKey?: string;
    outputStorageKey?: string;
    status?: 'Active' | 'Inactive' | 'Delete';
    dateCreated?: string;
}

export interface DocumentConverterConvertResult extends DocumentConverterTask {

    outputBase64?: string;
    save?: boolean;
}
