import { Component, OnInit } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { first } from 'rxjs/operators';
import { AlertService, AudioTranscriptService, StorageService } from '@/_services';
import { ApiCode, AUDIO_SUPPORTED_EXTENSIONS, BucketSummary, ObjectSummary } from '@/_models';
import { fileExtension } from '@/_models/ai-agent.model';

const TIMESTAMP_PATTERN = /\[\d{2}:\d{2}:\d{2}\.\d{3}\]/g;

const PAGE_SIZE = 100;

interface Breadcrumb {
    name: string;
    prefix: string;
}

@Component({
    selector: 'audio-transcript-extractor',
    templateUrl: 'audio-transcript-extractor.component.html'
})
export class AudioTranscriptExtractorComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public mode: 'upload' | 'browse' = 'upload';
    public supportedExtensions = AUDIO_SUPPORTED_EXTENSIONS;

    public includeTimestamps = false;

    public selectedFile: File = null;

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

    public selectedEntry: ObjectSummary = null;

    public sourceLabel = '';
    public extracting = false;
    public extractError = '';
    public transcript = '';

    public transcriptLoadedFromBucket = false;

    public saveBucket = '';
    public saveFolderName = '';

    public saveFolderExists = false;
    public savingTranscript = false;
    public transcriptSavedPath = '';
    public saveTranscriptError = '';

    public saveBrowsing = false;
    public saveCurrentPrefix = '';
    public saveBreadcrumbs: Breadcrumb[] = [];
    public saveFolders: ObjectSummary[] = [];
    public loadingSaveFolders = false;

    constructor(
        private alertService: AlertService,
        private storageService: StorageService,
        private audioTranscriptService: AudioTranscriptService,
        private sanitizer: DomSanitizer) {
    }

    ngOnInit(): void {
        this.loadBuckets();
    }

    public setMode(mode: 'upload' | 'browse'): void {
        this.mode = mode;
        this.extractError = '';
    }

    public onFileSelected(event: any): void {
        let file: File = event && event.target && event.target.files ? event.target.files[0] : null;
        this.selectedFile = file || null;
    }

    public get uploadFileIsSupported(): boolean {
        return !!this.selectedFile && this.hasExtension(this.selectedFile.name, this.supportedExtensions);
    }

    public extractUpload(): void {
        if (!this.selectedFile) {
            this.alertService.showError('Choose an audio file first.', this.ERROR);
            return;
        }
        if (!this.hasExtension(this.selectedFile.name, this.supportedExtensions)) {
            this.alertService.showError(
                `"${this.selectedFile.name}" isn't a supported type (${this.supportedExtensions.join(', ')}).`, this.ERROR);
            return;
        }
        this.sourceLabel = this.selectedFile.name;
        this.beginExtraction();
        this.audioTranscriptService.extractFromUpload(this.selectedFile, this.includeTimestamps)
            .pipe(first())
            .subscribe((response) => this.handleExtractResponse(response), (error) => this.handleExtractError(error));
    }

    public loadBuckets(): void {
        this.loadingBuckets = true;
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                this.loadingBuckets = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingBuckets = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public onBucketChange(): void {
        this.currentPrefix = '';
        this.breadcrumbs = [];
        this.objects = [];
        this.selectedEntry = null;
        if (this.selectedBucket) {
            this.loadObjects();
        }
    }

    public loadObjects(): void {
        this.loadingObjects = true;
        this.storageService.listObjects(this.selectedBucket, this.currentPrefix, null, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingObjects = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.objects = (response.data && response.data.objects) || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingObjects = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public get visibleObjects(): ObjectSummary[] {
        return this.objects.filter((entry) => entry.folder
            || this.hasExtension(entry.name, this.supportedExtensions)
            || this.isSavedTranscript(entry));
    }

    public selectEntry(entry: ObjectSummary): void {
        if (entry.folder) {
            this.currentPrefix = entry.key;
            this.breadcrumbs = [...this.breadcrumbs, { name: entry.name, prefix: entry.key }];
            this.selectedEntry = null;
            this.loadObjects();
            return;
        }

        if (!this.isSavedTranscript(entry) && !this.hasExtension(entry.name, this.supportedExtensions)) {
            this.alertService.showError(
                `"${entry.name}" isn't a supported type (${this.supportedExtensions.join(', ')} to extract, or .txt for an already-saved transcript).`, this.ERROR);
            return;
        }
        this.selectedEntry = entry;
    }

    public runSelectedEntry(): void {
        if (!this.selectedEntry) {
            return;
        }
        if (this.isSavedTranscript(this.selectedEntry)) {
            this.loadSavedTranscript(this.selectedBucket, this.selectedEntry.key);
        } else {
            this.extractFromBucketKey(this.selectedBucket, this.selectedEntry.key);
        }
    }

    public isSavedTranscript(entry: ObjectSummary): boolean {
        return !!entry && fileExtension(entry.name) === 'txt';
    }

    public goToBreadcrumb(index: number): void {
        this.selectedEntry = null;
        if (index < 0) {
            this.currentPrefix = '';
            this.breadcrumbs = [];
        } else {
            this.currentPrefix = this.breadcrumbs[index].prefix;
            this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        }
        this.loadObjects();
    }

    private extractFromBucketKey(bucket: string, key: string): void {
        this.sourceLabel = `${bucket}/${key}`;
        this.beginExtraction();
        this.audioTranscriptService.extractFromBucket(bucket, key, this.includeTimestamps)
            .pipe(first())
            .subscribe((response) => this.handleExtractResponse(response), (error) => this.handleExtractError(error));
    }

    private loadSavedTranscript(bucket: string, key: string): void {
        this.sourceLabel = `${bucket}/${key}`;
        this.beginExtraction();
        this.storageService.previewObjectText(bucket, key)
            .pipe(first())
            .subscribe((text) => {
                this.extracting = false;
                this.transcript = text || '';
                this.transcriptLoadedFromBucket = true;
                this.saveBucket = bucket;
                this.saveFolderName = key.indexOf('/') > -1 ? key.substring(0, key.lastIndexOf('/')) : '';
                this.saveFolderExists = true;
            }, (error) => this.handleExtractError(error));
    }

    private beginExtraction(): void {
        this.extracting = true;
        this.extractError = '';
        this.transcript = '';
        this.transcriptLoadedFromBucket = false;
        this.saveBucket = '';
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.transcriptSavedPath = '';
        this.saveTranscriptError = '';
        this.closeSaveBrowser();
    }

    private handleExtractResponse(response: any): void {
        this.extracting = false;
        if (response.status === ApiCode.SUCCESS) {
            this.transcript = response.data || '';
            this.saveFolderName = this.suggestFolderName();
        } else {
            this.extractError = response.message;
        }
    }

    private handleExtractError(error: any): void {
        this.extracting = false;
        // extractFromUpload/extractFromBucket return real failures (unreadable audio, file too
        // large, etc.) as an HTTP error status with a ResponseDto body, not a 200 with an
        // error field -- Angular routes that through this callback as an HttpErrorResponse,
        // whose own .message is just a generic "Http failure response for <url>: 400" string.
        // The actual, useful message is nested one level down, in .error.message.
        const backendMessage = error && error.error && error.error.message;
        this.extractError = 'Extraction failed: ' + (backendMessage || (error && error.message) || error);
    }

    private hasExtension(fileName: string, extensions: string[]): boolean {
        return extensions.indexOf(fileExtension(fileName)) > -1;
    }

    public get highlightedTranscript(): SafeHtml {
        const escaped = this.escapeHtml(this.transcript || '');
        const withHighlights = escaped.replace(TIMESTAMP_PATTERN, (match) => `<span class="transcript-timestamp">${match}</span>`);
        return this.sanitizer.bypassSecurityTrustHtml(withHighlights);
    }

    private escapeHtml(text: string): string {
        return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    public copyTranscript(): void {
        if (!this.transcript) {
            return;
        }
        this.copyToClipboard(this.transcript, 'Transcript copied to clipboard.');
    }

    private copyToClipboard(text: string, successMessage: string): void {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.alertService.showSuccess(successMessage, this.SUCCESS);
            }, () => {
                this.alertService.showError('Could not copy to clipboard.', this.ERROR);
            });
            return;
        }
        let textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.alertService.showSuccess(successMessage, this.SUCCESS);
    }

    private suggestFolderName(): string {
        let stem = (this.sourceLabel || 'transcript').split('/').pop()
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .substring(0, 40) || 'transcript';
        let stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `${stem}_${stamp}`;
    }

    public saveTranscriptToBucket(): void {
        if (!this.transcript || !this.validateSaveTarget()) {
            return;
        }
        this.savingTranscript = true;
        this.saveTranscriptError = '';
        this.transcriptSavedPath = '';
        this.saveTextToBucketFolder(this.saveBucket, this.saveFolderName.trim(), 'transcript.txt', this.transcript, this.saveFolderExists,
            (path) => {
                this.savingTranscript = false;
                this.transcriptSavedPath = path;
            },
            (message) => {
                this.savingTranscript = false;
                this.saveTranscriptError = message;
            });
    }

    public onSaveBucketChange(bucket: string): void {
        this.saveBucket = bucket;
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.closeSaveBrowser();
    }

    public onSaveFolderNameChange(value: string): void {
        this.saveFolderName = value;
        this.saveFolderExists = false;
    }

    public toggleSaveBrowse(): void {
        if (!this.saveBucket) {
            this.alertService.showError('Select a bucket first.', this.ERROR);
            return;
        }
        this.saveBrowsing = !this.saveBrowsing;
        if (this.saveBrowsing) {
            this.saveCurrentPrefix = '';
            this.saveBreadcrumbs = [];
            this.loadSaveFolders();
        }
    }

    private closeSaveBrowser(): void {
        this.saveBrowsing = false;
        this.saveCurrentPrefix = '';
        this.saveBreadcrumbs = [];
        this.saveFolders = [];
    }

    public loadSaveFolders(): void {
        this.loadingSaveFolders = true;
        this.storageService.listObjects(this.saveBucket, this.saveCurrentPrefix, null, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingSaveFolders = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.saveFolders = ((response.data && response.data.objects) || []).filter((entry) => entry.folder);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingSaveFolders = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public openSaveFolder(entry: ObjectSummary): void {
        this.saveCurrentPrefix = entry.key;
        this.saveBreadcrumbs = [...this.saveBreadcrumbs, { name: entry.name, prefix: entry.key }];
        this.loadSaveFolders();
    }

    public goToSaveBreadcrumb(index: number): void {
        if (index < 0) {
            this.saveCurrentPrefix = '';
            this.saveBreadcrumbs = [];
        } else {
            this.saveCurrentPrefix = this.saveBreadcrumbs[index].prefix;
            this.saveBreadcrumbs = this.saveBreadcrumbs.slice(0, index + 1);
        }
        this.loadSaveFolders();
    }

    public useCurrentSaveFolder(): void {
        if (!this.saveCurrentPrefix) {
            return;
        }
        this.saveFolderName = this.saveCurrentPrefix.replace(/\/+$/, '');
        this.saveFolderExists = true;
        this.closeSaveBrowser();
    }

    private validateSaveTarget(): boolean {
        if (!this.saveBucket) {
            this.alertService.showError('Select a bucket.', this.ERROR);
            return false;
        }

        if (!this.saveFolderExists && (!this.saveFolderName || !this.saveFolderName.trim())) {
            this.alertService.showError('Enter a folder name.', this.ERROR);
            return false;
        }
        return true;
    }

    private saveTextToBucketFolder(bucket: string, folderPrefix: string, fileName: string, content: string, folderExists: boolean,
        onSuccess: (path: string) => void, onError: (message: string) => void): void {
        let doUpload = () => {
            let file = new File([content], fileName, { type: 'text/plain' });
            let prefix = folderPrefix ? folderPrefix + '/' : '';
            this.storageService.uploadObject(bucket, prefix, file)
                .pipe(first())
                .subscribe((uploadResponse) => {
                    if (uploadResponse.status === ApiCode.SUCCESS) {
                        onSuccess(`${bucket}/${prefix}${fileName}`);
                    } else {
                        onError(uploadResponse.message);
                    }
                }, (error) => onError(error && error.message ? error.message : error));
        };
        if (folderExists) {
            doUpload();
            return;
        }
        this.storageService.createFolder(bucket, '', folderPrefix)
            .pipe(first())
            .subscribe((folderResponse) => {
                if (folderResponse.status !== ApiCode.SUCCESS) {
                    onError(folderResponse.message);
                    return;
                }
                doUpload();
            }, (error) => onError(error && error.message ? error.message : error));
    }

    public clearAll(): void {
        this.selectedFile = null;
        this.selectedEntry = null;
        this.sourceLabel = '';
        this.transcript = '';
        this.transcriptLoadedFromBucket = false;
        this.extractError = '';
        this.saveBucket = '';
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.transcriptSavedPath = '';
        this.saveTranscriptError = '';
        this.closeSaveBrowser();
    }

}
