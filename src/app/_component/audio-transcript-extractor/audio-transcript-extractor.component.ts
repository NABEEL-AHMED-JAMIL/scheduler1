import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AlertService, AudioTranscriptService, AiAgentService, StorageService } from '@/_services';
import { ApiCode, AUDIO_SUPPORTED_EXTENSIONS, VIDEO_SUPPORTED_EXTENSIONS, BucketSummary, ObjectSummary } from '@/_models';
import { AiAgent, fileExtension } from '@/_models/ai-agent.model';

const PAGE_SIZE = 100;

interface Breadcrumb {
    name: string;
    prefix: string;
}

interface AskEntry {
    prompt: string;
    answer: string;
}

@Component({
    selector: 'audio-transcript-extractor',
    templateUrl: 'audio-transcript-extractor.component.html'
})
export class AudioTranscriptExtractorComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public mode: 'upload' | 'path' | 'browse' | 'video' | 'youtube' = 'upload';
    public supportedExtensions = AUDIO_SUPPORTED_EXTENSIONS;
    public videoSupportedExtensions = VIDEO_SUPPORTED_EXTENSIONS;

    public includeTimestamps = false;

    public selectedFile: File = null;

    public pathInput = '';

    public selectedVideoFile: File = null;

    public youtubeUrl = '';

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

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
    public savingHistory = false;
    public historySavedPath = '';
    public saveHistoryError = '';

    public agents: AiAgent[] = [];
    public loadingAgents = false;
    public selectedAgentId: any = '';
    public prompt = '';
    public asking = false;
    public askError = '';
    public asks: AskEntry[] = [];

    constructor(
        private alertService: AlertService,
        private storageService: StorageService,
        private audioTranscriptService: AudioTranscriptService,
        private aiAgentService: AiAgentService) {
    }

    ngOnInit(): void {
        this.loadBuckets();
        this.loadAgents();
    }

    public setMode(mode: 'upload' | 'path' | 'browse' | 'video' | 'youtube'): void {
        this.mode = mode;
        this.extractError = '';
    }

    public onFileSelected(event: any): void {
        let file: File = event && event.target && event.target.files ? event.target.files[0] : null;
        this.selectedFile = file || null;
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

    public onVideoFileSelected(event: any): void {
        let file: File = event && event.target && event.target.files ? event.target.files[0] : null;
        this.selectedVideoFile = file || null;
    }

    public extractVideoUpload(): void {
        if (!this.selectedVideoFile) {
            this.alertService.showError('Choose a video file first.', this.ERROR);
            return;
        }
        if (!this.hasExtension(this.selectedVideoFile.name, this.videoSupportedExtensions)) {
            this.alertService.showError(
                `"${this.selectedVideoFile.name}" isn't a supported type (${this.videoSupportedExtensions.join(', ')}).`, this.ERROR);
            return;
        }
        this.sourceLabel = this.selectedVideoFile.name;
        this.beginExtraction();
        this.audioTranscriptService.extractFromVideoUpload(this.selectedVideoFile, this.includeTimestamps)
            .pipe(first())
            .subscribe((response) => this.handleExtractResponse(response), (error) => this.handleExtractError(error));
    }

    public extractYoutube(): void {
        let url = (this.youtubeUrl || '').trim();
        if (!url) {
            this.alertService.showError('Paste a YouTube link first.', this.ERROR);
            return;
        }
        if (!/(youtube\.com|youtu\.be)\//i.test(url)) {
            this.alertService.showError('That doesn\'t look like a YouTube link.', this.ERROR);
            return;
        }
        this.sourceLabel = url;
        this.beginExtraction();
        this.audioTranscriptService.extractFromYoutube(url, this.includeTimestamps)
            .pipe(first())
            .subscribe((response) => this.handleExtractResponse(response), (error) => this.handleExtractError(error));
    }

    public loadFromPath(): void {
        let path = (this.pathInput || '').trim().replace(/^\/+/, '');
        if (!path) {
            this.alertService.showError('Enter a path like "etl-bucket/folder/call.mp3".', this.ERROR);
            return;
        }
        let slashIndex = path.indexOf('/');
        if (slashIndex === -1) {
            this.alertService.showError('Path must include a bucket, e.g. "etl-bucket/call.mp3".', this.ERROR);
            return;
        }
        let bucket = path.substring(0, slashIndex);
        let key = path.substring(slashIndex + 1);
        this.extractFromBucketKey(bucket, key);
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

    public openEntry(entry: ObjectSummary): void {
        if (entry.folder) {
            this.currentPrefix = entry.key;
            this.breadcrumbs = [...this.breadcrumbs, { name: entry.name, prefix: entry.key }];
            this.loadObjects();
            return;
        }

        if (fileExtension(entry.name) === 'txt') {
            this.loadSavedTranscript(this.selectedBucket, entry.key);
            return;
        }
        if (!this.hasExtension(entry.name, this.supportedExtensions)) {
            this.alertService.showError(
                `"${entry.name}" isn't a supported type (${this.supportedExtensions.join(', ')} to extract, or .txt for an already-saved transcript).`, this.ERROR);
            return;
        }
        this.extractFromBucketKey(this.selectedBucket, entry.key);
    }

    public goToBreadcrumb(index: number): void {
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
        this.asks = [];
        this.saveBucket = '';
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.transcriptSavedPath = '';
        this.saveTranscriptError = '';
        this.historySavedPath = '';
        this.saveHistoryError = '';
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
        this.extractError = 'Extraction failed: ' + (error && error.message ? error.message : error);
    }

    private hasExtension(fileName: string, extensions: string[]): boolean {
        return extensions.indexOf(fileExtension(fileName)) > -1;
    }

    public copyTranscript(): void {
        if (!this.transcript) {
            return;
        }
        this.copyToClipboard(this.transcript, 'Transcript copied to clipboard.');
    }

    public copyAnswer(answer: string): void {
        if (!answer) {
            return;
        }
        this.copyToClipboard(answer, 'Answer copied to clipboard.');
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

    public saveHistoryToBucket(): void {
        if (!this.asks.length || !this.validateSaveTarget()) {
            return;
        }
        let historyText = this.asks.map((a) => `Q: ${a.prompt}\nA: ${a.answer}`).join('\n\n');
        this.savingHistory = true;
        this.saveHistoryError = '';
        this.historySavedPath = '';
        this.saveTextToBucketFolder(this.saveBucket, this.saveFolderName.trim(), 'qa_history.txt', historyText, this.saveFolderExists,
            (path) => {
                this.savingHistory = false;
                this.historySavedPath = path;
            },
            (message) => {
                this.savingHistory = false;
                this.saveHistoryError = message;
            });
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

    public loadAgents(): void {
        this.loadingAgents = true;
        this.aiAgentService.fetchAllAgents()
            .pipe(first())
            .subscribe((response) => {
                this.loadingAgents = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.agents = (response.data || []).filter((agent: AiAgent) => agent.status === 'Active');
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingAgents = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public askAi(): void {
        if (!this.selectedAgentId) {
            this.alertService.showError('Select an AI Agent.', this.ERROR);
            return;
        }
        if (!this.prompt || !this.prompt.trim()) {
            this.alertService.showError('Type a question or instruction first.', this.ERROR);
            return;
        }
        let currentPrompt = this.prompt;
        this.asking = true;
        this.askError = '';
        this.aiAgentService.processText(this.selectedAgentId, this.sourceLabel, this.transcript, currentPrompt)
            .pipe(first())
            .subscribe((response) => {
                this.asking = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.asks = [...this.asks, { prompt: currentPrompt, answer: response.data }];
                    this.prompt = '';
                } else {
                    this.askError = response.message;
                }
            }, (error) => {
                this.asking = false;
                this.askError = 'AI request failed: ' + (error && error.message ? error.message : error);
            });
    }

    public clearAll(): void {
        this.selectedFile = null;
        this.pathInput = '';
        this.selectedVideoFile = null;
        this.youtubeUrl = '';
        this.sourceLabel = '';
        this.transcript = '';
        this.transcriptLoadedFromBucket = false;
        this.extractError = '';
        this.asks = [];
        this.askError = '';
        this.saveBucket = '';
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.transcriptSavedPath = '';
        this.saveTranscriptError = '';
        this.historySavedPath = '';
        this.saveHistoryError = '';
    }

}
