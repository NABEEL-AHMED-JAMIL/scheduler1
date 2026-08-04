import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { AlertService, StorageService, AiAgentService } from '@/_services';
import { first } from 'rxjs/operators';
import { forkJoin, Observable } from 'rxjs';
import { ApiCode, ApiResponse, BucketSummary, ObjectSummary, ObjectMetadata } from '@/_models';
import { AiAgent, agentsForFile, fileExtension } from '@/_models/ai-agent.model';
import { extractPdfText } from '@/_helpers/pdf-text-extractor';

/** Any single file's extracted text is capped here before being sent to processText --
 * mirrors the backend's own MAX_TEXT_CHARS cap so the UI doesn't send more than the server will use. */
const MAX_AI_TEXT_CHARS = 60000;

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const PREVIEWABLE_EXTENSIONS = ['json', 'csv', 'txt', 'xml', 'pdf', 'mp3', 'm4a', 'mp4'].concat(IMAGE_EXTENSIONS);
const PAGE_SIZE = 50;
// Load the next page once the scroll container is within this many pixels of the bottom.
const SCROLL_FETCH_THRESHOLD_PX = 120;
// Stagger multi-file downloads so the browser doesn't silently drop near-simultaneous ones.
const BULK_DOWNLOAD_STAGGER_MS = 350;

interface Breadcrumb {
    name: string;
    prefix: string;
}

