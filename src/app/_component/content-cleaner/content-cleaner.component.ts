import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AlertService, StorageService, TextCleanerService } from '@/_services';
import { SpinnerService, extractPdfText } from '@/_helpers';
import { ApiCode, BucketSummary, ObjectSummary } from '@/_models';
import { fileExtension } from '@/_models/ai-agent.model';

const SUPPORTED_EXTENSIONS = ['pdf', 'csv', 'txt', 'json', 'xlsx', 'xml'];
const PAGE_SIZE = 100;

interface Breadcrumb {
    name: string;
    prefix: string;
}

/**
 * Turns raw file/paste content into a clean block of text ready to paste as an AI prompt --
 * three ways in: paste text directly, type a "bucket/key" path, or browse a bucket and click
 * a file (same extensions Object Browser's "Process with AI" targets). Extraction reuses the
 * same pdf.js/plain-text logic as Object Browser; cleaning itself is done server-side (see
 * TextCleanerRestApi/TextCleanerUtil in process) so a Source Task, Dynamic Form, or external
 * caller (e.g. the job-search Python listeners) can hit the same endpoint directly -- the URL
 * is shown in the UI to copy.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'content-cleaner',
    templateUrl: 'content-cleaner.component.html'
})
export class ContentCleanerComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public mode: 'paste' | 'path' | 'browse' = 'paste';
    public supportedExtensions = SUPPORTED_EXTENSIONS;

    // Paste mode
    public pastedText = '';

    // Path mode
    public pathInput = '';

    // Browse mode
    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

    // Shared extraction/clean state
    public sourceLabel = '';
    public extracting = false;
    public cleaning = false;
    public extractError = '';
    public rawText = '';
    public cleanedText = '';

    constructor(
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private storageService: StorageService,
        public textCleanerService: TextCleanerService) {
    }

    ngOnInit(): void {
        this.loadBuckets();
    }

    public setMode(mode: 'paste' | 'path' | 'browse'): void {
        this.mode = mode;
        this.extractError = '';
    }

    // --- Paste mode ---

    public cleanPastedText(): void {
        if (!this.pastedText || !this.pastedText.trim()) {
            this.alertService.showError('Paste some text first.', this.ERROR);
            return;
        }
        this.sourceLabel = 'Pasted text';
        this.rawText = this.pastedText;
        this.runClean();
    }

    // --- Path mode ---

    /** Accepts "bucket/key/path.ext" -- everything up to the first "/" is the bucket,
     * everything after is the object key. */
    public loadFromPath(): void {
        let path = (this.pathInput || '').trim().replace(/^\/+/, '');
        if (!path) {
            this.alertService.showError('Enter a path like "etl-bucket/folder/file.pdf".', this.ERROR);
            return;
        }
        let slashIndex = path.indexOf('/');
        if (slashIndex === -1) {
            this.alertService.showError('Path must include a bucket, e.g. "etl-bucket/file.txt".', this.ERROR);
            return;
        }
        let bucket = path.substring(0, slashIndex);
        let key = path.substring(slashIndex + 1);
        this.extractFromBucketKey(bucket, key, path);
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
        let extension = fileExtension(entry.name);
        if (SUPPORTED_EXTENSIONS.indexOf(extension) === -1) {
            this.alertService.showError(
                `"${entry.name}" isn't a supported type (${SUPPORTED_EXTENSIONS.join(', ')}).`, this.ERROR);
            return;
        }
        this.extractFromBucketKey(this.selectedBucket, entry.key, entry.name);
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

    private extractFromBucketKey(bucket: string, key: string, label: string): void {
        let extension = fileExtension(key);
        if (SUPPORTED_EXTENSIONS.indexOf(extension) === -1) {
            this.alertService.showError(
                `"${label}" isn't a supported type (${SUPPORTED_EXTENSIONS.join(', ')}).`, this.ERROR);
            return;
        }
        this.sourceLabel = `${bucket}/${key}`;
        this.extracting = true;
        this.extractError = '';
        this.rawText = '';
        this.cleanedText = '';
        let extraction$ = extension === 'pdf'
            ? this.storageService.previewObjectArrayBuffer(bucket, key).toPromise().then((buffer) => extractPdfText(buffer))
            : this.storageService.previewObjectText(bucket, key).toPromise();
        extraction$
            .then((text) => {
                this.extracting = false;
                if (!text || !text.trim()) {
                    this.extractError = 'No text could be extracted from this file.';
                    return;
                }
                this.rawText = text;
                this.runClean();
            })
            .catch((error) => {
                this.extracting = false;
                this.extractError = 'Could not read this file: ' + (error && error.message ? error.message : error);
            });
    }

    private runClean(): void {
        this.cleaning = true;
        this.cleanedText = '';
        this.textCleanerService.clean(this.rawText)
            .pipe(first())
            .subscribe((response) => {
                this.cleaning = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.cleanedText = response.data;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.cleaning = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public copyApiUrl(): void {
        this.copyToClipboard(this.textCleanerService.cleanUrl, 'API URL copied to clipboard.');
    }

    public get charsSaved(): number {
        return Math.max(0, (this.rawText || '').length - (this.cleanedText || '').length);
    }

    public copyCleanedText(): void {
        if (!this.cleanedText) {
            return;
        }
        this.copyToClipboard(this.cleanedText, 'Cleaned text copied to clipboard.');
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

    public clearAll(): void {
        this.pastedText = '';
        this.pathInput = '';
        this.sourceLabel = '';
        this.rawText = '';
        this.cleanedText = '';
        this.extractError = '';
    }

}
