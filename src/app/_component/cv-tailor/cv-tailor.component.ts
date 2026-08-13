import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { saveAs } from 'file-saver';
import { AlertService, AiAgentService, StorageService, TextCleanerService } from '@/_services';
import { ApiCode, BucketSummary, ObjectSummary } from '@/_models';
import { CV_TAILOR_PROMPTS, CV_TAILOR_SUPPORTED_EXTENSIONS, CvTailorPromptOption } from '@/_models/cv-tailor.model';
import { AiAgent, fileExtension } from '@/_models/ai-agent.model';
import { extractPdfText } from '@/_helpers/pdf-text-extractor';

const marked: any = require('marked');

const PAGE_SIZE = 100;

interface Breadcrumb {
    name: string;
    prefix: string;
}

@Component({
    selector: 'cv-tailor',
    templateUrl: 'cv-tailor.component.html'
})
export class CvTailorComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public jobDescription = '';

    public cleaningJd = false;
    public cleanJdError = '';

    public mode: 'upload' | 'browse' = 'upload';
    public supportedExtensions = CV_TAILOR_SUPPORTED_EXTENSIONS;

    public selectedFile: File = null;

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

    public cvSourceLabel = '';
    public extractingCv = false;
    public extractError = '';
    public originalCvText = '';

    public agents: AiAgent[] = [];
    public loadingAgents = false;
    public selectedAgentId: any = '';

    public prompts: CvTailorPromptOption[] = CV_TAILOR_PROMPTS;
    public selectedPromptKey: string = CV_TAILOR_PROMPTS[0].key;

    public tailoring = false;
    public tailorError = '';
    public newCvMarkdown = '';
    public previewHtml = '';
    public viewMode: 'preview' | 'markdown' = 'preview';

    public saveBucket = '';
    public saveFolderName = '';
    public saveFolderExists = false;
    public savingJd = false;
    public jdSavedPath = '';
    public saveJdError = '';
    public savingCv = false;
    public cvSavedPath = '';
    public saveCvError = '';

    constructor(
        private alertService: AlertService,
        private storageService: StorageService,
        private aiAgentService: AiAgentService,
        private textCleanerService: TextCleanerService) {
    }

    ngOnInit(): void {
        this.loadBuckets();
        this.loadAgents();
    }

    public cleanJobDescription(): void {
        if (!this.jobDescription) {
            return;
        }
        this.cleaningJd = true;
        this.cleanJdError = '';
        this.textCleanerService.clean(this.jobDescription)
            .pipe(first())
            .subscribe((response) => {
                this.cleaningJd = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.jobDescription = response.data;
                } else {
                    this.cleanJdError = response.message;
                }
            }, (error) => {
                this.cleaningJd = false;
                this.cleanJdError = 'Clean failed: ' + (error && error.message ? error.message : error);
            });
    }

    public setMode(mode: 'upload' | 'browse'): void {
        this.mode = mode;
        this.extractError = '';
    }

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
        this.beginCvExtraction(file.name);
        file.arrayBuffer().then((buffer: ArrayBuffer) => {
            extractPdfText(buffer).then((text) => this.finishCvExtraction(text), (error) => this.handleCvExtractError(error));
        }, (error: any) => this.handleCvExtractError(error));
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
        if (!this.hasExtension(entry.name, this.supportedExtensions)) {
            this.alertService.showError(
                `"${entry.name}" isn't a supported type (${this.supportedExtensions.join(', ')}).`, this.ERROR);
            return;
        }
        let bucket = this.selectedBucket;
        this.beginCvExtraction(`${bucket}/${entry.key}`);
        this.storageService.previewObjectArrayBuffer(bucket, entry.key)
            .pipe(first())
            .subscribe((buffer) => {
                extractPdfText(buffer).then((text) => this.finishCvExtraction(text), (error) => this.handleCvExtractError(error));
            }, (error) => this.handleCvExtractError(error));
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

    private beginCvExtraction(sourceLabel: string): void {
        this.cvSourceLabel = sourceLabel;
        this.extractingCv = true;
        this.extractError = '';
        this.originalCvText = '';
        this.resetTailoring();
    }

    private finishCvExtraction(text: string): void {
        this.extractingCv = false;
        if (!text || !text.trim()) {
            this.extractError = 'No text could be extracted from this PDF.';
            return;
        }
        this.originalCvText = text;
    }

    private handleCvExtractError(error: any): void {
        this.extractingCv = false;
        this.extractError = 'Could not read this PDF: ' + (error && error.message ? error.message : error);
    }

    private hasExtension(fileName: string, extensions: string[]): boolean {
        return extensions.indexOf(fileExtension(fileName)) > -1;
    }

    private resetTailoring(): void {
        this.tailorError = '';
        this.newCvMarkdown = '';
        this.previewHtml = '';
        this.viewMode = 'preview';
        this.saveBucket = '';
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.jdSavedPath = '';
        this.saveJdError = '';
        this.cvSavedPath = '';
        this.saveCvError = '';
    }

    public get selectedPrompt(): CvTailorPromptOption {
        return this.prompts.find((p) => p.key === this.selectedPromptKey) || this.prompts[0];
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

    public tailorCv(): void {
        if (!this.originalCvText) {
            this.alertService.showError('Upload or pick a PDF resume first.', this.ERROR);
            return;
        }
        if (!this.jobDescription || !this.jobDescription.trim()) {
            this.alertService.showError('Paste the job description first.', this.ERROR);
            return;
        }
        if (!this.selectedAgentId) {
            this.alertService.showError('Select an AI Agent.', this.ERROR);
            return;
        }
        this.tailoring = true;
        this.tailorError = '';
        this.newCvMarkdown = '';
        this.previewHtml = '';
        let text = `Job Description:\n${this.jobDescription.trim()}\n\n---\n\nOriginal Resume:\n${this.originalCvText}`;
        this.aiAgentService.processText(this.selectedAgentId, this.cvSourceLabel, text, this.selectedPrompt.instructions)
            .pipe(first())
            .subscribe((response) => {
                this.tailoring = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.newCvMarkdown = this.stripCodeFence(response.data || '');
                    this.previewHtml = marked.parse(this.newCvMarkdown);
                    this.viewMode = 'preview';
                    this.saveFolderName = this.suggestFolderName();
                } else {
                    this.tailorError = response.message;
                }
            }, (error) => {
                this.tailoring = false;
                this.tailorError = 'Tailoring failed: ' + (error && error.message ? error.message : error);
            });
    }

    private stripCodeFence(text: string): string {
        let trimmed = text.trim();
        let match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
        return match ? match[1].trim() : trimmed;
    }

    public setViewMode(mode: 'preview' | 'markdown'): void {
        this.viewMode = mode;
    }

    public copyJobDescription(): void {
        if (!this.jobDescription) {
            return;
        }
        this.copyToClipboard(this.jobDescription, 'Job description copied to clipboard.');
    }

    public copyNewCv(): void {
        if (!this.newCvMarkdown) {
            return;
        }
        this.copyToClipboard(this.newCvMarkdown, 'New resume (Markdown) copied to clipboard.');
    }

    public downloadMarkdown(): void {
        if (!this.newCvMarkdown) {
            return;
        }
        let stem = (this.cvSourceLabel || 'resume').split('/').pop()
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .substring(0, 40) || 'resume';
        let file = new Blob([this.newCvMarkdown], { type: 'text/markdown;charset=utf-8' });
        saveAs(file, `${stem}_tailored_resume.md`);
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
        let stem = (this.cvSourceLabel || 'resume').split('/').pop()
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-zA-Z0-9_-]+/g, '_')
            .substring(0, 40) || 'resume';
        let stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `${stem}_tailored_${stamp}`;
    }

    public saveJdToBucket(): void {
        if (!this.jobDescription || !this.validateSaveTarget()) {
            return;
        }
        this.savingJd = true;
        this.saveJdError = '';
        this.jdSavedPath = '';
        this.saveTextToBucketFolder(this.saveBucket, this.saveFolderName.trim(), 'job_description.txt', this.jobDescription, 'text/plain', this.saveFolderExists,
            (path) => {
                this.savingJd = false;
                this.jdSavedPath = path;
            },
            (message) => {
                this.savingJd = false;
                this.saveJdError = message;
            });
    }

    public saveNewCvToBucket(): void {
        if (!this.newCvMarkdown || !this.validateSaveTarget()) {
            return;
        }
        this.savingCv = true;
        this.saveCvError = '';
        this.cvSavedPath = '';
        this.saveTextToBucketFolder(this.saveBucket, this.saveFolderName.trim(), 'tailored_resume.md', this.newCvMarkdown, 'text/markdown', this.saveFolderExists,
            (path) => {
                this.savingCv = false;
                this.cvSavedPath = path;
            },
            (message) => {
                this.savingCv = false;
                this.saveCvError = message;
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

    private saveTextToBucketFolder(bucket: string, folderPrefix: string, fileName: string, content: string, contentType: string, folderExists: boolean,
        onSuccess: (path: string) => void, onError: (message: string) => void): void {
        let doUpload = () => {
            let file = new File([content], fileName, { type: contentType });
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
        this.jobDescription = '';
        this.selectedFile = null;
        this.cvSourceLabel = '';
        this.extractError = '';
        this.originalCvText = '';
        this.resetTailoring();
    }

}