/**
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'object-browser',
    templateUrl: 'object-browser.component.html'
})
export class ObjectBrowserComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket: string | null = null;

    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];
    public objects: ObjectSummary[] = [];
    public nextContinuationToken: string | null = null;
    public loadingObjects = false;

    // search/filter (applied client-side over whatever's loaded so far)
    public searchName = '';
    public searchDateFrom = '';
    public searchDateTo = '';

    // multi-select (files and folders -- deleting a selected folder recurses into it)
    public selectedKeys: Set<string> = new Set();

    public selectedObject: ObjectSummary | null = null;
    public selectedObjectMetadata: ObjectMetadata | null = null;
    public loadingMetadata = false;

    public previewKind: 'json' | 'csv' | 'txt' | 'xml' | 'pdf' | 'mp3' | 'm4a' | 'mp4' | 'image' | null = null;
    public previewLoading = false;
    public previewError: string | null = null;
    public previewJson: string | null = null;
    public previewText: string | null = null;
    // Streamed source URL, shared by pdf (iframe), mp3/m4a (audio), mp4 (video), and
    // any image format (img) -- all of them just need a src to point their tag at.
    public previewMediaUrl: SafeResourceUrl | null = null;

    public uploading = false;

    // AI agent processing
    public agents: AiAgent[] = [];
    public selectedAiAgentId: any = null;
    public aiProcessing = false;
    public aiResult: string | null = null;
    public aiError: string | null = null;
    /** The file text actually extracted and sent as the user prompt -- shown alongside the
     * agent's instructions so you can see exactly what the model was given. */
    public aiExtractedText: string | null = null;
    /** When enabled, aiCustomPrompt is prepended to the extracted file content for this run
     * only -- lets you give one-off instructions without editing the agent's saved system prompt. */
    public useCustomPrompt = false;
    public aiCustomPrompt = '';

    // new-folder modal
    public newFolderName = '';

    // rename-folder modal
    public renameFolderEntry: ObjectSummary | null = null;
    public renameFolderNewName = '';

    // delete-confirm modal (shared by row delete, side-panel delete, and bulk delete)
    public pendingDeleteEntries: ObjectSummary[] = [];
    public pendingDeleteLabel = '';

    @ViewChild('fileInput', { static: false })
    public fileInput!: ElementRef<HTMLInputElement>;
    @ViewChild('closeNewFolderModal', { static: false })
    public closeNewFolderModal!: ElementRef<HTMLButtonElement>;
    @ViewChild('closeRenameModal', { static: false })
    public closeRenameModal!: ElementRef<HTMLButtonElement>;
    @ViewChild('closeDeleteModal', { static: false })
    public closeDeleteModal!: ElementRef<HTMLButtonElement>;

    constructor(
        private alertService: AlertService,
        private storageService: StorageService,
        private aiAgentService: AiAgentService,
        private sanitizer: DomSanitizer) {
    }

    ngOnInit() {
        this.loadBuckets();
        this.loadAgents();
    }

    // --- AI agent processing ---

    private loadAgents(): void {
        this.aiAgentService.fetchAllAgents()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.agents = response.data || [];
                }
            }, () => { /* non-blocking -- the "Process with AI" action just won't show without agents */ });
    }

    /** Active agents scoped to the currently selected file's extension. */
    public get agentsForSelectedObject(): AiAgent[] {
        if (!this.selectedObject) {
            return [];
        }
        return agentsForFile(this.agents, this.selectedObject.name);
    }

    /** The agent currently picked in the "Process with AI" modal -- used to show its
     * instructions (system prompt) alongside the extracted file content and the result.
     * Compared as strings: a plain (non-ngValue) <select> always emits the changed value
     * as a string, while agent.aiAgentId is a number, so a strict === here would go stale
     * (stick on the initial default) the moment the user picks a different agent. */
    public get selectedAiAgent(): AiAgent | null {
        return this.agents.find((agent) => String(agent.aiAgentId) === String(this.selectedAiAgentId)) || null;
    }

    /** Called when the "Process with AI" modal is opened -- defaults to the first matching agent. */
    public openAiModal(): void {
        this.aiResult = null;
        this.aiError = null;
        this.aiExtractedText = null;
        this.useCustomPrompt = false;
        this.aiCustomPrompt = '';
        const matches = this.agentsForSelectedObject;
        this.selectedAiAgentId = matches.length ? matches[0].aiAgentId : null;
    }

    /** Called when the agent dropdown selection changes -- clears the previous run's extracted
     * content/result so the modal doesn't keep showing another agent's stale prompt/output. */
    public onAiAgentChanged(): void {
        this.aiResult = null;
        this.aiError = null;
        this.aiExtractedText = null;
    }

    /** Runs the selected agent against the selected file. This is fire-and-forget from the
     * user's point of view -- a local model can take anywhere from ~30s (warm) to a few
     * minutes (cold reload), and there's no way to make that generation itself faster from
     * here, so instead of forcing the user to sit on the modal we let them close it and keep
     * browsing: the request keeps running against the file/agent captured at click time
     * (not whatever "this.selectedObject"/"this.selectedAiAgentId" happen to be by the time
     * it resolves), and a toast fires on completion either way so they're not left guessing. */
    public runAiAgent(): void {
        if (!this.selectedObject || !this.selectedAiAgentId || !this.selectedBucket) {
            return;
        }
        const targetEntry = this.selectedObject;
        const targetAgentId = this.selectedAiAgentId;
        const targetAgentName = (this.selectedAiAgent && this.selectedAiAgent.agentName) || 'Agent';
        const targetCustomPrompt = this.useCustomPrompt ? (this.aiCustomPrompt || '').trim() : '';
        this.aiResult = null;
        this.aiError = null;
        this.aiExtractedText = null;
        this.aiProcessing = true;
        this.extractTextForAi(targetEntry)
            .then((text) => {
                if (!text || !text.trim()) {
                    this.aiProcessing = false;
                    this.aiError = 'No text could be extracted from this file.';
                    return;
                }
                if (text.length > MAX_AI_TEXT_CHARS) {
                    text = text.substring(0, MAX_AI_TEXT_CHARS);
                }
                this.aiExtractedText = text;
                // A custom prompt is prepended for this run only -- the file content stays
                // exactly what's shown/copied under "Extracted File Content".
                const textToSend = targetCustomPrompt ? `${targetCustomPrompt}\n\n---\n\n${text}` : text;
                this.aiAgentService.processText(targetAgentId, targetEntry.name, textToSend)
                    .pipe(first())
                    .subscribe((response) => {
                        this.aiProcessing = false;
                        if (response.status === ApiCode.SUCCESS) {
                            this.aiResult = response.data;
                            this.alertService.showSuccess(
                                `${targetAgentName} finished processing "${targetEntry.name}".`, this.SUCCESS);
                        } else {
                            this.aiError = response.message;
                            this.alertService.showError(
                                `${targetAgentName} failed on "${targetEntry.name}": ${response.message}`, this.ERROR);
                        }
                    }, (error) => {
                        this.aiProcessing = false;
                        this.aiError = error;
                        this.alertService.showError(`${targetAgentName} failed on "${targetEntry.name}".`, this.ERROR);
                    });
            })
            .catch((error) => {
                this.aiProcessing = false;
                this.aiError = 'Could not read this file: ' + (error && error.message ? error.message : error);
            });
    }

    /** Extracts plain text from a file ahead of sending it to an AI agent -- PDFs are parsed
     * client-side with pdf.js (same as PDF Highlighter); everything else is read as raw text,
     * which works for csv/txt/json/xml but not for genuinely binary formats like xlsx. */
    private extractTextForAi(entry: ObjectSummary): Promise<string> {
        const extension = fileExtension(entry.name);
        if (extension === 'pdf') {
            return this.storageService.previewObjectArrayBuffer(this.selectedBucket, entry.key)
                .toPromise().then((buffer) => extractPdfText(buffer));
        }
        return this.storageService.previewObjectText(this.selectedBucket, entry.key).toPromise();
    }

    // --- Buckets ---

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
        this.closePanel();
        this.clearSelection();
        this.currentPrefix = '';
        this.breadcrumbs = [];
        this.objects = [];
        this.nextContinuationToken = null;
        this.resetSearch();
        if (this.selectedBucket) {
            this.loadObjects(true);
        }
    }

    // --- Folders/objects listing ---

    public loadObjects(reset: boolean): void {
        if (!this.selectedBucket || this.loadingObjects) {
            return;
        }
        if (!reset && !this.nextContinuationToken) {
            return;
        }
        this.loadingObjects = true;
        const token = reset ? null : this.nextContinuationToken;
        this.storageService.listObjects(this.selectedBucket, this.currentPrefix, token, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingObjects = false;
                if (response.status === ApiCode.SUCCESS) {
                    const page = response.data || {};
                    this.objects = reset ? (page.objects || []) : this.objects.concat(page.objects || []);
                    this.nextContinuationToken = page.nextContinuationToken || null;
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingObjects = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    /** Infinite scroll: fetch the next page once the user scrolls near the bottom of the table. */
    public onTableScroll(event: Event): void {
        const el = event.target as HTMLElement;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_FETCH_THRESHOLD_PX;
        if (nearBottom) {
            this.loadObjects(false);
        }
    }

    /**
     * Row click handler. Ignores clicks that originated from the row-actions cell instead
     * of calling stopPropagation() on those buttons -- Rename/Delete rely on Bootstrap's
     * data-toggle="modal" data-api, which listens on `document` and only fires if the click
     * actually bubbles that far; stopPropagation() on the button itself would silently kill
     * the modal before it ever opens.
     */
    public openEntry(entry: ObjectSummary, event: Event): void {
        if ((event.target as HTMLElement).closest('.row-actions')) {
            return;
        }
        if (entry.folder) {
            this.openFolder(entry);
        } else {
            this.selectObject(entry);
        }
    }

    private openFolder(entry: ObjectSummary): void {
        this.closePanel();
        this.clearSelection();
        this.currentPrefix = entry.key;
        this.breadcrumbs = [...this.breadcrumbs, { name: entry.name, prefix: entry.key }];
        this.objects = [];
        this.nextContinuationToken = null;
        this.resetSearch();
        this.loadObjects(true);
    }

    public goToBreadcrumb(index: number): void {
        this.closePanel();
        this.clearSelection();
        if (index < 0) {
            this.currentPrefix = '';
            this.breadcrumbs = [];
        } else {
            this.currentPrefix = this.breadcrumbs[index].prefix;
            this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        }
        this.objects = [];
        this.nextContinuationToken = null;
        this.resetSearch();
        this.loadObjects(true);
    }

    // --- Search / filter (client-side, over whatever's loaded so far) ---

    public get filteredObjects(): ObjectSummary[] {
        const term = (this.searchName || '').trim().toLowerCase();
        const from = this.searchDateFrom ? new Date(this.searchDateFrom).getTime() : null;
        const to = this.searchDateTo ? new Date(this.searchDateTo).getTime() + (24 * 60 * 60 * 1000 - 1) : null;
        return this.objects.filter((entry) => {
            if (term && entry.name.toLowerCase().indexOf(term) === -1) {
                return false;
            }
            if ((from || to) && !entry.folder) {
                const modified = entry.lastModified ? new Date(entry.lastModified).getTime() : null;
                if (modified === null) {
                    return false;
                }
                if (from && modified < from) {
                    return false;
                }
                if (to && modified > to) {
                    return false;
                }
            }
            return true;
        });
    }

    public get isFiltering(): boolean {
        return !!(this.searchName || this.searchDateFrom || this.searchDateTo);
    }

    public resetSearch(): void {
        this.searchName = '';
        this.searchDateFrom = '';
        this.searchDateTo = '';
    }

    // --- Multi-select (files and folders) ---

    public toggleSelect(entry: ObjectSummary, event: Event): void {
        event.stopPropagation();
        if (this.selectedKeys.has(entry.key)) {
            this.selectedKeys.delete(entry.key);
        } else {
            this.selectedKeys.add(entry.key);
        }
    }

    public isSelected(entry: ObjectSummary): boolean {
        return this.selectedKeys.has(entry.key);
    }

    public get selectableVisibleCount(): number {
        return this.filteredObjects.length;
    }

    public get allVisibleSelected(): boolean {
        const selectable = this.filteredObjects;
        return selectable.length > 0 && selectable.every((entry) => this.selectedKeys.has(entry.key));
    }

    public toggleSelectAll(event: Event): void {
        event.stopPropagation();
        const checked = (event.target as HTMLInputElement).checked;
        this.filteredObjects.forEach((entry) => {
            if (checked) {
                this.selectedKeys.add(entry.key);
            } else {
                this.selectedKeys.delete(entry.key);
            }
        });
    }

    public clearSelection(): void {
        this.selectedKeys.clear();
    }

    /** Downloads whichever selected items are files -- folders can't be downloaded as a single file (no zip support). */
    public downloadSelectedBulk(): void {
        const fileKeys = this.objects.filter((entry) => !entry.folder && this.selectedKeys.has(entry.key)).map((entry) => entry.key);
        if (!fileKeys.length) {
            return;
        }
        fileKeys.forEach((key, index) => {
            setTimeout(() => this.triggerDownload(key), index * BULK_DOWNLOAD_STAGGER_MS);
        });
    }

    /** Opens the shared delete-confirm modal (data-toggle on the triggering button) for the bulk selection. */
    public requestDeleteBulk(): void {
        const entries = this.objects.filter((entry) => this.selectedKeys.has(entry.key));
        if (!entries.length) {
            return;
        }
        this.pendingDeleteEntries = entries;
        this.pendingDeleteLabel = `${entries.length} selected item(s)`;
    }

    // --- Object side panel (metadata + preview) ---

    private selectObject(entry: ObjectSummary): void {
        this.selectedObject = entry;
        this.selectedObjectMetadata = null;
        this.resetPreview();
        this.loadingMetadata = true;
        this.storageService.objectMetadata(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((response) => {
                this.loadingMetadata = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.selectedObjectMetadata = response.data;
                    this.loadPreview(entry);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingMetadata = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    private loadPreview(entry: ObjectSummary): void {
        const extension = this.extensionOf(entry.name);
        if (PREVIEWABLE_EXTENSIONS.indexOf(extension) === -1) {
            this.previewKind = null;
            return;
        }
        if (IMAGE_EXTENSIONS.indexOf(extension) !== -1) {
            this.previewKind = 'image';
            this.previewMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
                this.storageService.previewObjectUrl(this.selectedBucket, entry.key));
            return;
        }
        this.previewKind = extension as 'json' | 'csv' | 'txt' | 'xml' | 'pdf' | 'mp3' | 'm4a' | 'mp4';
        if (extension === 'pdf' || extension === 'mp3' || extension === 'm4a' || extension === 'mp4') {
            this.previewMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
                this.storageService.previewObjectUrl(this.selectedBucket, entry.key));
            return;
        }
        this.previewLoading = true;
        this.storageService.previewObjectText(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((text) => {
                this.previewLoading = false;
                if (extension === 'json') {
                    try {
                        this.previewJson = JSON.stringify(JSON.parse(text), null, 2);
                    } catch (e) {
                        this.previewJson = text;
                    }
                } else if (extension === 'csv' || extension === 'txt' || extension === 'xml') {
                    // CSV/XML shown as plain text (not parsed), same as .txt.
                    this.previewText = text;
                }
            }, () => {
                this.previewLoading = false;
                this.previewError = 'Could not load preview for this file.';
            });
    }

    private resetPreview(): void {
        this.previewKind = null;
        this.previewLoading = false;
        this.previewError = null;
        this.previewJson = null;
        this.previewText = null;
        this.previewMediaUrl = null;
    }

    public closePanel(): void {
        this.selectedObject = null;
        this.selectedObjectMetadata = null;
        this.resetPreview();
    }

    /** Downloads a single row's file (row action icon, files only). */
    public downloadEntry(entry: ObjectSummary, event: Event): void {
        this.triggerDownload(entry.key);
    }

    /** Copies a row's full bucket path (file or folder key) to the clipboard. */
    public copyPath(entry: ObjectSummary, event: Event): void {
        this.copyToClipboard(entry.key, 'Path copied to clipboard.');
    }

    /** Copies the currently previewed json/csv/txt file's full content to the clipboard. */
    public copyPreviewContent(): void {
        const content = this.previewKind === 'json' ? this.previewJson : this.previewText;
        if (!content) {
            return;
        }
        this.copyToClipboard(content, 'Content copied to clipboard.');
    }

    /** Copies the AI agent's result from the "Process with AI" modal to the clipboard. */
    public copyAiResult(): void {
        if (!this.aiResult) {
            return;
        }
        this.copyToClipboard(this.aiResult, 'Result copied to clipboard.');
    }

    /** Copies the raw extracted file content (not including any custom prompt) to the clipboard. */
    public copyExtractedText(): void {
        if (!this.aiExtractedText) {
            return;
        }
        this.copyToClipboard(this.aiExtractedText, 'Extracted content copied to clipboard.');
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
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            this.alertService.showSuccess(successMessage, this.SUCCESS);
        } catch (e) {
            this.alertService.showError('Could not copy to clipboard.', this.ERROR);
        } finally {
            document.body.removeChild(textarea);
        }
    }

    /** Opens the shared delete-confirm modal for a single row's delete icon (file or folder). */
    public requestDeleteEntry(entry: ObjectSummary, event: Event): void {
        this.pendingDeleteEntries = [entry];
        this.pendingDeleteLabel = entry.folder
            ? `"${entry.name}" and everything inside it`
            : `"${entry.name}"`;
    }

    /**
     * Runs the actual delete once the user confirms in the modal, then closes it. Files are
     * batched into one bulk delete; each folder needs its own recursive deleteFolder call.
     */
    public confirmDelete(): void {
        const entries = this.pendingDeleteEntries;
        if (!entries.length || !this.selectedBucket) {
            return;
        }
        const fileKeys = entries.filter((entry) => !entry.folder).map((entry) => entry.key);
        const folderEntries = entries.filter((entry) => entry.folder);

        const requests: Observable<ApiResponse>[] = [];
        if (fileKeys.length === 1) {
            requests.push(this.storageService.deleteObject(this.selectedBucket, fileKeys[0]));
        } else if (fileKeys.length > 1) {
            requests.push(this.storageService.deleteObjects(this.selectedBucket, fileKeys));
        }
        folderEntries.forEach((folder) => requests.push(this.storageService.deleteFolder(this.selectedBucket, folder.key)));

        if (!requests.length) {
            return;
        }

        forkJoin(requests).pipe(first()).subscribe((responses) => {
            const deletedKeys = entries.map((entry) => entry.key);
            this.objects = this.objects.filter((entry) => deletedKeys.indexOf(entry.key) === -1);
            deletedKeys.forEach((key) => this.selectedKeys.delete(key));
            if (this.selectedObject && deletedKeys.indexOf(this.selectedObject.key) !== -1) {
                this.closePanel();
            }
            const failed = responses.filter((response) => response.status !== ApiCode.SUCCESS);
            if (failed.length) {
                this.alertService.showError(failed.map((response) => response.message).join(' '), this.ERROR);
            } else {
                this.alertService.showSuccess('Deleted successfully.', this.SUCCESS);
            }
            this.pendingDeleteEntries = [];
            this.closeModal(this.closeDeleteModal);
        }, (error) => {
            this.alertService.showError(error, this.ERROR);
            this.pendingDeleteEntries = [];
            this.closeModal(this.closeDeleteModal);
        });
    }

    private triggerDownload(key: string): void {
        const link = document.createElement('a');
        link.href = this.storageService.downloadObjectUrl(this.selectedBucket, key);
        link.download = '';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // --- Create folder ---

    /** Called by the New Folder modal's Create button. */
    public confirmCreateFolder(): void {
        if (!this.selectedBucket || !this.newFolderName || !this.newFolderName.trim()) {
            return;
        }
        this.storageService.createFolder(this.selectedBucket, this.currentPrefix, this.newFolderName.trim())
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.newFolderName = '';
                    this.loadObjects(true);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.closeModal(this.closeNewFolderModal);
            }, (error) => {
                this.alertService.showError(error, this.ERROR);
                this.closeModal(this.closeNewFolderModal);
            });
    }

    private closeModal(closeButton: ElementRef<HTMLButtonElement> | undefined): void {
        if (closeButton) {
            closeButton.nativeElement.click();
        }
    }

    // --- Rename folder ---

    /** Opens the rename modal (data-toggle on the triggering button) for a folder row. */
    public requestRenameFolder(entry: ObjectSummary, event: Event): void {
        this.renameFolderEntry = entry;
        this.renameFolderNewName = entry.name;
    }

    /** Called by the Rename modal's Rename button. */
    public confirmRenameFolder(): void {
        const entry = this.renameFolderEntry;
        if (!entry || !this.selectedBucket || !this.renameFolderNewName || !this.renameFolderNewName.trim()) {
            return;
        }
        this.storageService.renameFolder(this.selectedBucket, entry.key, this.renameFolderNewName.trim())
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.selectedKeys.delete(entry.key);
                    this.loadObjects(true);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
                this.renameFolderEntry = null;
                this.closeModal(this.closeRenameModal);
            }, (error) => {
                this.alertService.showError(error, this.ERROR);
                this.renameFolderEntry = null;
                this.closeModal(this.closeRenameModal);
            });
    }

    // --- Upload ---

    public triggerUpload(): void {
        if (this.fileInput) {
            this.fileInput.nativeElement.click();
        }
    }

    public onFilesSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const files = input.files;
        if (!files || !files.length || !this.selectedBucket) {
            return;
        }
        this.uploading = true;
        const uploadNext = (index: number) => {
            if (index >= files.length) {
                this.uploading = false;
                input.value = '';
                this.loadObjects(true);
                return;
            }
            this.storageService.uploadObject(this.selectedBucket, this.currentPrefix, files[index])
                .pipe(first())
                .subscribe((response) => {
                    if (response.status !== ApiCode.SUCCESS) {
                        this.alertService.showError(response.message, this.ERROR);
                    }
                    uploadNext(index + 1);
                }, (error) => {
                    this.alertService.showError(error, this.ERROR);
                    uploadNext(index + 1);
                });
        };
        uploadNext(0);
    }

    private extensionOf(name: string): string {
        if (!name) {
            return '';
        }
        const dot = name.lastIndexOf('.');
        return dot >= 0 && dot < name.length - 1 ? name.substring(dot + 1).toLowerCase() : '';
    }

    public formatSize(bytes: any): string {
        if (bytes === null || bytes === undefined) {
            return '-';
        }
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        let size = Number(bytes);
        let unitIndex = 0;
        while (size >= 1024 && unitIndex < units.length - 1) {
            size = size / 1024;
            unitIndex++;
        }
        return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
    }

}
