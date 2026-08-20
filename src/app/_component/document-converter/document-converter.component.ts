import { Component, OnDestroy, OnInit } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { first } from 'rxjs/operators';
import { AlertService, DocumentConverterService, StorageService } from '@/_services';
import { SpinnerService, SearchFilterPipe } from '@/_helpers';
import { ApiCode } from '@/_models';
import { BucketSummary, ObjectSummary } from '@/_models/object';
import {
    DocumentConverterConvertResult,
    DocumentConverterFormatFamily,
    DocumentConverterTask
} from '@/_models/document-converter.model';
import { formatBytes } from '@/_models/ollama.model';

type PreviewKind = 'pdf' | 'image' | 'text' | 'html';

const PREVIEWABLE_EXTENSIONS: { [ext: string]: PreviewKind } = {
    pdf: 'pdf', jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', svg: 'image', bmp: 'image',
    txt: 'text', csv: 'text', tsv: 'text',
    html: 'html'
};

const PAGE_SIZE = 100;

const FAMILY_ICONS: { [key: string]: string } = {
    TEXT: 'glyphicon-file',
    SPREADSHEET: 'glyphicon-th',
    PRESENTATION: 'glyphicon-facetime-video',
    DRAWING: 'glyphicon-picture',
    OTHER: 'glyphicon-globe'
};

interface Breadcrumb {
    name: string;
    prefix: string;
}

@Component({
    selector: 'document-converter',
    templateUrl: 'document-converter.component.html'
})
export class DocumentConverterComponent implements OnInit, OnDestroy {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public formatFamilies: DocumentConverterFormatFamily[] = [];
    public loadingFormats = false;
    public showFormatsReference = false;

    public mode: 'upload' | 'browse' = 'upload';

    public browseBucket = '';
    public browseObjects: ObjectSummary[] = [];
    public loadingBrowseObjects = false;
    public browseCurrentPrefix = '';
    public browseBreadcrumbs: Breadcrumb[] = [];
    public browseSelectedEntry: ObjectSummary = null;
    public loadingSelectedFile = false;

    public selectedFile: File | null = null;
    public outputFormat = '';
    public saveToBucket = false;
    public taskName = '';
    public buckets: BucketSummary[] = [];
    public selectedBucket = '';
    public converting = false;
    public result: DocumentConverterConvertResult | null = null;

    public saveFolder = '';
    public saveFolderExists = false;
    public saveBrowsing = false;
    public saveCurrentPrefix = '';
    public saveBreadcrumbs: Breadcrumb[] = [];
    public saveFolders: ObjectSummary[] = [];
    public loadingSaveFolders = false;

    public resultPreviewSide: 'input' | 'output' | null = null;

    public inputPreviewUrl: SafeResourceUrl | null = null;
    public inputPreviewKind: PreviewKind | null = null;
    public inputPreviewText: string | null = null;
    private inputPreviewObjectUrl: string | null = null;

    public outputPreviewUrl: SafeResourceUrl | null = null;
    public outputPreviewKind: PreviewKind | null = null;
    public outputPreviewText: string | null = null;
    private outputPreviewObjectUrl: string | null = null;

    public tasks: DocumentConverterTask[] = [];
    public searchTasks: any = '';
    public deleteTarget: DocumentConverterTask | null = null;

    public previewTask: DocumentConverterTask | null = null;
    public previewSide: 'input' | 'output' | null = null;
    public previewKind: PreviewKind | null = null;
    public previewUrl: SafeResourceUrl | null = null;
    public previewText: string | null = null;
    public previewLoading = false;
    private previewObjectUrl: string | null = null;

    constructor(
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private documentConverterService: DocumentConverterService,
        private storageService: StorageService,
        private sanitizer: DomSanitizer,
        private searchFilterPipe: SearchFilterPipe) {
    }

    ngOnInit(): void {
        this.loadSupportedFormats();
        this.loadBuckets();
        this.listTasks();
    }

    ngOnDestroy(): void {
        this.revokeInputPreview();
        this.revokeOutputPreview();
        this.revokePreviewObjectUrl();
    }

    public get filteredTasks(): DocumentConverterTask[] {
        return this.searchFilterPipe.transform(this.tasks, this.searchTasks) || [];
    }

