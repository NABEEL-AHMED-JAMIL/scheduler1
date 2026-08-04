import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';
import { forkJoin } from 'rxjs';
import { first } from 'rxjs/operators';
import { AlertService, ImageTextService, AiAgentService, StorageService, TextCleanerService } from '@/_services';
import { ApiCode, IMAGE_SUPPORTED_EXTENSIONS, BucketSummary, ObjectSummary } from '@/_models';
import { ImageRegion } from '@/_models/image-text.model';
import { AiAgent, fileExtension } from '@/_models/ai-agent.model';

const PAGE_SIZE = 100;
/** Below this, a drag is treated as an accidental click, not a real selection --
 * matches PDF Highlighter's MIN_DRAG_PX. */
const MIN_DRAG_PX = 6;

interface Breadcrumb {
    name: string;
    prefix: string;
}

interface AskEntry {
    prompt: string;
    answer: string;
}

interface ScreenRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

/**
 * OCRs an uploaded image -- optionally cropped to a region the user drags out on the image,
 * same "mark an area, extract just that" interaction as PDF Highlighter (overlay div + drag
 * rect, converted from on-screen pixels to a stable coordinate space on commit -- PDF points
 * there, the image's native pixel size here since there's no fixed-DPI page to anchor to).
 * Once text is extracted, the user picks a saved AI Agent and types a one-off prompt that
 * overrides that agent's saved instructions for this call only -- nothing here is persisted
 * unless explicitly saved to the bucket. Browse mode only opens previously-saved .txt results
 * (mirrors Audio Transcript Extractor's "load a saved transcript directly" behavior); it isn't
 * a second way to pick an image to OCR.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'image-text-extractor',
    templateUrl: 'image-text-extractor.component.html'
})
export class ImageTextExtractorComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public mode: 'upload' | 'browse' = 'upload';
    public supportedExtensions = IMAGE_SUPPORTED_EXTENSIONS;

    @ViewChild('imageEl', { static: false }) private imageElRef?: ElementRef<HTMLImageElement>;
    @ViewChild('overlay', { static: false }) private overlayRef?: ElementRef<HTMLDivElement>;

    // Upload mode
    public selectedFile: File = null;
    /** SafeUrl, not a plain string -- Angular's DomSanitizer strips a raw blob: URL bound via
     * [src] as a potential XSS vector, which would leave the preview broken for every upload.
     * bypassSecurityTrustUrl is safe here since we created the blob ourselves, from a file the
     * user just picked locally -- nothing externally supplied. */
    public imagePreviewUrl: SafeUrl = null;

    // Drag-select state (screen/overlay pixel space)
    private naturalWidth = 0;
    private naturalHeight = 0;
    private displayWidth = 0;
    private displayHeight = 0;
    private isDrawing = false;
    private dragStart = { x: 0, y: 0 };
    public draftRect: ScreenRect = null;
    /** Every marked region (screen pixel space, for drawing the boxes) -- multiple are
     * supported, same idea as PDF Highlighter's field list. Empty means "OCR the whole image". */
    public selectedRects: ScreenRect[] = [];
    /** The committed selections in the image's native pixel coordinates, same order as
     * selectedRects -- what actually gets sent to the backend, one OCR call per region. */
    public selectedRegions: ImageRegion[] = [];

    // Browse mode -- only for opening a previously-saved .txt result, not for picking an image
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
    public transcriptLoadedFromBucket = false;

    // Content Clean -- reuses the existing Content Cleaner feature (TextCleanerService) to tidy
    // up OCR output (stray whitespace, smart quotes, hyphen-wrap joins, etc.) before it's used
    // as an AI prompt. Cleans transcript in place, so Ask AI/Save to Bucket use the result.
    public cleaning = false;
    public cleanError = '';

    // Save-to-bucket panel
    public saveBucket = '';
    public saveFolderName = '';
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
        private sanitizer: DomSanitizer,
        private storageService: StorageService,
        private imageTextService: ImageTextService,
        private textCleanerService: TextCleanerService,
        private aiAgentService: AiAgentService) {
    }

    ngOnInit(): void {
        this.loadBuckets();
        this.loadAgents();
    }

    public setMode(mode: 'upload' | 'browse'): void {
        this.mode = mode;
        this.extractError = '';
    }

    // --- Upload mode ---

    public onFileSelected(event: any): void {
        let file: File = event && event.target && event.target.files ? event.target.files[0] : null;
        if (!file) {
            return;
        }
        if (!this.hasExtension(file.name, this.supportedExtensions)) {
            this.alertService.showError(
                `"${file.name}" isn't a supported type (${this.supportedExtensions.join(', ')}).`, this.ERROR);
            return;
        }
        this.selectedFile = file;
        this.imagePreviewUrl = this.sanitizer.bypassSecurityTrustUrl(URL.createObjectURL(file));
        this.sourceLabel = file.name;
        this.transcript = '';
        this.transcriptLoadedFromBucket = false;
        this.extractError = '';
        this.clearSelection();
    }

    public onImageLoad(): void {
        if (!this.imageElRef) {
            return;
        }
        let img = this.imageElRef.nativeElement;
        this.naturalWidth = img.naturalWidth;
        this.naturalHeight = img.naturalHeight;
        this.displayWidth = img.clientWidth;
        this.displayHeight = img.clientHeight;
        if (this.overlayRef) {
            this.overlayRef.nativeElement.style.width = this.displayWidth + 'px';
            this.overlayRef.nativeElement.style.height = this.displayHeight + 'px';
        }
    }

    // --- Drag-select (mirrors PdfHighlighterDetailComponent's overlay drag logic) ---

    public onOverlayMouseDown(event: MouseEvent): void {
        if (!this.overlayRef) {
            return;
        }
        let rect = this.overlayRef.nativeElement.getBoundingClientRect();
        this.dragStart = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        this.isDrawing = true;
        this.draftRect = { left: this.dragStart.x, top: this.dragStart.y, width: 0, height: 0 };
    }

    public onOverlayMouseMove(event: MouseEvent): void {
        if (!this.isDrawing || !this.overlayRef) {
            return;
        }
        let rect = this.overlayRef.nativeElement.getBoundingClientRect();
        let x = event.clientX - rect.left;
        let y = event.clientY - rect.top;
        this.draftRect = {
            left: Math.min(x, this.dragStart.x),
            top: Math.min(y, this.dragStart.y),
            width: Math.abs(x - this.dragStart.x),
            height: Math.abs(y - this.dragStart.y)
        };
    }

    public onOverlayMouseUp(): void {
        if (!this.isDrawing) {
            return;
        }
        this.isDrawing = false;
        let rect = this.draftRect;
        this.draftRect = null;
        if (!rect || rect.width < MIN_DRAG_PX || rect.height < MIN_DRAG_PX) {
            return;
        }
        // Append, don't replace -- lets the user mark several areas (e.g. separate fields on a
        // form or receipt) and extract all of them in one go.
        this.selectedRects = [...this.selectedRects, rect];
        let scaleX = this.displayWidth ? this.naturalWidth / this.displayWidth : 1;
        let scaleY = this.displayHeight ? this.naturalHeight / this.displayHeight : 1;
        this.selectedRegions = [...this.selectedRegions, {
            x: Math.round(rect.left * scaleX),
            y: Math.round(rect.top * scaleY),
            width: Math.round(rect.width * scaleX),
            height: Math.round(rect.height * scaleY)
        }];
    }

    public removeRegion(index: number): void {
        this.selectedRects = this.selectedRects.filter((r, i) => i !== index);
        this.selectedRegions = this.selectedRegions.filter((r, i) => i !== index);
    }

    public clearSelection(): void {
        this.draftRect = null;
        this.selectedRects = [];
        this.selectedRegions = [];
    }

    public extractText(): void {
        if (!this.selectedFile) {
            this.alertService.showError('Choose an image first.', this.ERROR);
            return;
        }
        this.beginExtraction();
        if (!this.selectedRegions.length) {
            this.imageTextService.extractFromImage(this.selectedFile)
                .pipe(first())
                .subscribe((response) => this.handleExtractResponse(response), (error) => this.handleExtractError(error));
            return;
        }
        // One OCR call per marked region, run in parallel, then stitched back together in the
        // order they were drawn -- each region is independent so there's no reason to serialize.
        forkJoin(this.selectedRegions.map((region) =>
            this.imageTextService.extractFromImage(this.selectedFile, region).pipe(first())
        )).subscribe((responses) => {
            this.extracting = false;
            let failed = responses.find((r) => r.status !== ApiCode.SUCCESS);
            if (failed) {
                this.extractError = failed.message;
                return;
            }
            this.transcript = responses.length === 1
                ? (responses[0].data || '')
                : responses.map((r, i) => `--- Region ${i + 1} ---\n${r.data || ''}`).join('\n\n');
            this.saveFolderName = this.suggestFolderName();
        }, (error) => this.handleExtractError(error));
    }

    // --- Browse mode (open a previously-saved .txt only) ---

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
        if (fileExtension(entry.name) !== 'txt') {
            this.alertService.showError(
                `"${entry.name}" isn't a saved text result -- browse here only opens .txt files.`, this.ERROR);
            return;
        }
        this.loadSavedTranscript(this.selectedBucket, entry.key);
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

    // --- Shared extraction ---

    private beginExtraction(): void {
        this.extracting = true;
        this.extractError = '';
        this.transcript = '';
        this.transcriptLoadedFromBucket = false;
        this.cleanError = '';
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
        this.copyToClipboard(this.transcript, 'Extracted text copied to clipboard.');
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

    // --- Content Clean ---

    /** Runs the extracted text through the existing Content Cleaner endpoint (see
     * ContentCleanerComponent) and replaces transcript with the cleaned result in place --
     * OCR output especially benefits from this (stray line breaks, smart quotes, hyphen-wrap
     * joins) before it's used as an AI prompt. */
    public cleanText(): void {
        if (!this.transcript) {
            return;
        }
        this.cleaning = true;
        this.cleanError = '';
        this.textCleanerService.clean(this.transcript)
            .pipe(first())
            .subscribe((response) => {
                this.cleaning = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.transcript = response.data;
                } else {
                    this.cleanError = response.message;
                }
            }, (error) => {
                this.cleaning = false;
                this.cleanError = 'Clean failed: ' + (error && error.message ? error.message : error);
            });
    }

    // --- Save to Bucket ---

    private suggestFolderName(): string {
        let stem = (this.sourceLabel || 'image').split('/').pop()
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .substring(0, 40) || 'image';
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
        this.imagePreviewUrl = null;
        this.clearSelection();
        this.sourceLabel = '';
        this.transcript = '';
        this.transcriptLoadedFromBucket = false;
        this.extractError = '';
        this.cleanError = '';
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
