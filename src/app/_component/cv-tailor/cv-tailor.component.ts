import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { saveAs } from 'file-saver';
import { AlertService, AiAgentService, StorageService, TextCleanerService } from '@/_services';
import { ApiCode, BucketSummary, ObjectSummary } from '@/_models';
import { CV_TAILOR_SUPPORTED_EXTENSIONS } from '@/_models/cv-tailor.model';
import { AiAgent, fileExtension } from '@/_models/ai-agent.model';
import { extractPdfText } from '@/_helpers/pdf-text-extractor';

// marked has no bundled TypeScript types in the version installed here -- same "require as any"
// approach pdf-text-extractor.ts already uses for pdfjs-dist.
// tslint:disable-next-line:no-var-requires
const marked: any = require('marked');

const PAGE_SIZE = 100;

/** Sent as the processText instructions override (see AiAgentService#processText) so this
 * works out of the box with any active agent, regardless of that agent's own saved
 * instructions -- the same "one-off prompt override" pattern the Ask AI panels use. Asks for
 * plain, simple Markdown (headings/bold/bullets only) specifically so it converts cleanly to
 * PDF later and renders well in the in-app preview. */
const TAILOR_INSTRUCTIONS = `You are an expert resume/CV writer helping a candidate tailor their resume to a specific job description.
Given the job description and the candidate's original resume below, rewrite the resume as a clean, well-structured Markdown document that reads like a professional resume and converts cleanly to PDF.

Formatting rules:
- Start with a level-1 heading (# Full Name) if the name is known from the original resume, otherwise omit it.
- Use level-2 headings (## Summary, ## Experience, ## Education, ## Skills, etc.) for each section, matching the original resume's sections (add or rename a section only if clearly appropriate).
- Use "- " bullet points for experience/skill bullet points, and **bold** for job titles, company names, and degree names where natural.
- Do not use tables, images, or nested/complex markdown that would render awkwardly when converted to PDF -- keep it simple: headings, bold text, bullet lists, and plain paragraphs only.

Content rules:
- Emphasize relevant skills and experience already present, and use keywords and phrasing from the job description where truthfully supported by the original content.
- Tighten bullet points for relevance; remove or shorten content that isn't relevant to this job.
- Where the resume implies a skill or responsibility the job description cares about but never states it explicitly (for example, the candidate clearly led a project but never used the word "leadership"), add a brand-new bullet point that says so.
- Never invent employers, job titles, dates, certifications, degrees, or skills the candidate doesn't already have some basis for in the original resume.

Output ONLY the Markdown document itself -- no commentary, no surrounding code fence, no headers like "Here is the tailored resume".`;

interface Breadcrumb {
    name: string;
    prefix: string;
}

/**
 * Tailors an uploaded (or bucket-picked) PDF resume to a pasted job description: an AI agent
 * rewrites the resume as Markdown (chosen so the result converts cleanly to PDF and renders
 * nicely), and every run replaces the previous result outright -- re-upload a resume or edit
 * the job description and click Tailor again for a fresh version. The result can be viewed as
 * raw Markdown or a rendered preview, downloaded as a .md file, or saved (along with the job
 * description) to a bucket.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'cv-tailor',
    templateUrl: 'cv-tailor.component.html'
})
export class CvTailorComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public jobDescription = '';
    // Content Clean -- reuses the existing Content Cleaner feature (TextCleanerService, see
    // content-cleaner.component.ts / image-text-extractor.component.ts) to tidy up a pasted
    // job description (stray whitespace, smart quotes, copy-paste artifacts from a job board)
    // before it's used as part of the tailoring prompt.
    public cleaningJd = false;
    public cleanJdError = '';

    public mode: 'upload' | 'browse' = 'upload';
    public supportedExtensions = CV_TAILOR_SUPPORTED_EXTENSIONS;

    // Upload mode
    public selectedFile: File = null;

    // Browse mode (pick an existing .pdf resume from a bucket)
    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];

    // Original resume text, extracted client-side from the picked PDF
    public cvSourceLabel = '';
    public extractingCv = false;
    public extractError = '';
    public originalCvText = '';

    // AI Agent picker
    public agents: AiAgent[] = [];
    public loadingAgents = false;
    public selectedAgentId: any = '';

    // Tailoring result -- Markdown, plus its rendered HTML preview
    public tailoring = false;
    public tailorError = '';
    public newCvMarkdown = '';
    public previewHtml = '';
    public viewMode: 'preview' | 'markdown' = 'preview';

    // Save-to-bucket panel -- shared by "save job description" and "save new resume"
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

    // --- Content Clean (Job Description) ---

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
        this.beginCvExtraction(file.name);
        file.arrayBuffer().then((buffer: ArrayBuffer) => {
            extractPdfText(buffer).then((text) => this.finishCvExtraction(text), (error) => this.handleCvExtractError(error));
        }, (error: any) => this.handleCvExtractError(error));
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

    // --- Shared CV text extraction ---

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

    // --- AI Agent picker + tailoring ---

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

    /** Re-runs on every click -- there's no partial/incremental state, just today's full
     * result replacing whatever was there before (re-upload a resume and/or edit the job
     * description, then Tailor again for a fresh version). */
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
        this.aiAgentService.processText(this.selectedAgentId, this.cvSourceLabel, text, TAILOR_INSTRUCTIONS)
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

    /** Some models wrap their output in a ```markdown ... ``` fence despite being told not
     * to -- strip it if present so both the raw-text view and the rendered preview show just
     * the resume itself. */
    private stripCodeFence(text: string): string {
        let trimmed = text.trim();
        let match = trimmed.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i);
        return match ? match[1].trim() : trimmed;
    }

    public setViewMode(mode: 'preview' | 'markdown'): void {
        this.viewMode = mode;
    }

    // --- Copy to clipboard / download ---

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

    /** Local download, no bucket involved -- lets the user immediately drop the .md file into
     * any Markdown-to-PDF converter. */
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

    // --- Save to Bucket ---

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
