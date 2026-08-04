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

/**
 * Extracts a transcript from an audio file (upload, a typed bucket/path, or browsing a bucket),
 * an uploaded video file (audio track extracted via ffmpeg first), or a YouTube link (audio
 * downloaded via yt-dlp first) -- all four funnel into the same noise-reduction + Whisper
 * pipeline as the F768927 batch job, run ad-hoc against a single file instead of via the Kafka
 * job queue (see AudioTranscriptRestApi in process, and job-search's standalone Audio Extract
 * Service / media_extract.py). Once a transcript is extracted,
 * the user picks a saved AI Agent (reusing its provider/model/API key) and types a one-off
 * prompt that overrides the agent's saved instructions for this call only (see
 * AiAgentService#processText's optional instructions param) -- nothing here is persisted.
 * @author Nabeel Ahmed
 */
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

    // Include-timestamps toggle -- applies to every mode below
    public includeTimestamps = false;

    // Upload mode
    public selectedFile: File = null;

    // Path mode
    public pathInput = '';

    // Video mode
    public selectedVideoFile: File = null;

    // YouTube mode
    public youtubeUrl = '';

    // Browse mode
    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

    // Shared extraction state
    public sourceLabel = '';
    public extracting = false;
    public extractError = '';
    public transcript = '';
    /** True when `transcript` was loaded directly from an existing .txt in the bucket (Browse
     * mode) rather than produced by running extraction -- it's already saved, so the "Save to
     * Bucket" transcript action is redundant and hidden (see the template). */
    public transcriptLoadedFromBucket = false;

    // Save-to-bucket panel -- shared by both "save transcript" and "save Q&A history" below
    public saveBucket = '';
    public saveFolderName = '';
    /** True when saveFolderName already exists (loaded from the bucket) -- skips the
     * create-folder call and lets saveFolderName be a full nested prefix if needed, instead
     * of createFolder's single-segment-only restriction. */
    public saveFolderExists = false;
    public savingTranscript = false;
    public transcriptSavedPath = '';
    public saveTranscriptError = '';
    public savingHistory = false;
    public historySavedPath = '';
    public saveHistoryError = '';

    // Ask AI panel
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

    // --- Upload mode ---

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

    // --- Video mode ---

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

    // --- YouTube mode ---

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

    // --- Path mode ---

    /** Accepts "bucket/key/path.mp3" -- everything up to the first "/" is the bucket,
     * everything after is the object key. */
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

    // --- Browse mode ---

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
        // A .txt is treated as an already-extracted transcript (e.g. one saved by "Save
        // Transcript to Bucket" below) -- show it directly instead of running it through
        // extraction, which only makes sense for real audio.
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

    // --- Shared extraction ---

    private extractFromBucketKey(bucket: string, key: string): void {
        this.sourceLabel = `${bucket}/${key}`;
        this.beginExtraction();
        this.audioTranscriptService.extractFromBucket(bucket, key, this.includeTimestamps)
            .pipe(first())
            .subscribe((response) => this.handleExtractResponse(response), (error) => this.handleExtractError(error));
    }

    /** Reads a .txt straight out of the bucket (no extraction pipeline involved) -- used when
     * browsing to an already-saved transcript. Pre-fills the save-target fields with where it
     * already lives (the full key prefix, which may be nested more than one level deep --
     * saveFolderExists=true means saveTextToBucketFolder skips createFolder, which only
     * supports a single new segment, so nesting here is safe) so Q&A history can still be
     * saved alongside it even though "Save Transcript to Bucket" is hidden. */
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

    // --- Copy to clipboard ---

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

    // --- Save to Bucket ---

    /** Derived from the source name + a timestamp, e.g. "call_2026-08-03T10-15-00". Editable
     * before saving -- this is just a starting point, not a hard rule. */
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
        // An empty folder name is only valid when saveFolderExists -- it means "loaded from
        // the bucket root", not "no folder chosen yet".
        if (!this.saveFolderExists && (!this.saveFolderName || !this.saveFolderName.trim())) {
            this.alertService.showError('Enter a folder name.', this.ERROR);
            return false;
        }
        return true;
    }

    /** Uploads content as a plain-text file into bucket/folderPrefix. When folderExists is
     * false, creates folderPrefix first (via createFolder, which only accepts a single new
     * path segment). When true (the transcript was loaded from a bucket location that's
     * already there), skips createFolder entirely and uploads straight to folderPrefix --
     * this also makes an arbitrarily nested folderPrefix safe, since only createFolder enforces
     * the single-segment restriction, not a plain upload. */
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

    // --- Ask AI panel ---

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