    public formatBytes = formatBytes;

    public familyIcon(key: string): string {
        return FAMILY_ICONS[key] || 'glyphicon-file';
    }

    public get totalInputBytes(): number {
        return this.tasks.reduce((sum, t) => sum + (t.inputFileSize || 0), 0);
    }

    public get totalOutputBytes(): number {
        return this.tasks.reduce((sum, t) => sum + (t.outputFileSize || 0), 0);
    }

    private loadSupportedFormats(): void {
        this.loadingFormats = true;
        this.documentConverterService.supportedFormats()
            .pipe(first())
            .subscribe((response) => {
                this.loadingFormats = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.formatFamilies = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingFormats = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    private loadBuckets(): void {
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                }
            }, () => {  });
    }

    public listTasks(): void {
        this.documentConverterService.fetchAllTasks()
            .pipe(first())
            .subscribe((response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.tasks = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => this.alertService.showError(error, this.ERROR));
    }

    public get currentFamily(): DocumentConverterFormatFamily | null {
        if (!this.selectedFile) {
            return null;
        }
        const ext = this.extensionOf(this.selectedFile.name);
        return this.formatFamilies.find((f) => f.inputFormats.indexOf(ext) > -1) || null;
    }

    public get inputExtension(): string {
        return this.selectedFile ? this.extensionOf(this.selectedFile.name) : '';
    }

    private extensionOf(fileName: string): string {
        const dot = fileName.lastIndexOf('.');
        return dot >= 0 && dot < fileName.length - 1 ? fileName.substring(dot + 1).toLowerCase() : '';
    }

    public onFileSelected(event: Event): void {
        const input = event.target as HTMLInputElement;
        const file = input.files && input.files.length ? input.files[0] : null;
        this.useSelectedFile(file);
    }

    private useSelectedFile(file: File | null): void {
        this.selectedFile = file;
        this.outputFormat = '';
        this.result = null;
        this.revokeOutputPreview();
        this.outputPreviewUrl = null;
        this.outputPreviewKind = null;
        this.revokeInputPreview();
        if (!file) {
            this.inputPreviewUrl = null;
            this.inputPreviewKind = null;
            return;
        }
        if (!this.taskName) {

            const dot = file.name.lastIndexOf('.');
            this.taskName = dot > 0 ? file.name.substring(0, dot) : file.name;
        }
        const kind = PREVIEWABLE_EXTENSIONS[this.extensionOf(file.name)];
        this.inputPreviewText = null;
        if (kind === 'text') {

            this.inputPreviewUrl = null;
            this.inputPreviewKind = kind;
            const reader = new FileReader();
            reader.onload = () => {
                this.inputPreviewText = typeof reader.result === 'string' ? reader.result : '';
            };
            reader.readAsText(file);
        } else if (kind) {
            this.inputPreviewObjectUrl = URL.createObjectURL(file);
            this.inputPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.inputPreviewObjectUrl);
            this.inputPreviewKind = kind;
        } else {
            this.inputPreviewUrl = null;
            this.inputPreviewKind = null;
        }

        const family = this.currentFamily;
        if (family) {
            this.outputFormat = family.outputFormats.find((f) => f !== this.inputExtension) || family.outputFormats[0] || '';
        }
    }

    public setMode(mode: 'upload' | 'browse'): void {
        this.mode = mode;
        this.useSelectedFile(null);
        this.browseSelectedEntry = null;
    }

    public onBrowseBucketChange(): void {
        this.browseCurrentPrefix = '';
        this.browseBreadcrumbs = [];
        this.browseObjects = [];
        this.browseSelectedEntry = null;
        if (this.browseBucket) {
            this.loadBrowseObjects();
        }
    }

