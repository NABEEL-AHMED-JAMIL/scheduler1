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

@Component({
    selector: 'content-cleaner',
    templateUrl: 'content-cleaner.component.html'
})
export class ContentCleanerComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public mode: 'paste' | 'browse' = 'paste';
    public supportedExtensions = SUPPORTED_EXTENSIONS;

    public pastedText = '';

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

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

    public setMode(mode: 'paste' | 'browse'): void {
        this.mode = mode;
        this.extractError = '';
    }

    public cleanPastedText(): void {
        if (!this.pastedText || !this.pastedText.trim()) {
            this.alertService.showError('Paste some text first.', this.ERROR);
            return;
        }
        this.sourceLabel = 'Pasted text';
        this.rawText = this.pastedText;
        this.runClean();
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
        this.sourceLabel = '';
        this.rawText = '';
        this.cleanedText = '';
        this.extractError = '';
    }

}
