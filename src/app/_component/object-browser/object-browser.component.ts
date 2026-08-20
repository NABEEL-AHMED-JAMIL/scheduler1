import { Component, OnInit, OnDestroy, ViewChild, ElementRef, NgZone } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { AlertService, AuthService, StorageService, DocumentConverterService, OllamaService, FileChatService, FileShareService } from '@/_services';
import { first } from 'rxjs/operators';
import { forkJoin, Observable, Subscription } from 'rxjs';
import { ApiCode, ApiResponse, BucketSummary, ObjectSummary, ObjectMetadata } from '@/_models';
import { EChartOption } from 'echarts';
import { ColumnBarSegment, CATEGORY_PALETTE, PILL_SUCCESS_COLOR, PILL_DANGER_COLOR, categoricalColumnStats } from '@/_helpers';

const marked: any = require('marked');

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const DOC_CONVERTIBLE_EXTENSIONS = ['doc', 'docx'];
const PREVIEWABLE_EXTENSIONS = ['json', 'csv', 'txt', 'xml', 'md', 'pdf', 'mp3', 'm4a', 'mp4']
    .concat(IMAGE_EXTENSIONS).concat(DOC_CONVERTIBLE_EXTENSIONS);

const DOC_CONTENT_TYPES: { [extension: string]: string } = {
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const MEDIA_CONTENT_TYPES: { [extension: string]: string } = {
    pdf: 'application/pdf',
    mp3: 'audio/mpeg',
    m4a: 'audio/mp4',
    mp4: 'video/mp4',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp'
};

const EDITABLE_TEXT_KINDS = ['json', 'csv', 'txt', 'xml', 'md'];
const TEXT_CONTENT_TYPES: { [extension: string]: string } = {
    json: 'application/json',
    csv: 'text/csv',
    txt: 'text/plain',
    xml: 'application/xml',
    md: 'text/markdown'
};
const PAGE_SIZE = 50;

const SCROLL_FETCH_THRESHOLD_PX = 120;

const BULK_DOWNLOAD_STAGGER_MS = 350;

const FOLDER_STAT_MAX_KEYS = 1000;

const DIRECTORY_STATS_MAX_KEYS = 1000;
const FILE_TYPE_TOP_N = 7;
const SUBFOLDER_SIZE_TOP_N = 7;

const AGE_BUCKET_ORDER = ['Last 30 Days', '1-6 Months', '6-12 Months', '1-2 Years', '2-5 Years', '5+ Years'];
const AGE_BUCKET_COLOR: { [label: string]: string } = {
    'Last 30 Days': '#1d7a3f',
    '1-6 Months': '#4f46e5',
    '6-12 Months': '#0c7c8c',
    '1-2 Years': '#b5730a',
    '2-5 Years': '#6a3bbf',
    '5+ Years': '#c0392b'
};

interface Breadcrumb {
    name: string;
    prefix: string;
}

interface FolderStat {
    files: number;
    folders: number;
    totalBytes: number;
    capped: boolean;
    loading: boolean;
    error: boolean;
}

interface DirectoryStats {
    totalFiles: number;
    totalFolders: number;
    typeCounts: { [extension: string]: number };
    typeBytes: { [extension: string]: number };
    ageCounts: { [bucket: string]: number };
    capped: boolean;
    loading: boolean;
    error: boolean;
}

interface ChatDownloadableFile {
    filename: string;
    content: string;
    mimeType: string;

    pendingExport?: { sourceFormat: string; targetFormat: string; filename: string; mimeType: string };

    convertedBase64?: string;
    converting?: boolean;
}

@Component({
    selector: 'object-browser',
    templateUrl: 'object-browser.component.html'
})
export class ObjectBrowserComponent implements OnInit, OnDestroy {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket: string | null = null;

    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];
    public nextContinuationToken: string | null = null;
    public loadingObjects = false;

    private _objects: ObjectSummary[] = [];
    public get objects(): ObjectSummary[] {
        return this._objects;
    }
    public set objects(value: ObjectSummary[]) {
        this._objects = value;
        this.recomputeDirectoryCharts();
    }

    private _folderStats: { [key: string]: FolderStat } = {};
    public get folderStats(): { [key: string]: FolderStat } {
        return this._folderStats;
    }
    public set folderStats(value: { [key: string]: FolderStat }) {
        this._folderStats = value;
        this.recomputeDirectoryCharts();
    }

    private _directoryStats: DirectoryStats = {
        totalFiles: 0, totalFolders: 0, typeCounts: {}, typeBytes: {}, ageCounts: {}, capped: false, loading: false, error: false
    };
    public get directoryStats(): DirectoryStats {
        return this._directoryStats;
    }
    public set directoryStats(value: DirectoryStats) {
        this._directoryStats = value;
        this.recomputeDirectoryCharts();
    }
    public showDirectoryCharts = true;

    public folderFileChartOptions: EChartOption | null = null;
    public fileTypeChartOptions: EChartOption | null = null;
    public uploadAgeChartOptions: EChartOption | null = null;
    public subfolderSizeChartOptions: EChartOption | null = null;

    private recomputeDirectoryCharts(): void {
        this.folderFileChartOptions = this.computeFolderFileChartOptions();
        this.fileTypeChartOptions = this.computeFileTypeChartOptions();
        this.uploadAgeChartOptions = this.computeUploadAgeChartOptions();
        this.subfolderSizeChartOptions = this.computeSubfolderSizeChartOptions();
    }

    public searchName = '';
    public searchDateFrom = '';
    public searchDateTo = '';

    public selectedKeys: Set<string> = new Set();

    public selectedObject: ObjectSummary | null = null;
    public selectedObjectMetadata: ObjectMetadata | null = null;
    public loadingMetadata = false;

    public previewKind: 'json' | 'csv' | 'txt' | 'xml' | 'md' | 'pdf' | 'mp3' | 'm4a' | 'mp4' | 'image' | null = null;
    public previewLoading = false;
    public previewError: string | null = null;
    public previewJson: string | null = null;
    public previewText: string | null = null;

    public previewMediaUrl: SafeResourceUrl | null = null;
    private previewMediaObjectUrl: string | null = null;

    public previewEditMode: 'view' | 'edit' = 'view';
    public previewMdHtml: string | null = null;
    public previewEditText = '';
    public savingPreview = false;

    public uploading = false;

    public newFolderName = '';

    public renameFolderEntry: ObjectSummary | null = null;
    public renameFolderNewName = '';

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
    @ViewChild('openLeaveChatModal', { static: false })
    public openLeaveChatModal!: ElementRef<HTMLButtonElement>;
    @ViewChild('closeEmailShareModal', { static: false })
    public closeEmailShareModal!: ElementRef<HTMLButtonElement>;

    public pendingFileSwitch: { entry: ObjectSummary; action: 'preview' | 'chat' } | null = null;

    public emailShareEntry: ObjectSummary | null = null;
    public emailShareBulkKeys: string[] | null = null;
    public emailShareAddress = '';
    public emailShareMessage = '';
    public emailSharing = false;

    constructor(
        private route: ActivatedRoute,
        private alertService: AlertService,
        private authService: AuthService,
        private storageService: StorageService,
        private documentConverterService: DocumentConverterService,
        private ollamaService: OllamaService,
        private fileChatService: FileChatService,
        private fileShareService: FileShareService,
        private sanitizer: DomSanitizer,
        private ngZone: NgZone) {
    }

    ngOnInit() {
        this.loadBuckets();
    }

    public loadBuckets(): void {
        this.loadingBuckets = true;
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                this.loadingBuckets = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                    this.openDeepLinkFromQueryParams();
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingBuckets = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    private openDeepLinkFromQueryParams(): void {
        const params = this.route.snapshot.queryParamMap;
        const bucket = params.get('bucket');
        const prefix = params.get('prefix') || '';
        if (!bucket || !this.buckets.some((b) => b.bucket === bucket)) {
            return;
        }
        this.selectedBucket = bucket;
        this.currentPrefix = prefix;
        this.breadcrumbs = prefix
            ? prefix.replace(/\/+$/, '').split('/').map((segment, index, segments) => ({
                name: segment,
                prefix: segments.slice(0, index + 1).join('/') + '/'
            }))
            : [];
        this.loadObjects(true);
        this.loadDirectoryStats();
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
            this.loadDirectoryStats();
        }
    }

    public refreshCurrentFolder(): void {
        if (!this.selectedBucket) {
            return;
        }
        this.closePanel();
        this.clearSelection();
        this.objects = [];
        this.nextContinuationToken = null;
        this.loadObjects(true);
        this.loadDirectoryStats();
    }

    public copyCurrentPath(): void {
        if (!this.selectedBucket) {
            return;
        }
        let path = this.currentPrefix
            ? `${this.selectedBucket}/${this.currentPrefix.replace(/\/+$/, '')}`
            : this.selectedBucket;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(path).then(() => {
                this.alertService.showSuccess('Folder path copied to clipboard.', this.SUCCESS);
            }, () => {
                this.alertService.showError('Could not copy to clipboard.', this.ERROR);
            });
            return;
        }
        let textarea = document.createElement('textarea');
        textarea.value = path;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.alertService.showSuccess('Folder path copied to clipboard.', this.SUCCESS);
    }

    private loadDirectoryStats(): void {
        const bucket = this.selectedBucket;
        if (!bucket) {
            return;
        }
        this.directoryStats = { totalFiles: 0, totalFolders: 0, typeCounts: {}, typeBytes: {}, ageCounts: {}, capped: false, loading: true, error: false };
        const prefix = this.currentPrefix;
        this.storageService.listObjects(bucket, prefix, null, DIRECTORY_STATS_MAX_KEYS)
            .pipe(first())
            .subscribe((response) => {
                if (bucket !== this.selectedBucket || prefix !== this.currentPrefix) {
                    return;
                }
                if (response.status === ApiCode.SUCCESS) {
                    const entries: ObjectSummary[] = response.data?.objects || [];
                    const typeCounts: { [extension: string]: number } = {};
                    const typeBytes: { [extension: string]: number } = {};
                    let totalFiles = 0;
                    let totalFolders = 0;
                    entries.forEach((entry) => {
                        if (entry.folder) {
                            totalFolders++;
                            return;
                        }
                        totalFiles++;
                        const extension = this.extensionOf(entry.name) || 'other';
                        typeCounts[extension] = (typeCounts[extension] || 0) + 1;
                        typeBytes[extension] = (typeBytes[extension] || 0) + (Number(entry.size) || 0);
                    });
                    const ageSegments = categoricalColumnStats(
                        entries.filter((entry) => !entry.folder),
                        (entry: ObjectSummary) => this.ageBucketOf(entry.lastModified),
                        AGE_BUCKET_ORDER,
                        (label) => AGE_BUCKET_COLOR[label] || '#9aa5ac'
                    );
                    const ageCounts: { [bucket: string]: number } = {};
                    ageSegments.forEach((segment) => { ageCounts[segment.label] = segment.count; });
                    this.directoryStats = {
                        totalFiles, totalFolders, typeCounts, typeBytes, ageCounts,
                        capped: !!response.data?.nextContinuationToken,
                        loading: false, error: false
                    };
                } else {
                    this.directoryStats = { totalFiles: 0, totalFolders: 0, typeCounts: {}, typeBytes: {}, ageCounts: {}, capped: false, loading: false, error: true };
                }
            }, () => {
                if (bucket !== this.selectedBucket || prefix !== this.currentPrefix) {
                    return;
                }
                this.directoryStats = { totalFiles: 0, totalFolders: 0, typeCounts: {}, typeBytes: {}, ageCounts: {}, capped: false, loading: false, error: true };
            });
    }

    private computeFolderFileChartOptions(): EChartOption | null {
        const stats = this.directoryStats;
        if (!stats.totalFiles && !stats.totalFolders) {
            return null;
        }
        const segments: ColumnBarSegment[] = [
            { label: 'Files', count: stats.totalFiles, pct: 0, color: PILL_SUCCESS_COLOR },
            { label: 'Folders', count: stats.totalFolders, pct: 0, color: PILL_DANGER_COLOR }
        ];
        return this.compactPieOptions(segments);
    }

    private computeFileTypeChartOptions(): EChartOption | null {
        const entries = Object.entries(this.directoryStats.typeCounts).sort((a, b) => b[1] - a[1]);
        if (!entries.length) {
            return null;
        }
        const top = entries.slice(0, FILE_TYPE_TOP_N);
        const rest = entries.slice(FILE_TYPE_TOP_N);
        const restTotal = rest.reduce((sum, [, count]) => sum + count, 0);
        const segments: ColumnBarSegment[] = top.map(([extension, count], i) => ({
            label: extension.toUpperCase(), count, pct: 0, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
        }));
        if (restTotal > 0) {
            segments.push({ label: `Other (${rest.length} types)`, count: restTotal, pct: 0, color: '#9aa5ac' });
        }
        return this.compactPieOptions(segments);
    }

    private computeUploadAgeChartOptions(): EChartOption | null {
        const counts = this.directoryStats.ageCounts;
        const segments: ColumnBarSegment[] = AGE_BUCKET_ORDER
            .filter((label) => (counts[label] || 0) > 0)
            .map((label) => ({ label, count: counts[label], pct: 0, color: AGE_BUCKET_COLOR[label] }));
        return this.compactPieOptions(segments);
    }

    private ageBucketOf(lastModified: any): string {
        if (!lastModified) {
            return AGE_BUCKET_ORDER[AGE_BUCKET_ORDER.length - 1];
        }
        const modified = new Date(lastModified).getTime();
        if (isNaN(modified)) {
            return AGE_BUCKET_ORDER[AGE_BUCKET_ORDER.length - 1];
        }
        const daysAgo = Math.max(0, (Date.now() - modified) / (24 * 60 * 60 * 1000));
        if (daysAgo <= 30) { return 'Last 30 Days'; }
        if (daysAgo <= 182) { return '1-6 Months'; }
        if (daysAgo <= 365) { return '6-12 Months'; }
        if (daysAgo <= 730) { return '1-2 Years'; }
        if (daysAgo <= 1825) { return '2-5 Years'; }
        return '5+ Years';
    }

    private computeSubfolderSizeChartOptions(): EChartOption | null {
        const folders = this.objects.filter((entry) => entry.folder);
        const entries = folders
            .map((entry) => [entry.name, this.folderStats[entry.key]?.totalBytes || 0] as [string, number])
            .filter(([, bytes]) => bytes > 0)
            .sort((a, b) => b[1] - a[1]);
        if (!entries.length) {
            return null;
        }
        const top = entries.slice(0, SUBFOLDER_SIZE_TOP_N);
        const rest = entries.slice(SUBFOLDER_SIZE_TOP_N);
        const restTotal = rest.reduce((sum, [, bytes]) => sum + bytes, 0);
        const segments: ColumnBarSegment[] = top.map(([name, bytes], i) => ({
            label: name, count: bytes, pct: 0, color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]
        }));
        if (restTotal > 0) {
            segments.push({ label: `Other (${rest.length} folders)`, count: restTotal, pct: 0, color: '#9aa5ac' });
        }
        return this.compactPieOptions(segments, (bytes) => this.formatSize(bytes));
    }

    private compactPieOptions(segments: ColumnBarSegment[], valueFormatter?: (value: number) => string): EChartOption | null {
        const data = segments.filter((s) => s.count > 0);
        if (!data.length) {
            return null;
        }
        return {
            tooltip: {
                trigger: 'item',
                formatter: (params: any) => `${params.name}: ${valueFormatter ? valueFormatter(params.value) : params.value} (${params.percent}%)`
            },
            legend: {
                orient: 'vertical', left: '54%', right: 2, top: 'center',
                type: data.length > 5 ? 'scroll' : 'plain',
                itemWidth: 7, itemHeight: 7, itemGap: 4,
                textStyle: { fontSize: 9 },
                formatter: (name: string) => (name.length > 12 ? name.slice(0, 11) + '…' : name)
            },
            series: [{
                type: 'pie',
                center: ['27%', '50%'],
                radius: ['44%', '72%'],
                itemStyle: { borderColor: '#fff', borderWidth: 1 },
                label: { show: false },
                data: data.map((s) => ({ name: s.label, value: s.count, itemStyle: { color: s.color } }))
            }]
        };
    }

    public loadObjects(reset: boolean): void {
        if (!this.selectedBucket || this.loadingObjects) {
            return;
        }
        if (!reset && !this.nextContinuationToken) {
            return;
        }
        this.loadingObjects = true;
        const bucket = this.selectedBucket;
        const prefix = this.currentPrefix;
        const token = reset ? null : this.nextContinuationToken;
        this.storageService.listObjects(bucket, prefix, token, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingObjects = false;

                if (bucket !== this.selectedBucket || prefix !== this.currentPrefix) {
                    this.loadObjects(true);
                    return;
                }
                if (response.status === ApiCode.SUCCESS) {
                    const page = response.data || {};
                    this.objects = reset ? (page.objects || []) : this.objects.concat(page.objects || []);
                    this.nextContinuationToken = page.nextContinuationToken || null;
                    if (reset) {
                        this.folderStats = {};
                    }
                    this.loadFolderStats(page.objects || []);
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingObjects = false;
                if (bucket !== this.selectedBucket || prefix !== this.currentPrefix) {
                    this.loadObjects(true);
                    return;
                }
                this.alertService.showError(error, this.ERROR);
            });
    }

    private loadFolderStats(entries: ObjectSummary[]): void {
        const bucket = this.selectedBucket;
        if (!bucket) {
            return;
        }
        entries
            .filter((entry) => entry.folder && !this.folderStats[entry.key])
            .forEach((entry) => {
                this.folderStats[entry.key] = { files: 0, folders: 0, totalBytes: 0, capped: false, loading: true, error: false };
                this.storageService.listObjects(bucket, entry.key, null, FOLDER_STAT_MAX_KEYS)
                    .pipe(first())
                    .subscribe((response) => {
                        if (response.status === ApiCode.SUCCESS) {
                            const children: ObjectSummary[] = response.data?.objects || [];
                            const fileChildren = children.filter((c) => !c.folder);
                            this.folderStats[entry.key] = {
                                files: fileChildren.length,
                                folders: children.filter((c) => !!c.folder).length,
                                totalBytes: fileChildren.reduce((sum, c) => sum + (Number(c.size) || 0), 0),
                                capped: !!response.data?.nextContinuationToken,
                                loading: false,
                                error: false
                            };
                        } else {
                            this.folderStats[entry.key] = { files: 0, folders: 0, totalBytes: 0, capped: false, loading: false, error: true };
                        }
                        this.recomputeDirectoryCharts();
                    }, () => {
                        this.folderStats[entry.key] = { files: 0, folders: 0, totalBytes: 0, capped: false, loading: false, error: true };
                        this.recomputeDirectoryCharts();
                    });
            });
    }

    public folderStatLabel(entry: ObjectSummary): string {
        const stat = this.folderStats[entry.key];
        if (!stat || stat.loading) {
            return 'Counting…';
        }
        if (stat.error) {
            return '-';
        }
        const prefix = stat.capped ? `${FOLDER_STAT_MAX_KEYS}+ entries, showing ` : '';
        return `${prefix}${stat.files} file${stat.files === 1 ? '' : 's'}, ${stat.folders} folder${stat.folders === 1 ? '' : 's'}`;
    }

    public folderStatTitle(entry: ObjectSummary): string {
        const stat = this.folderStats[entry.key];
        if (!stat || stat.loading) {
            return 'Counting folder contents...';
        }
        if (stat.error) {
            return 'Could not count folder contents.';
        }
        const prefix = stat.capped ? `${FOLDER_STAT_MAX_KEYS}+ entries (showing a partial count) -- ` : '';
        return `${prefix}${stat.files} file${stat.files === 1 ? '' : 's'}, ${stat.folders} folder${stat.folders === 1 ? '' : 's'}`;
    }

    public onTableScroll(event: Event): void {
        const el = event.target as HTMLElement;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_FETCH_THRESHOLD_PX;
        if (nearBottom) {
            this.loadObjects(false);
        }
    }

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
        this.loadDirectoryStats();
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
        this.loadDirectoryStats();
    }

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

    public downloadSelectedBulk(): void {
        const fileKeys = this.objects.filter((entry) => !entry.folder && this.selectedKeys.has(entry.key)).map((entry) => entry.key);
        if (!fileKeys.length) {
            return;
        }

        const bucket = this.selectedBucket;
        fileKeys.forEach((key, index) => {
            setTimeout(() => this.triggerDownload(bucket, key), index * BULK_DOWNLOAD_STAGGER_MS);
        });
    }

    public requestDeleteBulk(): void {
        const entries = this.objects.filter((entry) => this.selectedKeys.has(entry.key));
        if (!entries.length) {
            return;
        }
        this.pendingDeleteEntries = entries;
        this.pendingDeleteLabel = `${entries.length} selected item(s)`;
    }

    public chatFile: ObjectSummary | null = null;
    public chatDraft = '';

    public chatMessages: {
        role: 'user' | 'assistant' | 'error'; author: string; text: string; html?: string;
        files?: ChatDownloadableFile[];
    }[] = [];
    public chatPreparing = false;
    public chatPrepareError: string | null = null;
    public chatSending = false;

    public readonly chatSuggestedPrompts: string[] = [
        'Summarize this file',
        'What are the key points?',
        'List any dates mentioned',
        'Extract names and organizations',
        'Are there any action items?'
    ];

    public useSuggestedPrompt(prompt: string): void {
        this.chatDraft = prompt;
        if (this.chatInputEl) {
            this.chatInputEl.nativeElement.focus();
        }
    }

    public chatSuggestionsVisible = true;

    public toggleChatSuggestions(): void {
        this.chatSuggestionsVisible = !this.chatSuggestionsVisible;
    }

    public copyChatMessage(message: { text: string }): void {
        this.copyToClipboard(message.text, 'Message copied to clipboard.');
    }

    public readonly chatSpeechSupported = typeof (window as any).webkitSpeechRecognition !== 'undefined'
        || typeof (window as any).SpeechRecognition !== 'undefined';
    public chatListening = false;
    private chatRecognition: any = null;

    public toggleChatMic(): void {
        if (this.chatListening) {
            this.chatRecognition?.stop();
            return;
        }
        const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognitionCtor) {
            return;
        }
        const recognition = new SpeechRecognitionCtor();
        recognition.lang = 'en-US';
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.onstart = () => this.ngZone.run(() => { this.chatListening = true; });
        recognition.onresult = (event: any) => this.ngZone.run(() => {
            const transcript = event.results?.[0]?.[0]?.transcript?.trim();
            if (transcript) {
                this.chatDraft = this.chatDraft.trim() ? `${this.chatDraft.trim()} ${transcript}` : transcript;
            }
        });
        recognition.onerror = (event: any) => this.ngZone.run(() => {
            this.chatListening = false;
            if (event.error !== 'no-speech' && event.error !== 'aborted') {
                this.alertService.showError('Could not use the microphone: ' + event.error, this.ERROR);
            }
        });
        recognition.onend = () => this.ngZone.run(() => { this.chatListening = false; });
        this.chatRecognition = recognition;
        recognition.start();
    }

    public chatSlowHint = false;
    private chatSlowHintTimer: any = null;
    private chatMessageSubscription: Subscription | null = null;

    @ViewChild('chatMessagesEl', { static: false })
    private chatMessagesEl: ElementRef;
    @ViewChild('chatInputEl', { static: false })
    private chatInputEl: ElementRef<HTMLTextAreaElement>;

    public chatModels: { name: string }[] = [];
    public chatSelectedModel = '';
    public loadingChatModels = false;

    public get currentUserName(): string {
        return this.authService.currentUser?.fullName || this.authService.currentUser?.username || 'You';
    }

    public onRobotAction(entry: ObjectSummary): void {
        if (this.confirmLeaveChatIfNeeded(entry, 'chat')) {
            return;
        }
        this.closePanel();
        this.chatFile = entry;
        this.loadChatModels();
        this.prepareChatContext(entry);
    }

    private confirmLeaveChatIfNeeded(entry: ObjectSummary, action: 'preview' | 'chat'): boolean {
        if (!this.chatFile || this.chatFile.key === entry.key) {
            return false;
        }
        this.pendingFileSwitch = { entry, action };
        if (this.openLeaveChatModal) {
            this.openLeaveChatModal.nativeElement.click();
        }
        return true;
    }

    public cancelLeaveChat(): void {
        this.pendingFileSwitch = null;
    }

    public confirmLeaveChat(): void {
        const pending = this.pendingFileSwitch;
        this.pendingFileSwitch = null;
        if (!pending) {
            return;
        }

        this.closeChat();
        if (pending.action === 'chat') {
            this.onRobotAction(pending.entry);
        } else {
            this.selectObject(pending.entry);
        }
    }

    private loadChatModels(): void {
        this.loadingChatModels = true;
        this.ollamaService.listModels()
            .pipe(first())
            .subscribe((response) => {
                this.loadingChatModels = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.chatModels = response.data || [];
                    if (this.chatModels.length && !this.chatSelectedModel) {
                        this.chatSelectedModel = this.chatModels[0].name;
                    }
                }
            }, () => {
                this.loadingChatModels = false;
            });
    }

    private prepareChatContext(entry: ObjectSummary): void {
        this.chatPreparing = true;
        this.chatPrepareError = null;
        this.fileChatService.prepareContext(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((response) => {
                this.chatPreparing = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.chatPrepareError = response.message || 'Could not read this file.';
                }
            }, (error) => {
                this.chatPreparing = false;
                this.chatPrepareError = 'Could not read this file.';
            });
    }

    public closeChat(): void {
        this.stopChatMessage();
        this.chatRecognition?.stop();
        this.chatFile = null;
        this.chatDraft = '';
        this.chatMessages = [];
        this.chatPreparing = false;
        this.chatPrepareError = null;
        this.chatSending = false;
    }

    public onChatInputKeydown(event: KeyboardEvent): void {
        if (event.key !== 'Enter' || event.shiftKey || event.isComposing || this.chatSending) {
            return;
        }
        event.preventDefault();
        this.sendChatMessage();
    }

    public sendChatMessage(): void {
        const text = this.chatDraft.trim();
        if (!text || this.chatSending || this.chatPreparing || !this.chatFile || !this.chatSelectedModel) {
            return;
        }

        const MAX_HISTORY_MESSAGES = 8;
        const history = this.chatMessages
            .filter((message) => message.role === 'user' || message.role === 'assistant')
            .slice(-MAX_HISTORY_MESSAGES)
            .map((message) => ({ role: message.role, text: message.text }));

        this.chatMessages.push({ role: 'user', author: this.currentUserName, text });
        this.chatDraft = '';
        this.chatSending = true;
        this.chatSlowHint = false;
        this.scrollChatToBottom();

        this.chatSlowHintTimer = setTimeout(() => {
            this.chatSlowHint = true;
        }, 8000);

        this.chatMessageSubscription = this.fileChatService.sendMessage({
            bucket: this.selectedBucket,
            key: this.chatFile.key,
            model: this.chatSelectedModel,
            message: text,
            history
        }).pipe(first()).subscribe((response) => {
            this.onChatMessageSettled();
            if (response.status === ApiCode.SUCCESS) {
                this.chatMessages.push({
                    role: 'assistant', author: 'Assistant', text: response.data,
                    html: this.renderAssistantMessage(response.data),
                    files: this.extractDownloadableFiles(response.data)
                });
            } else {
                this.chatMessages.push({ role: 'error', author: 'Assistant', text: response.message || 'Something went wrong.' });
            }
            this.scrollChatToBottom();
        }, (error) => {
            this.onChatMessageSettled();
            this.chatMessages.push({ role: 'error', author: 'Assistant', text: 'Something went wrong -- please try again.' });
            this.scrollChatToBottom();
        });
    }

    private renderAssistantMessage(text: string): string {
        if (!text) {
            return '';
        }
        const trimmed = text.trim();
        const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}'))
            || (trimmed.startsWith('[') && trimmed.endsWith(']'));
        if (looksLikeJson && !trimmed.includes('```')) {
            try {
                const pretty = JSON.stringify(JSON.parse(trimmed), null, 2);
                return marked.parse('```json\n' + pretty + '\n```');
            } catch (e) {

            }
        }
        return marked.parse(text);
    }

    private static readonly CHAT_EXPORT_FORMATS: { [ext: string]: string } = {
        csv: 'text/csv', json: 'application/json', tsv: 'text/tab-separated-values', txt: 'text/plain',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        pdf: 'application/pdf'
    };

    private extractDownloadableFiles(text: string): ChatDownloadableFile[] {
        if (!text) {
            return [];
        }

        const fencePattern = /```(csv|json|tsv|txt)\r?\n([\s\S]*?)```\s*(?:TARGET_FORMAT:\s*(xlsx|docx|pdf)\b)?/gi;
        const baseName = this.chatFile ? this.chatFile.name.replace(/\.[^./]+$/, '') : 'export';
        const files: ChatDownloadableFile[] = [];
        let match: RegExpExecArray | null;
        let index = 0;
        while ((match = fencePattern.exec(text)) !== null) {
            const lang = match[1].toLowerCase();
            const content = match[2].replace(/\r?\n$/, '');
            const targetFormat = match[3] ? match[3].toLowerCase() : null;
            if (!content.trim()) {
                continue;
            }
            index++;
            const suffix = index > 1 ? `-${index}` : '';
            if (targetFormat && targetFormat !== lang) {
                const filename = `${baseName}-export${suffix}.${targetFormat}`;
                files.push({
                    filename, content, mimeType: ObjectBrowserComponent.CHAT_EXPORT_FORMATS[lang],
                    pendingExport: {
                        sourceFormat: lang, targetFormat, filename,
                        mimeType: ObjectBrowserComponent.CHAT_EXPORT_FORMATS[targetFormat]
                    }
                });
            } else {
                files.push({
                    filename: `${baseName}-export${suffix}.${lang}`, content,
                    mimeType: ObjectBrowserComponent.CHAT_EXPORT_FORMATS[lang]
                });
            }
        }
        return files;
    }

    public downloadChatFile(file: ChatDownloadableFile): void {
        if (file.pendingExport && file.convertedBase64) {
            this.saveBlobFromBase64(file.convertedBase64, file.pendingExport.mimeType, file.pendingExport.filename);
            return;
        }
        if (file.pendingExport) {
            this.exportAndDownloadChatFile(file);
            return;
        }
        this.saveBlobFromText(file.content, file.mimeType, file.filename);
    }

    private exportAndDownloadChatFile(file: ChatDownloadableFile): void {
        const pending = file.pendingExport;
        if (!pending || file.converting) {
            return;
        }
        file.converting = true;
        this.fileChatService.exportFile({
            content: file.content, sourceFormat: pending.sourceFormat, targetFormat: pending.targetFormat
        }).pipe(first()).subscribe((response) => {
            file.converting = false;
            if (response.status === ApiCode.SUCCESS && response.data) {
                file.convertedBase64 = response.data;
                this.saveBlobFromBase64(response.data, pending.mimeType, pending.filename);
            } else {
                this.alertService.showError(response.message || 'Could not convert this file.', this.ERROR);
            }
        }, () => {
            file.converting = false;
            this.alertService.showError('Could not convert this file -- please try again.', this.ERROR);
        });
    }

    private saveBlobFromText(content: string, mimeType: string, filename: string): void {
        this.triggerBlobDownload(new Blob([content], { type: mimeType }), filename);
    }

    private saveBlobFromBase64(base64: string, mimeType: string, filename: string): void {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        this.triggerBlobDownload(new Blob([bytes], { type: mimeType }), filename);
    }

    private triggerBlobDownload(blob: Blob, filename: string): void {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    }

    public stopChatMessage(): void {
        if (this.chatMessageSubscription) {
            this.chatMessageSubscription.unsubscribe();
            this.chatMessageSubscription = null;
        }
        this.onChatMessageSettled();
    }

    private onChatMessageSettled(): void {
        this.chatSending = false;
        this.chatSlowHint = false;
        this.chatMessageSubscription = null;
        if (this.chatSlowHintTimer) {
            clearTimeout(this.chatSlowHintTimer);
            this.chatSlowHintTimer = null;
        }
    }

    private scrollChatToBottom(): void {
        setTimeout(() => {
            if (this.chatMessagesEl) {
                const el = this.chatMessagesEl.nativeElement;
                el.scrollTop = el.scrollHeight;
            }
        });
    }

    public selectObject(entry: ObjectSummary): void {
        if (this.confirmLeaveChatIfNeeded(entry, 'preview')) {
            return;
        }
        this.closeChat();
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
            this.loadMediaPreview(entry.key, extension);
            return;
        }
        if (DOC_CONVERTIBLE_EXTENSIONS.indexOf(extension) !== -1) {
            this.loadDocPreview(entry, extension);
            return;
        }
        this.previewKind = extension as 'json' | 'csv' | 'txt' | 'xml' | 'md' | 'pdf' | 'mp3' | 'm4a' | 'mp4';
        if (extension === 'pdf' || extension === 'mp3' || extension === 'm4a' || extension === 'mp4') {
            this.loadMediaPreview(entry.key, extension);
            return;
        }
        this.previewLoading = true;
        this.storageService.previewObjectText(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((text) => {
                this.previewLoading = false;
                this.previewEditMode = 'view';
                if (extension === 'json') {
                    try {
                        this.previewJson = JSON.stringify(JSON.parse(text), null, 2);
                    } catch (e) {
                        this.previewJson = text;
                    }
                } else if (extension === 'csv' || extension === 'txt' || extension === 'xml') {

                    this.previewText = text;
                } else if (extension === 'md') {
                    this.previewText = text;
                    this.previewMdHtml = marked.parse(text);
                }
            }, () => {
                this.previewLoading = false;
                this.previewError = 'Could not load preview for this file.';
            });
    }

    private loadMediaPreview(key: string, extension: string): void {
        this.previewLoading = true;
        this.storageService.previewObjectArrayBuffer(this.selectedBucket, key)
            .pipe(first())
            .subscribe((buffer) => {
                this.previewLoading = false;
                const contentType = MEDIA_CONTENT_TYPES[extension] || 'application/octet-stream';
                this.revokePreviewMediaUrl();
                this.previewMediaObjectUrl = URL.createObjectURL(new Blob([buffer], { type: contentType }));
                this.previewMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewMediaObjectUrl);
            }, () => {
                this.previewLoading = false;
                this.previewError = 'Could not load preview for this file.';
            });
    }

    private loadDocPreview(entry: ObjectSummary, extension: string): void {
        this.previewLoading = true;
        this.storageService.previewObjectArrayBuffer(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((buffer) => {
                const contentType = DOC_CONTENT_TYPES[extension] || 'application/octet-stream';
                const file = new File([buffer], entry.name, { type: contentType });
                this.documentConverterService.convert(file, 'pdf', false)
                    .pipe(first())
                    .subscribe((response) => {
                        this.previewLoading = false;
                        const outputBase64 = response.data?.outputBase64;
                        if (response.status !== ApiCode.SUCCESS || !outputBase64) {
                            this.previewError = response.message || 'Could not convert this file for preview.';
                            return;
                        }
                        const pdfBytes = Uint8Array.from(atob(outputBase64), (c) => c.charCodeAt(0));
                        this.revokePreviewMediaUrl();
                        this.previewMediaObjectUrl = URL.createObjectURL(new Blob([pdfBytes], { type: 'application/pdf' }));
                        this.previewMediaUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewMediaObjectUrl);
                        this.previewKind = 'pdf';
                    }, (error) => {
                        this.previewLoading = false;
                        this.previewError = 'Could not convert this file for preview.';
                    });
            }, () => {
                this.previewLoading = false;
                this.previewError = 'Could not load this file for preview.';
            });
    }

    private revokePreviewMediaUrl(): void {
        if (this.previewMediaObjectUrl) {
            URL.revokeObjectURL(this.previewMediaObjectUrl);
            this.previewMediaObjectUrl = null;
        }
    }

    private resetPreview(): void {
        this.previewKind = null;
        this.previewLoading = false;
        this.previewError = null;
        this.previewJson = null;
        this.previewText = null;
        this.revokePreviewMediaUrl();
        this.previewMediaUrl = null;
        this.previewEditMode = 'view';
        this.previewMdHtml = null;
        this.previewEditText = '';
        this.savingPreview = false;
    }

    public ngOnDestroy(): void {
        this.revokePreviewMediaUrl();
        this.stopChatMessage();
        this.chatRecognition?.stop();
    }

    public get isEditableTextPreview(): boolean {
        return !!this.previewKind && EDITABLE_TEXT_KINDS.indexOf(this.previewKind) !== -1;
    }

    private currentPreviewSource(): string {
        return (this.previewKind === 'json' ? this.previewJson : this.previewText) || '';
    }

    public startEditPreview(): void {
        this.previewEditText = this.currentPreviewSource();
        this.previewEditMode = 'edit';
    }

    public cancelEditPreview(): void {
        this.previewEditMode = 'view';
    }

    public savePreview(): void {
        if (!this.selectedObject || !this.selectedBucket || this.savingPreview || !this.previewKind) {
            return;
        }
        const name = this.selectedObject.name;
        const text = this.previewEditText;
        const contentType = TEXT_CONTENT_TYPES[this.previewKind] || 'text/plain';
        const file = new File([text], name, { type: contentType });
        this.savingPreview = true;
        this.storageService.uploadObject(this.selectedBucket, this.currentPrefix, file)
            .pipe(first())
            .subscribe((response) => {
                this.savingPreview = false;
                if (response.status === ApiCode.SUCCESS) {
                    if (this.previewKind === 'json') {
                        try {
                            this.previewJson = JSON.stringify(JSON.parse(text), null, 2);
                        } catch (e) {
                            this.previewJson = text;
                        }
                    } else {
                        this.previewText = text;
                        if (this.previewKind === 'md') {
                            this.previewMdHtml = marked.parse(text);
                        }
                    }
                    this.previewEditMode = 'view';
                    this.alertService.showSuccess(`"${name}" saved.`, this.SUCCESS);
                    if (this.selectedObject) {
                        this.storageService.objectMetadata(this.selectedBucket, this.selectedObject.key)
                            .pipe(first())
                            .subscribe((metaResponse) => {
                                if (metaResponse.status === ApiCode.SUCCESS) {
                                    this.selectedObjectMetadata = metaResponse.data;
                                    const rowEntry = this.objects.find((entry) => entry.key === this.selectedObject.key);
                                    if (rowEntry) {
                                        rowEntry.size = metaResponse.data.size;
                                        rowEntry.lastModified = metaResponse.data.lastModified;
                                    }
                                }
                            });
                    }
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.savingPreview = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public closePanel(): void {
        this.selectedObject = null;
        this.selectedObjectMetadata = null;
        this.resetPreview();
        this.closeChat();
    }

    public downloadEntry(entry: ObjectSummary, event: Event): void {
        this.triggerDownload(this.selectedBucket, entry.key);
    }

    public copyPath(entry: ObjectSummary, event: Event): void {
        this.copyToClipboard(entry.key, 'Path copied to clipboard.');
    }

    public copyEtag(entry: ObjectSummary, event: Event): void {
        event.stopPropagation();
        if (!entry.etag) {
            return;
        }
        this.copyToClipboard(entry.etag, 'ETag copied to clipboard.');
    }

    public copyPreviewContent(): void {
        const content = this.previewKind === 'json' ? this.previewJson : this.previewText;
        if (!content) {
            return;
        }
        this.copyToClipboard(content, 'Content copied to clipboard.');
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

    public requestDeleteEntry(entry: ObjectSummary, event: Event): void {
        this.pendingDeleteEntries = [entry];
        this.pendingDeleteLabel = entry.folder
            ? `"${entry.name}" and everything inside it`
            : `"${entry.name}"`;
    }

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

    private triggerDownload(bucket: string, key: string): void {
        this.storageService.previewObjectArrayBuffer(bucket, key)
            .pipe(first())
            .subscribe((buffer) => {
                const objectUrl = URL.createObjectURL(new Blob([buffer]));
                const link = document.createElement('a');
                link.href = objectUrl;
                link.download = this.fileNameFromKey(key);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(objectUrl);
            }, () => {
                this.alertService.showError(`Could not download "${this.fileNameFromKey(key)}".`, this.ERROR);
            });
    }

    private fileNameFromKey(key: string): string {
        const segments = key.split('/');
        return segments[segments.length - 1] || key;
    }

    public trackByKey(_index: number, entry: any): any {
        return entry.key;
    }

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

    public requestRenameFolder(entry: ObjectSummary, event: Event): void {
        this.renameFolderEntry = entry;
        this.renameFolderNewName = entry.name;
    }

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

    public requestEmailShare(entry: ObjectSummary, event: Event): void {
        this.emailShareEntry = entry;
        this.emailShareBulkKeys = null;
        this.emailShareAddress = '';
        this.emailShareMessage = '';
    }

    public requestEmailShareBulk(): void {
        if (!this.selectedKeys.size) {
            return;
        }
        this.emailShareEntry = null;
        this.emailShareBulkKeys = Array.from(this.selectedKeys);
        this.emailShareAddress = '';
        this.emailShareMessage = '';
    }

    public confirmEmailShare(): void {
        const entry = this.emailShareEntry;
        const bulkKeys = this.emailShareBulkKeys;
        if ((!entry && !bulkKeys) || !this.selectedBucket || !this.emailShareAddress || !this.emailShareAddress.trim() || this.emailSharing) {
            return;
        }
        this.emailSharing = true;
        this.fileShareService.sendFile({
            bucket: this.selectedBucket,
            key: bulkKeys ? undefined : entry.key,
            keys: bulkKeys ? bulkKeys : undefined,
            recipientEmail: this.emailShareAddress.trim(),
            message: this.emailShareMessage.trim()
        }).pipe(first()).subscribe((response) => {
            this.emailSharing = false;
            if (response.status === ApiCode.SUCCESS) {
                this.alertService.showSuccess(response.message || 'Email sent.', this.SUCCESS);
                this.emailShareEntry = null;
                this.emailShareBulkKeys = null;
                this.closeModal(this.closeEmailShareModal);
            } else {
                this.alertService.showError(response.message, this.ERROR);
            }
        }, (error) => {
            this.emailSharing = false;
            this.alertService.showError(error, this.ERROR);
        });
    }

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

        const bucket = this.selectedBucket;
        const prefix = this.currentPrefix;
        const uploadNext = (index: number) => {
            if (index >= files.length) {
                this.uploading = false;
                input.value = '';
                if (bucket === this.selectedBucket && prefix === this.currentPrefix) {
                    this.loadObjects(true);
                }
                return;
            }
            this.storageService.uploadObject(bucket, prefix, files[index])
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