    public loadBrowseObjects(): void {
        this.loadingBrowseObjects = true;
        this.storageService.listObjects(this.browseBucket, this.browseCurrentPrefix, null, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingBrowseObjects = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.browseObjects = (response.data && response.data.objects) || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingBrowseObjects = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public get visibleBrowseObjects(): ObjectSummary[] {
        return this.browseObjects.filter((entry) => entry.folder || this.isConvertibleExtension(entry.name));
    }

    private isConvertibleExtension(fileName: string): boolean {
        const ext = this.extensionOf(fileName);
        return this.formatFamilies.some((f) => f.inputFormats.indexOf(ext) > -1);
    }

    public selectBrowseEntry(entry: ObjectSummary): void {
        if (entry.folder) {
            this.browseCurrentPrefix = entry.key;
            this.browseBreadcrumbs = [...this.browseBreadcrumbs, { name: entry.name, prefix: entry.key }];
            this.browseSelectedEntry = null;
            this.loadBrowseObjects();
            return;
        }
        if (!this.isConvertibleExtension(entry.name)) {
            this.alertService.showError(`"${entry.name}" isn't a supported input format.`, this.ERROR);
            return;
        }
        this.browseSelectedEntry = entry;
    }

    public goToBrowseBreadcrumb(index: number): void {
        this.browseSelectedEntry = null;
        if (index < 0) {
            this.browseCurrentPrefix = '';
            this.browseBreadcrumbs = [];
        } else {
            this.browseCurrentPrefix = this.browseBreadcrumbs[index].prefix;
            this.browseBreadcrumbs = this.browseBreadcrumbs.slice(0, index + 1);
        }
        this.loadBrowseObjects();
    }

    public runBrowseSelectedEntry(): void {
        if (!this.browseSelectedEntry) {
            return;
        }
        const entry = this.browseSelectedEntry;
        this.loadingSelectedFile = true;
        this.storageService.previewObjectArrayBuffer(this.browseBucket, entry.key)
            .pipe(first())
            .subscribe((buffer) => {
                this.loadingSelectedFile = false;
                this.useSelectedFile(new File([buffer], entry.name));
            }, (error) => {
                this.loadingSelectedFile = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public onSaveBucketChange(bucket: string): void {
        this.selectedBucket = bucket;
        this.saveFolder = '';
        this.saveFolderExists = false;
        this.closeSaveBrowser();
    }

    public onSaveFolderChange(value: string): void {
        this.saveFolder = value;
        this.saveFolderExists = false;
    }

    public toggleSaveBrowse(): void {
        if (!this.selectedBucket) {
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
        this.storageService.listObjects(this.selectedBucket, this.saveCurrentPrefix, null, PAGE_SIZE)
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
        this.saveFolder = this.saveCurrentPrefix.replace(/\/+$/, '');
        this.saveFolderExists = true;
        this.closeSaveBrowser();
    }

    public convert(): void {
        if (!this.selectedFile) {
            this.alertService.showError('Choose a file first.', this.ERROR);
            return;
        }
        if (!this.currentFamily) {
            this.alertService.showError(`'.${this.inputExtension}' isn't a supported input format.`, this.ERROR);
            return;
        }
        if (!this.outputFormat) {
            this.alertService.showError('Choose a target format.', this.ERROR);
            return;
        }
        if (this.saveToBucket && !this.selectedBucket) {
            this.alertService.showError('Choose a bucket to save to.', this.ERROR);
            return;
        }
        if (this.saveToBucket && !this.taskName.trim()) {
            this.alertService.showError('Give this conversion a name.', this.ERROR);
            return;
        }
        this.converting = true;
        this.spinnerService.show();
        this.documentConverterService.convert(
            this.selectedFile, this.outputFormat, this.saveToBucket,
            this.saveToBucket ? this.selectedBucket : undefined,
            this.saveToBucket ? this.saveFolder.trim() : undefined,
            this.saveToBucket ? this.taskName.trim() : undefined)
            .pipe(first())
            .subscribe((response) => {
                this.converting = false;
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.result = response.data;
                this.resultPreviewSide = null;
                this.buildOutputPreview(this.result);
                if (this.result.save) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    this.listTasks();
                }
            }, (error) => {
                this.converting = false;
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    private buildOutputPreview(result: DocumentConverterConvertResult): void {
        this.revokeOutputPreview();
        this.outputPreviewText = null;
        const kind = PREVIEWABLE_EXTENSIONS[(result.outputFormat || '').toLowerCase()];
        if (!kind || !result.outputBase64) {
            this.outputPreviewUrl = null;
            this.outputPreviewKind = null;
            return;
        }
        if (kind === 'text') {
            this.outputPreviewUrl = null;
            this.outputPreviewKind = kind;
            this.outputPreviewText = this.base64ToText(result.outputBase64);
            return;
        }
        const blob = this.base64ToBlob(result.outputBase64, result.outputContentType || 'application/octet-stream');
        this.outputPreviewObjectUrl = URL.createObjectURL(blob);
        this.outputPreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.outputPreviewObjectUrl);
        this.outputPreviewKind = kind;
    }

    public downloadResult(): void {
        if (!this.result || !this.result.outputBase64) {
            return;
        }
        const blob = this.base64ToBlob(this.result.outputBase64, this.result.outputContentType || 'application/octet-stream');
        this.triggerDownload(blob, this.result.outputFileName || 'converted');
    }

    public downloadInputFile(): void {
        if (!this.selectedFile) {
            return;
        }
        this.triggerDownload(this.selectedFile, this.selectedFile.name);
    }

    public toggleResultSide(side: 'input' | 'output'): void {
        this.resultPreviewSide = this.resultPreviewSide === side ? null : side;
    }

    public closeResultPreview(): void {
        this.resultPreviewSide = null;
    }

    public get resultPreviewKind(): PreviewKind | null {
        if (!this.resultPreviewSide) {
            return null;
        }
        return this.resultPreviewSide === 'input' ? this.inputPreviewKind : this.outputPreviewKind;
    }

    public get resultPreviewUrlValue(): SafeResourceUrl | null {
        if (!this.resultPreviewSide) {
            return null;
        }
        return this.resultPreviewSide === 'input' ? this.inputPreviewUrl : this.outputPreviewUrl;
    }

    public get resultPreviewTextValue(): string | null {
        if (!this.resultPreviewSide) {
            return null;
        }
        return this.resultPreviewSide === 'input' ? this.inputPreviewText : this.outputPreviewText;
    }

    public get resultPreviewFileName(): string {
        if (!this.result || !this.resultPreviewSide) {
            return '';
        }
        return (this.resultPreviewSide === 'input' ? this.result.inputFileName : this.result.outputFileName) || '';
    }

    public get resultPreviewFormatLabel(): string {
        if (!this.result || !this.resultPreviewSide) {
            return '';
        }
        return (this.resultPreviewSide === 'input' ? this.result.inputFormat : this.result.outputFormat) || '';
    }

    public downloadResultPreviewFile(): void {
        if (this.resultPreviewSide === 'input') {
            this.downloadInputFile();
        } else if (this.resultPreviewSide === 'output') {
            this.downloadResult();
        }
    }

    public startOver(): void {
        this.selectedFile = null;
        this.outputFormat = '';
        this.saveToBucket = false;
        this.taskName = '';
        this.selectedBucket = '';
        this.saveFolder = '';
        this.saveFolderExists = false;
        this.closeSaveBrowser();
        this.browseBucket = '';
        this.browseObjects = [];
        this.browseCurrentPrefix = '';
        this.browseBreadcrumbs = [];
        this.browseSelectedEntry = null;
        this.result = null;
        this.resultPreviewSide = null;
        this.revokeInputPreview();
        this.revokeOutputPreview();
        this.inputPreviewUrl = null;
        this.inputPreviewKind = null;
        this.inputPreviewText = null;
        this.outputPreviewUrl = null;
        this.outputPreviewKind = null;
        this.outputPreviewText = null;
    }

    public openPreview(task: DocumentConverterTask, side: 'input' | 'output'): void {
        if (this.previewTask && this.previewTask.documentConverterTaskId === task.documentConverterTaskId && this.previewSide === side) {
            this.closePreview();
            return;
        }
        this.previewTask = task;
        this.previewSide = side;
        this.loadPreview(task, side);
    }

    public closePreview(): void {
        this.previewTask = null;
        this.previewSide = null;
        this.previewLoading = false;
        this.revokePreviewObjectUrl();
        this.previewKind = null;
        this.previewUrl = null;
        this.previewText = null;
    }

    private loadPreview(task: DocumentConverterTask, side: 'input' | 'output'): void {
        this.revokePreviewObjectUrl();
        this.previewKind = null;
        this.previewUrl = null;
        this.previewText = null;
        const format = side === 'input' ? task.inputFormat : task.outputFormat;
        const key = side === 'input' ? task.inputStorageKey : task.outputStorageKey;
        const contentType = side === 'input' ? task.inputContentType : task.outputContentType;
        const kind = PREVIEWABLE_EXTENSIONS[(format || '').toLowerCase()];
        if (!kind || !task.bucketName || !key) {

            return;
        }
        this.previewLoading = true;
        if (kind === 'text') {
            this.storageService.previewObjectText(task.bucketName, key)
                .pipe(first())
                .subscribe((text) => {
                    this.previewText = text || '';
                    this.previewKind = kind;
                    this.previewLoading = false;
                }, () => { this.previewLoading = false; });
        } else {
            this.storageService.previewObjectArrayBuffer(task.bucketName, key)
                .pipe(first())
                .subscribe((buffer) => {
                    const url = URL.createObjectURL(new Blob([buffer], { type: contentType || 'application/octet-stream' }));
                    this.previewObjectUrl = url;
                    this.previewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(url);
                    this.previewKind = kind;
                    this.previewLoading = false;
                }, () => { this.previewLoading = false; });
        }
    }

    public get previewFileName(): string {
        if (!this.previewTask || !this.previewSide) {
            return '';
        }
        return (this.previewSide === 'input' ? this.previewTask.inputFileName : this.previewTask.outputFileName) || '';
    }

    public get previewFormatLabel(): string {
        if (!this.previewTask || !this.previewSide) {
            return '';
        }
        return (this.previewSide === 'input' ? this.previewTask.inputFormat : this.previewTask.outputFormat) || '';
    }

    public downloadPreviewFile(): void {
        if (!this.previewTask || !this.previewSide) {
            return;
        }
        this.downloadSavedFile(this.previewTask, this.previewSide);
    }

    public downloadSavedFile(task: DocumentConverterTask, side: 'input' | 'output'): void {
        const bucket = task.bucketName;
        const key = side === 'input' ? task.inputStorageKey : task.outputStorageKey;
        const fileName = side === 'input' ? task.inputFileName : task.outputFileName;
        if (!bucket || !key) {
            return;
        }
        window.open(this.storageService.downloadObjectUrl(bucket, key), '_blank');

        void fileName;
    }

    public confirmDeleteTask(task: DocumentConverterTask): void {
        this.deleteTarget = task;
    }

    public processDeleteTask(): void {
        if (!this.deleteTarget) {
            return;
        }
        this.spinnerService.show();
        this.documentConverterService.deleteTask(this.deleteTarget.documentConverterTaskId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.SUCCESS) {
                    this.alertService.showSuccess(response.message, this.SUCCESS);
                    if (this.previewTask && this.previewTask.documentConverterTaskId === this.deleteTarget.documentConverterTaskId) {
                        this.closePreview();
                    }
                    this.deleteTarget = null;
                    this.listTasks();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    private base64ToBlob(base64: string, contentType: string): Blob {
        const byteChars = atob(base64);
        const byteNumbers = new Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
            byteNumbers[i] = byteChars.charCodeAt(i);
        }
        return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
    }

    private base64ToText(base64: string): string {
        const byteChars = atob(base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) {
            bytes[i] = byteChars.charCodeAt(i);
        }
        return new TextDecoder('utf-8').decode(bytes);
    }

    private triggerDownload(blob: Blob, fileName: string): void {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    private revokeInputPreview(): void {
        if (this.inputPreviewObjectUrl) {
            URL.revokeObjectURL(this.inputPreviewObjectUrl);
            this.inputPreviewObjectUrl = null;
        }
    }

    private revokeOutputPreview(): void {
        if (this.outputPreviewObjectUrl) {
            URL.revokeObjectURL(this.outputPreviewObjectUrl);
            this.outputPreviewObjectUrl = null;
        }
    }

    private revokePreviewObjectUrl(): void {
        if (this.previewObjectUrl) {
            URL.revokeObjectURL(this.previewObjectUrl);
            this.previewObjectUrl = null;
        }
    }

}
