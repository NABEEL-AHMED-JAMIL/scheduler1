import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Dialog } from '@angular/cdk/dialog';
import { Subject, of } from 'rxjs';
import { Analytics, dateOnly, plainDecimal } from './analytics';
import {
  AnalysisResult, AnalyticsService, ColumnProfile, DatasetPreview, DatasetProfile, FilterGroup,
  QueryResult, QueryRun, SavedAnalysis, SavedQuery,
} from './analytics.service';
import { BucketSummary, ObjectSummary, StorageService } from '../objects/storage.service';

/**
 * Analytics Studio's frontend, which had no test at all.
 *
 * Four things are pinned here and each is pinned because it can drift silently. readable() is a
 * SECOND COPY of an extension list the server owns in DatasetRef.Format.of -- they agree today,
 * and nothing but a test would notice the day someone adds a reader on one side only. The four
 * states of the dataset pane are the whole screen from a reader's point of view and three of them
 * are failure or waiting, which is where a refactor lands first. The paging bounds and the
 * carried total are arithmetic against a server contract. And the folder filter has to clear on
 * navigation, because a filter that survives a folder change hides files in a folder the user
 * has just opened and looks like an empty bucket.
 *
 * Phase two added a fifth thing, and it is the one worth reading first: THE HEDGES ON THE THREE
 * FIGURES THAT ARE NOT EXACT. A distinct count is a sketch, a null row count is reconstructed
 * from a percentage rounded to two places, and a text column's min and max are alphabetical.
 * Those hedges live in the TEMPLATE, so asserting them against the component's signals would
 * assert nothing -- "the three figures that are not exact" renders the studio and reads the
 * screen, because the screen is where the claim is made. A refactor that drops the word
 * "estimated" from beside a number is exactly the kind that leaves every signal test green.
 */

const SERVER_RESPONSE = <T>(data: T) => ({ status: 'SUCCESS' as const, message: '', data });
const SERVER_REFUSAL = (message: string) => ({ status: 'ERROR' as const, message, data: undefined });

const MINIO: BucketSummary = { label: 'MinIO Main', bucket: 'minio-main', provider: 'MINIO' };
const S3: BucketSummary = { label: 'Reports S3', bucket: 'reports-s3', provider: 'S3' };
const AZURE: BucketSummary = { label: 'Blob Archive', bucket: 'blob-archive', provider: 'AZURE' };
const FTP: BucketSummary = { label: 'Partner Drop', bucket: 'partner-drop', provider: 'FTP' };
const FTPS: BucketSummary = { label: 'Secure Drop', bucket: 'secure-drop', provider: 'FTPS' };

// A BUCKET_LIST lookup child, which storage.json/buckets merges into the same list. It has no
// storage_connection row behind it, so the resolver answers "Storage connection not found." for
// every file in it; its "provider" is really the lookup's free-text description.
const LEGACY: BucketSummary = {
  label: 'Legacy Bucket', bucket: 'legacy-bucket', provider: 'Configured for the object browser',
};

const CSV_FILE: ObjectSummary = {
  name: 'sales-2026.csv', key: 'daily/sales-2026.csv', folder: false, size: 4096,
  lastModified: '2026-09-08T14:55:40.779Z',
};
const TEXT_FILE: ObjectSummary = { name: 'notes.txt', key: 'daily/notes.txt', folder: false };
const FOLDER: ObjectSummary = { name: 'archive', key: 'archive/', folder: true };

const SCHEMA = {
  bucket: 'minio-main', path: 'daily/sales-2026.csv', format: 'CSV', multiFile: false,
  columns: [{ name: 'id', type: 'BIGINT' }, { name: 'amount', type: 'DECIMAL(18,3)' }],
};

function pageOf(over: Partial<DatasetPreview> = {}): DatasetPreview {
  return {
    columns: ['id', 'amount'], rows: [['1', '9.50']], page: 0, pageSize: 100,
    totalRows: 250, multiFile: false, ...over,
  };
}

/**
 * A studio wired to stubbed services, already past ngOnInit.
 *
 * The storage calls answer immediately because browsing is not what is being tested; the
 * analytics calls hand back a fresh Subject each time so a test can hold the screen in its
 * loading state, then decide whether that request succeeded or failed.
 */
function studioWith(over: { connections?: BucketSummary[]; objects?: ObjectSummary[] } = {}) {
  const answers: { schema?: Subject<any>; preview?: Subject<any>; profile?: Subject<any> } = {};
  const listObjects = vi.fn(() => of(SERVER_RESPONSE({ objects: over.objects ?? [] })));
  const buckets = vi.fn(() => of(SERVER_RESPONSE(over.connections ?? [MINIO])));
  const schema = vi.fn(() => (answers.schema = new Subject<any>()).asObservable());
  const preview = vi.fn(() => (answers.preview = new Subject<any>()).asObservable());
  const profile = vi.fn(() => (answers.profile = new Subject<any>()).asObservable());

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: StorageService, useValue: { buckets, listObjects } },
      { provide: AnalyticsService, useValue: { schema, preview, profile } },
    ],
  });
  const studio = TestBed.runInInjectionContext(() => new Analytics());
  studio.ngOnInit();
  return { studio, answers, schema, preview, profile, listObjects };
}

/** Opens CSV_FILE and settles both requests, leaving the pane in its loaded state. */
function opened(over: Partial<DatasetPreview> = {}) {
  const harness = studioWith({ objects: [FOLDER, CSV_FILE, TEXT_FILE] });
  harness.studio.openFile(CSV_FILE);
  harness.answers.schema!.next(SERVER_RESPONSE(SCHEMA));
  harness.answers.preview!.next(SERVER_RESPONSE(pageOf(over)));
  return harness;
}

// ---------------------------------------------------------------------------------------------

describe('which connections the picker offers', () => {
  const ALL = [FTP, AZURE, LEGACY, MINIO, S3, FTPS];

  it('offers an object-store connection with no reason against it', () => {
    const { studio } = studioWith({ connections: ALL });
    const issues = new Map(studio.connectionOptions().map(o => [o.bucket, o.issue]));
    expect(issues.get('minio-main')).toBe('');
    expect(issues.get('reports-s3')).toBe('');
  });

  it('lists an unreadable connection rather than hiding it, with the reason on it', () => {
    const { studio } = studioWith({ connections: ALL });
    // Every one the rail returned is still in the picker; none of them disappeared.
    expect(studio.connectionOptions().map(o => o.bucket))
      .toEqual(['partner-drop', 'blob-archive', 'legacy-bucket', 'minio-main', 'reports-s3', 'secure-drop']);

    const issues = new Map(studio.connectionOptions().map(o => [o.bucket, o.issue]));
    expect(issues.get('partner-drop')).toContain('this connection is FTP');
    expect(issues.get('secure-drop')).toContain('this connection is FTPS');
    expect(issues.get('legacy-bucket')).toContain('not configured as an object-storage connection');
  });

  it('says Azure is unverified rather than untried, matching what the server now refuses', () => {
    const { studio } = studioWith({ connections: [AZURE, MINIO] });
    const azure = studio.connectionOptions().find(o => o.bucket === 'blob-archive');
    expect(azure!.issue).toBe('Analytics Studio has not been verified against Azure Blob yet.');
  });

  it('treats a connection with no provider recorded as one it cannot read', () => {
    const { studio } = studioWith({
      connections: [{ label: 'Half configured', bucket: 'half', provider: '' }, MINIO],
    });
    expect(studio.connectionOptions()[0].issue).not.toBe('');
  });

  it('opens on the first READABLE connection, not simply the first', () => {
    const { studio } = studioWith({ connections: ALL });
    expect(studio.connection()).toBe('minio-main');
  });

  it('refuses to select an unreadable connection, and does not browse it', () => {
    const { studio, listObjects } = studioWith({ connections: ALL });
    listObjects.mockClear();

    studio.pickConnection('partner-drop');

    expect(studio.connection()).toBe('minio-main');
    expect(listObjects).not.toHaveBeenCalled();
  });

  it('selects nothing, and says so, when not one connection can be read', () => {
    const { studio } = studioWith({ connections: [FTP, AZURE, LEGACY] });
    expect(studio.connection()).toBe('');
    expect(studio.noReadableConnection()).toBe(true);
  });

  it('does not claim connections are unreadable when there are none at all', () => {
    const { studio } = studioWith({ connections: [] });
    expect(studio.noReadableConnection()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------

describe('readable() against the server format list', () => {
  // DatasetRef.Format.of takes the text after the LAST dot, lowercased, and maps exactly these.
  // Anything else returns null and the resolver refuses the file.
  const SERVER_READS = ['csv', 'tsv', 'json', 'jsonl', 'ndjson', 'parquet'];
  const SERVER_REFUSES = ['txt', 'xlsx', 'xls', 'gz', 'zip', 'pdf', 'avro', 'orc', 'log'];

  it('accepts every extension DatasetRef.Format.of maps', () => {
    const { studio } = studioWith();
    for (const extension of SERVER_READS) {
      expect(studio.readable(`daily/part-0.${extension}`), extension).toBe(true);
    }
  });

  it('refuses every extension DatasetRef.Format.of returns null for', () => {
    const { studio } = studioWith();
    for (const extension of SERVER_REFUSES) {
      expect(studio.readable(`daily/part-0.${extension}`), extension).toBe(false);
    }
  });

  it('reads the LAST extension, so a compressed csv is refused on both sides', () => {
    const { studio } = studioWith();
    expect(studio.readable('daily/sales.csv.gz')).toBe(false);
  });

  it('is case-insensitive, as the server is by lowercasing first', () => {
    const { studio } = studioWith();
    expect(studio.readable('DAILY/SALES.PARQUET')).toBe(true);
    expect(studio.readable('Daily/Sales.Csv')).toBe(true);
  });

  it('refuses a file with no extension, where the server finds no dot to split on', () => {
    const { studio } = studioWith();
    expect(studio.readable('daily/README')).toBe(false);
    expect(studio.readable('daily/trailing.')).toBe(false);
  });

  it('does not open a file it says is unreadable', () => {
    const { studio, schema } = studioWith({ objects: [TEXT_FILE] });
    studio.openFile(TEXT_FILE);
    expect(schema).not.toHaveBeenCalled();
    expect(studio.hasDataset()).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the four states of the dataset pane', () => {
  it('nothing selected: no dataset, nothing loading, nothing wrong', () => {
    const { studio } = studioWith({ objects: [CSV_FILE] });
    expect(studio.hasDataset()).toBe(false);
    expect(studio.loading()).toBe(false);
    expect(studio.error()).toBe('');
    expect(studio.preview()).toBeNull();
  });

  it('loading: the dataset is named and in flight before either request answers', () => {
    const { studio } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);

    expect(studio.hasDataset()).toBe(true);
    expect(studio.datasetName()).toBe('sales-2026.csv');
    expect(studio.loading()).toBe(true);
    expect(studio.error()).toBe('');
    expect(studio.columns()).toEqual([]);
  });

  it('loading: still loading between the schema answering and the first page', () => {
    const { studio, answers } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    answers.schema!.next(SERVER_RESPONSE(SCHEMA));

    expect(studio.loading()).toBe(true);
    expect(studio.columnCount()).toBe(2);
    expect(studio.preview()).toBeNull();
  });

  it('error: a business refusal is shown in the words the server chose', () => {
    const { studio, answers, preview } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    answers.schema!.next(SERVER_REFUSAL('Storage connection not found.'));

    expect(studio.error()).toBe('Storage connection not found.');
    expect(studio.loading()).toBe(false);
    // The page is never asked for once the schema has been refused.
    expect(preview).not.toHaveBeenCalled();
  });

  it('error: a transport failure falls back to a sentence rather than a stack trace', () => {
    const { studio, answers } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    answers.schema!.error({ error: { message: 'Too many analytics queries are running right now.' } });

    expect(studio.error()).toBe('Too many analytics queries are running right now.');
    expect(studio.loading()).toBe(false);
  });

  it('error: a failure with no message at all still says something readable', () => {
    const { studio, answers } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    answers.schema!.error({});

    expect(studio.error()).toBe('The dataset could not be read.');
  });

  it('error: retry clears it and starts the whole open again', () => {
    const { studio, answers, schema } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    answers.schema!.next(SERVER_REFUSAL('Storage connection not found.'));

    studio.retry();

    expect(studio.error()).toBe('');
    expect(studio.loading()).toBe(true);
    expect(schema).toHaveBeenCalledTimes(2);
    expect(schema).toHaveBeenLastCalledWith('minio-main', 'daily/sales-2026.csv');
  });

  it('loaded: columns, rows and the counts that come from two different requests', () => {
    const { studio } = opened();

    expect(studio.loading()).toBe(false);
    expect(studio.error()).toBe('');
    expect(studio.format()).toBe('CSV');
    expect(studio.multiFile()).toBe(false);
    expect(studio.columnCount()).toBe(2);
    expect(studio.rowCount()).toBe(250);
    expect(studio.preview()!.rows).toEqual([['1', '9.50']]);
  });

  it('a new connection empties the pane, so no dataset outlives the bucket it came from', () => {
    const { studio } = opened();
    studio.pickConnection('minio-main');

    expect(studio.hasDataset()).toBe(false);
    expect(studio.preview()).toBeNull();
    expect(studio.columns()).toEqual([]);
    expect(studio.error()).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------

describe('reading a whole folder as one dataset', () => {
  it('builds the pattern it claims to, from the folder the rail is standing in', () => {
    const { studio, schema } = studioWith({ objects: [CSV_FILE] });
    studio.openFolder('archive/2026/');
    studio.openFolderAsDataset('parquet');

    expect(studio.path()).toBe('archive/2026/*.parquet');
    expect(schema).toHaveBeenLastCalledWith('minio-main', 'archive/2026/*.parquet');
  });

  it('has no prefix at the root, where the folder is the bucket itself', () => {
    const { studio } = studioWith({ objects: [CSV_FILE] });
    studio.openFolderAsDataset('csv');
    expect(studio.path()).toBe('*.csv');
  });

  it('is a pattern and not a file, so nothing claims a size or a modified date', () => {
    const { studio } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    expect(studio.selected()).not.toBeNull();

    studio.openFolderAsDataset('csv');
    expect(studio.selected()).toBeNull();
    expect(studio.modifiedAt()).toBe('');
  });

  it('names the pattern in the header rather than the folder above it', () => {
    const { studio } = studioWith({ objects: [CSV_FILE] });
    studio.openFolder('archive/2026/');
    studio.openFolderAsDataset('parquet');
    expect(studio.datasetName()).toBe('*.parquet');
  });

  it('offers only the formats actually present in the folder, deduplicated and sorted', () => {
    const { studio } = studioWith({
      objects: [
        FOLDER, TEXT_FILE,
        { name: 'a.parquet', key: 'a.parquet', folder: false },
        { name: 'b.parquet', key: 'b.parquet', folder: false },
        { name: 'c.CSV', key: 'c.CSV', folder: false },
      ],
    });
    expect(studio.folderFormats()).toEqual(['csv', 'parquet']);
  });
});

// ---------------------------------------------------------------------------------------------

describe('paging', () => {
  it('rounds a partial last page up', () => {
    expect(opened({ totalRows: 250, pageSize: 100 }).studio.pageCount()).toBe(3);
    expect(opened({ totalRows: 200, pageSize: 100 }).studio.pageCount()).toBe(2);
    expect(opened({ totalRows: 1, pageSize: 100 }).studio.pageCount()).toBe(1);
  });

  it('is no pages at all before anything has been read, and never divides by zero', () => {
    expect(studioWith().studio.pageCount()).toBe(0);
    expect(opened({ pageSize: 0 }).studio.pageCount()).toBe(0);
    expect(opened({ totalRows: 0 }).studio.pageCount()).toBe(0);
  });

  it('turns forward within range', () => {
    const { studio, preview } = opened({ page: 0, totalRows: 250 });
    preview.mockClear();

    studio.nextPage();

    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 1, 250);
  });

  it('will not run off the end', () => {
    const { studio, preview } = opened({ page: 2, totalRows: 250 });
    preview.mockClear();

    studio.nextPage();

    expect(preview).not.toHaveBeenCalled();
  });

  it('turns back within range', () => {
    const { studio, preview } = opened({ page: 2, totalRows: 250 });
    preview.mockClear();

    studio.previousPage();

    expect(preview).toHaveBeenCalledTimes(1);
    expect(preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 1, 250);
  });

  it('will not run off the front', () => {
    const { studio, preview } = opened({ page: 0, totalRows: 250 });
    preview.mockClear();

    studio.previousPage();

    expect(preview).not.toHaveBeenCalled();
  });

  it('turns no page when there is no dataset to turn', () => {
    const { studio, preview } = studioWith();
    studio.loadPage(3);
    expect(preview).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------------------------

describe('carrying the row count forward', () => {
  it('does not send a total on a first load, where nothing has counted the dataset', () => {
    const { studio, answers, preview } = studioWith({ objects: [CSV_FILE] });
    studio.openFile(CSV_FILE);
    answers.schema!.next(SERVER_RESPONSE(SCHEMA));

    expect(preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 0, undefined);
  });

  it('sends the total it is already holding on a page turn, so the server skips the COUNT', () => {
    const { studio, preview } = opened({ page: 0, totalRows: 250 });
    preview.mockClear();

    studio.nextPage();

    expect(preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 1, 250);
  });

  it('sends it turning back as well, which is the same dataset counted the same moment ago', () => {
    const { studio, preview } = opened({ page: 2, totalRows: 250 });
    preview.mockClear();

    studio.previousPage();

    expect(preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 1, 250);
  });

  it('forgets it when the dataset is reopened, because that count is a fresh one', () => {
    const harness = opened({ page: 0, totalRows: 250 });
    harness.preview.mockClear();

    harness.studio.retry();
    harness.answers.schema!.next(SERVER_RESPONSE(SCHEMA));

    expect(harness.preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 0, undefined);
  });

  it('carries the total the LAST response gave, not the one the first did', () => {
    const harness = opened({ page: 0, totalRows: 250 });
    harness.studio.nextPage();
    // A folder dataset gaining a file mid-read is exactly why the server is allowed to disagree.
    harness.answers.preview!.next(SERVER_RESPONSE(pageOf({ page: 1, totalRows: 400 })));
    harness.preview.mockClear();

    harness.studio.nextPage();

    expect(harness.preview).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv', 2, 400);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the folder filter', () => {
  const ENTRIES: ObjectSummary[] = [
    FOLDER,
    { name: 'archive-old', key: 'archive-old/', folder: true },
    CSV_FILE,
    TEXT_FILE,
  ];

  it('narrows folders and files together', () => {
    const { studio } = studioWith({ objects: ENTRIES });
    expect(studio.filtered()).toBe(false);

    studio.filter.set('archive');

    expect(studio.folders().map(f => f.key)).toEqual(['archive/', 'archive-old/']);
    expect(studio.files()).toEqual([]);
    expect(studio.filtered()).toBe(true);
  });

  it('matches any part of the name, case-insensitively, and trims what was typed', () => {
    const { studio } = studioWith({ objects: ENTRIES });

    studio.filter.set('  SALES  ');

    expect(studio.files().map(f => f.key)).toEqual(['daily/sales-2026.csv']);
  });

  it('reports nothing narrowed when the filter matches everything', () => {
    const { studio } = studioWith({ objects: ENTRIES });

    // A needle every one of the four names contains. The count is asserted first so that a
    // future entry without an "e" in it fails as a broken premise rather than as a broken
    // filtered(), which is the mistake this test was originally written with.
    studio.filter.set('e');

    expect(studio.folders().length + studio.files().length).toBe(ENTRIES.length);
    expect(studio.filtered()).toBe(false);
  });

  it('narrows the folder-as-dataset offer to the formats still showing', () => {
    const { studio } = studioWith({
      objects: [CSV_FILE, { name: 'x.parquet', key: 'daily/x.parquet', folder: false }],
    });
    expect(studio.folderFormats()).toEqual(['csv', 'parquet']);

    studio.filter.set('sales');

    expect(studio.folderFormats()).toEqual(['csv']);
  });

  it('clears on opening a folder, so it cannot hide what is inside the one just opened', () => {
    const { studio } = studioWith({ objects: ENTRIES });
    studio.filter.set('sales');
    studio.openFolder('archive/');
    expect(studio.filter()).toBe('');
  });

  it('clears on a breadcrumb, on the root, and on a new connection', () => {
    const { studio } = studioWith({ objects: ENTRIES });

    studio.filter.set('sales');
    studio.goToCrumb('archive/');
    expect(studio.filter()).toBe('');

    studio.filter.set('sales');
    studio.goToRoot();
    expect(studio.filter()).toBe('');

    studio.filter.set('sales');
    studio.pickConnection('minio-main');
    expect(studio.filter()).toBe('');
  });
});

// ---------------------------------------------------------------------------------------------

/**
 * A column profile carrying every field the server sends, so a test can change exactly one.
 *
 * The default is a well-behaved BIGINT: complete, plenty of distinct values, a real spread and
 * nothing far from its own mean. Every quality test below is that column with one thing wrong.
 */
function columnOf(over: Partial<ColumnProfile> = {}): ColumnProfile {
  return {
    name: 'amount', type: 'BIGINT',
    min: '1', max: '1000', avg: '412.5', std: '190.25',
    approxQ25: '210', approxQ50: '400', approxQ75: '780',
    approxDistinct: 940, nullPercentage: 0, completeness: 100, approxNullRows: 0,
    allNull: false, constant: false, keyLike: false, typeSurprise: null,
    ...over,
  };
}

/** A text column, which is where the quartiles are absent and min/max are alphabetical. */
function textColumn(over: Partial<ColumnProfile> = {}): ColumnProfile {
  return columnOf({
    name: 'region', type: 'VARCHAR', min: 'alpha', max: 'zulu',
    avg: null, std: null, approxQ25: null, approxQ50: null, approxQ75: null, ...over,
  });
}

function profileOf(columns: ColumnProfile[], totalRows = 1000): DatasetProfile {
  return {
    bucket: 'minio-main', path: 'daily/sales-2026.csv', format: 'CSV',
    multiFile: false, totalRows, columns,
  };
}

/** Opens CSV_FILE, moves to the Profile tab and settles the scan. */
function profiled(columns: ColumnProfile[], totalRows = 1000) {
  const harness = opened();
  harness.studio.showTab('profile');
  harness.answers.profile!.next(SERVER_RESPONSE(profileOf(columns, totalRows)));
  return harness;
}

/** The single view of a column, for the tests that only care about one. */
function viewOf(column: ColumnProfile) {
  return profiled([column]).studio.profileColumns()[0];
}

// ---------------------------------------------------------------------------------------------

describe('the profile scan is paid for once, by the reader who asks for it', () => {
  it('is not requested when a file is opened', () => {
    // A file open already costs three sessions against a governor that admits four. A fourth on
    // every open, for a tab most readers never open, is the wrong direction.
    const { profile } = opened();
    expect(profile).not.toHaveBeenCalled();
  });

  it('is requested the first time the Profile tab is opened', () => {
    const { studio, profile } = opened();

    studio.showTab('profile');

    expect(profile).toHaveBeenCalledTimes(1);
    expect(profile).toHaveBeenCalledWith('minio-main', 'daily/sales-2026.csv');
    expect(studio.profileLoading()).toBe(true);
  });

  it('is requested by the Quality tab too, because it is the same scan', () => {
    const { studio, profile } = opened();
    studio.showTab('quality');
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it('is not scanned twice when the reader visits both tabs', () => {
    const harness = profiled([columnOf()]);
    harness.studio.showTab('quality');
    harness.studio.showTab('profile');
    expect(harness.profile).toHaveBeenCalledTimes(1);
  });

  it('is not requested twice while the first request is still in flight', () => {
    const { studio, profile } = opened();
    studio.showTab('profile');
    studio.showTab('quality');
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it('is forgotten when the dataset is reopened, because it describes one dataset', () => {
    const harness = profiled([columnOf()]);
    expect(harness.studio.profile()).not.toBeNull();

    harness.studio.retry();

    expect(harness.studio.profile()).toBeNull();
    expect(harness.studio.profileColumns()).toEqual([]);
  });

  it('is forgotten when a new connection empties the pane', () => {
    const harness = profiled([columnOf()]);
    harness.studio.pickConnection('minio-main');
    expect(harness.studio.profile()).toBeNull();
    expect(harness.studio.profileError()).toBe('');
  });

  it('still moves to the tab it was asked for', () => {
    const { studio } = opened();
    studio.showTab('quality');
    expect(studio.tab()).toBe('quality');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the states of the Profile tab', () => {
  it('loading: in flight, with nothing to draw and nothing wrong', () => {
    const { studio } = opened();
    studio.showTab('profile');

    expect(studio.profileLoading()).toBe(true);
    expect(studio.profileError()).toBe('');
    expect(studio.profile()).toBeNull();
    expect(studio.profileColumns()).toEqual([]);
  });

  it('error: a business refusal is shown in the words the server chose', () => {
    const { studio, answers } = opened();
    studio.showTab('profile');

    answers.profile!.next(SERVER_REFUSAL('Too many analytics queries are running right now.'));

    expect(studio.profileError()).toBe('Too many analytics queries are running right now.');
    expect(studio.profileLoading()).toBe(false);
    expect(studio.profile()).toBeNull();
  });

  it('error: a failure with no message at all still says something readable', () => {
    const { studio, answers } = opened();
    studio.showTab('profile');
    answers.profile!.error({});
    expect(studio.profileError()).toBe('The dataset could not be profiled.');
  });

  it('error: coming back to the tab does not silently spend another permit', () => {
    // The one request per click would be a request per click, against the governor, for a scan
    // that has just failed. It waits for the Try again the shell already draws.
    const { studio, answers, profile } = opened();
    studio.showTab('profile');
    answers.profile!.next(SERVER_REFUSAL('The dataset could not be read.'));
    profile.mockClear();

    studio.showTab('data');
    studio.showTab('profile');

    expect(profile).not.toHaveBeenCalled();
    expect(studio.profileError()).toBe('The dataset could not be read.');
  });

  it('error: Try again clears it and scans once more', () => {
    const { studio, answers, profile } = opened();
    studio.showTab('profile');
    answers.profile!.next(SERVER_REFUSAL('The dataset could not be read.'));
    profile.mockClear();

    studio.loadProfile();

    expect(studio.profileError()).toBe('');
    expect(studio.profileLoading()).toBe(true);
    expect(profile).toHaveBeenCalledTimes(1);
  });

  it('error: a failed scan leaves the rows that did load alone', () => {
    // Two requests with two fates. A reader on the Data tab must not be told the dataset could
    // not be read because a tab they have not opened could not be scanned.
    const { studio, answers } = opened();
    studio.showTab('profile');
    answers.profile!.error({ error: { message: 'Analytics query timed out.' } });

    expect(studio.profileError()).toBe('Analytics query timed out.');
    expect(studio.error()).toBe('');
    expect(studio.preview()!.rows).toEqual([['1', '9.50']]);
  });

  it('loaded: the figures the server measured, per column', () => {
    const { studio } = profiled([columnOf(), textColumn()], 5000);

    expect(studio.profileLoading()).toBe(false);
    expect(studio.profileError()).toBe('');
    expect(studio.profileColumns().map(column => column.name)).toEqual(['amount', 'region']);
    expect(studio.profileColumns()[0].rows).toBe(5000);
  });

  it('loaded: takes the completeness the server sent rather than subtracting its own', () => {
    // Two roundings of the same figure disagree by a hundredth on screen sooner or later.
    const view = viewOf(columnOf({ nullPercentage: 12.34, completeness: 87.66 }));
    expect(view.filledPercent).toBe(87.66);
    expect(view.nullPercent).toBe(12.34);
  });

  it('loaded: a dataset with no rows has no percentage, and does not invent one', () => {
    const view = viewOf(columnOf({ nullPercentage: null, completeness: null, approxNullRows: null }));
    expect(view.measured).toBe(false);
    expect(view.approxNullRows).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------

describe('the three figures that are not exact', () => {
  /** The studio rendered, because the hedges are on the screen rather than in the signals. */
  function renderedStudio() {
    const answers: { schema?: Subject<any>; preview?: Subject<any>; profile?: Subject<any> } = {};
    const listObjects = vi.fn(() => of(SERVER_RESPONSE({ objects: [CSV_FILE] })));
    const buckets = vi.fn(() => of(SERVER_RESPONSE([MINIO])));
    const schema = vi.fn(() => (answers.schema = new Subject<any>()).asObservable());
    const preview = vi.fn(() => (answers.preview = new Subject<any>()).asObservable());
    const profile = vi.fn(() => (answers.profile = new Subject<any>()).asObservable());

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: StorageService, useValue: { buckets, listObjects } },
        { provide: AnalyticsService, useValue: { schema, preview, profile } },
      ],
    });
    const fixture = TestBed.createComponent(Analytics);
    fixture.detectChanges();
    const studio = fixture.componentInstance;
    studio.openFile(CSV_FILE);
    answers.schema!.next(SERVER_RESPONSE(SCHEMA));
    answers.preview!.next(SERVER_RESPONSE(pageOf()));

    return {
      studio,
      /** Everything a person can read on the screen, with the template's whitespace collapsed. */
      show(columns: ColumnProfile[], totalRows = 1000, tab: 'profile' | 'quality' = 'profile') {
        studio.showTab(tab);
        answers.profile!.next(SERVER_RESPONSE(profileOf(columns, totalRows)));
        fixture.detectChanges();
        return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
      },
      /** The statistic labels on the profile cards, which is where "min" is or is not said. */
      statLabels() {
        return [...(fixture.nativeElement as HTMLElement).querySelectorAll('dt')]
          .map(label => (label.textContent ?? '').trim());
      },
    };
  }

  it('claims no clean bill of health on a dataset it never examined', () => {
    // A header-only file: columns, no rows. The normal shape of a botched export, and precisely
    // the file this tab exists for. It used to answer "Checked 1 column: none is empty, none is
    // more than 5% empty..." -- five claims about an examination that never happened, and "none
    // is empty" the exact opposite of the truth. Asserted against the SCREEN, because the
    // component's own qualityFindings() was already correctly empty in this state; the lie was
    // entirely in what the template said about that emptiness.
    const text = renderedStudio().show([columnOf()], 0, 'quality');

    expect(text).toContain('no rows, so there was nothing to check');
    expect(text).not.toContain('none is empty');
    expect(text).not.toContain('Checked 1 column:');
  });

  it('still gives a real clean bill when it actually examined something', () => {
    // The control. A gate that refused to say "clean" in every case would pass the test above
    // while making the tab useless on the datasets that are genuinely fine.
    const text = renderedStudio().show([columnOf()], 5000, 'quality');

    expect(text).toContain('Nothing needs attention.');
    expect(text).toContain('Checked 1 column:');
  });

  it('does not claim a column is completely full when the engine only rounded to 100', () => {
    // null_percentage is DECIMAL(9,2), so one empty row in ten million rounds to 0.00. The card
    // printed a bare "100% filled" and the quality tab raised nothing, so both halves of the
    // screen agreed on a completeness neither had measured.
    const text = renderedStudio().show(
      [columnOf({ nullPercentage: 0, completeness: 100, approxNullRows: 0 })], 10000000);

    expect(text).toContain('none measured empty');
  });

  it('shows a failed scan as a failure even when the server sent no words with it', () => {
    // The business-refusal branch had no fallback, unlike the transport one. An empty message
    // left profileError falsy, and a FAILED scan rendered as "Nothing needs attention." -- the
    // one failure mode where saying nothing is worse than saying the wrong thing.
    const rendered = renderedStudio();
    rendered.studio.showTab('quality');
    const text = rendered.show([], 0, 'quality');

    expect(text).not.toContain('Nothing needs attention.');
  });

  it('never prints the distinct estimate as an exact-looking count', () => {
    const text = renderedStudio().show([columnOf({ approxDistinct: 1234 })], 5000);

    expect(text).toContain('≈ 1.2K');
    expect(text).toContain('distinct values (estimated)');
    // The number the estimator did not measure. Printing it would be the first lie on the screen.
    expect(text).not.toContain('1,234');
  });

  it('says "about" in front of every row count derived from the rounded percentage', () => {
    const text = renderedStudio().show(
      [columnOf({ nullPercentage: 12.5, completeness: 87.5, approxNullRows: 625 })], 5000);

    expect(text).toContain('87.5% filled');
    expect(text).toContain('about 625 of 5,000 rows empty');
  });

  it('labels a text column’s extremes as alphabetical rather than as min and max', () => {
    // The labels REPLACE min and max rather than sitting beside them. Two names for one figure
    // is how the surprising reading gets mistaken for the reassuring one.
    const studio = renderedStudio();
    studio.show([textColumn()]);

    expect(studio.statLabels()).toEqual(['first (A–Z)', 'last (A–Z)']);
  });

  it('calls a numeric column’s extremes min and max, where that is what they are', () => {
    const studio = renderedStudio();
    const text = studio.show([columnOf()]);

    expect(studio.statLabels()).toEqual(['min', 'max', 'mean', 'std dev']);
    expect(text).toContain('quartiles estimated');
  });

  it('says the quartiles are estimated where it draws them', () => {
    const text = renderedStudio().show([columnOf()]);

    expect(text).toContain('quartiles estimated');
    expect(text).toContain('Each block holds about a quarter of the rows');
  });

  it('shows what IS true about a column with no distribution, not an empty chart frame', () => {
    const text = renderedStudio().show([textColumn()]);

    expect(text).toContain('No distribution to draw');
    expect(text).toContain('distinct values (estimated)');
    expect(text).toContain('% filled');
  });

  it('says out loud that duplicate rows were not counted', () => {
    const text = renderedStudio().show([columnOf()], 1000, 'quality');
    expect(text).toContain('Duplicate rows are not part of this check');
  });

  it('writes a percentage the way the engine measured it, without rounding it further', () => {
    const { studio } = opened();
    expect(studio.percent(38.24)).toBe('38.24');
    expect(studio.percent(38.2)).toBe('38.2');
    expect(studio.percent(100)).toBe('100');
    expect(studio.percent(0)).toBe('0');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the quartile spread', () => {
  it('is four blocks spanning min to max, each holding about a quarter of the rows', () => {
    const spread = viewOf(columnOf()).spread;

    expect(spread.length).toBe(4);
    expect(spread[0].from).toBe(1);
    expect(spread[3].to).toBe(1000);
    expect(spread.reduce((sum, block) => sum + block.width, 0)).toBeCloseTo(100);
    expect(spread[0].label).toContain('About a quarter of the values sit between');
  });

  it('places the blocks by value, so a crowd shows as a narrow one', () => {
    // Three quarters of the rows inside the first 3% of the range is the whole point of drawing
    // this: a mean of 100 would have said nothing about it.
    const spread = viewOf(columnOf({
      min: '0', approxQ25: '10', approxQ50: '20', approxQ75: '30', max: '1000',
    })).spread;

    expect(spread[0].width).toBeCloseTo(1);
    expect(spread[3].width).toBeCloseTo(97);
  });

  it('draws none for a VARCHAR column, which has no quartiles at all', () => {
    expect(viewOf(textColumn()).spread).toEqual([]);
  });

  it('draws none for a DATE column, whose quartiles are present and are not numbers', () => {
    // The trap a naive parse falls into: DATE is the one non-numeric type SUMMARIZE gives
    // quartiles for, and Number('2026-06-15') is NaN rather than an error.
    const view = viewOf(columnOf({
      type: 'DATE', min: '2026-01-01', max: '2026-12-31', avg: null, std: null,
      approxQ25: '2026-03-01', approxQ50: '2026-06-15', approxQ75: '2026-09-20',
    }));

    expect(view.spread).toEqual([]);
    // And the dates are shown as the file spells them, not run through a number formatter.
    expect(view.minLabel).toBe('2026-01-01');
    expect(view.maxLabel).toBe('2026-12-31');
  });

  it('draws none where every value is the same, rather than dividing by a zero span', () => {
    const view = viewOf(columnOf({
      min: '5', max: '5', approxQ25: '5', approxQ50: '5', approxQ75: '5',
    }));
    expect(view.spread).toEqual([]);
  });

  it('keeps a text column’s value exactly as the file holds it', () => {
    // "007" tidied to 7 would print a value that is not in the file, on the one column type
    // where the string IS the value.
    const view = viewOf(textColumn({ min: '007', max: '9' }));
    expect(view.minLabel).toBe('007');
    expect(view.maxLabel).toBe('9');
  });

  it('tidies a numeric column’s full-precision mean into a number a person reads', () => {
    const view = viewOf(columnOf({ avg: '402.14285714285717' }));
    expect(view.avgLabel).toBe('402.14');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the Quality tab leads with what needs attention', () => {
  it('a clean dataset says so plainly and flags nothing', () => {
    const { studio } = profiled([columnOf(), columnOf({ name: 'id', approxDistinct: 1000 })]);

    expect(studio.qualityFindings()).toEqual([]);
    expect(studio.qualityClean()).toBe(true);
    expect(studio.qualityChecked()).toBe(2);
    expect(studio.qualityClearCount()).toBe(2);
  });

  it('does not treat a key-like column as a problem', () => {
    // An id column is not a fault, and flagging one would make "nothing needs attention" a
    // state no real dataset ever reaches. The Profile card describes it instead.
    const { studio } = profiled([columnOf({ name: 'id', approxDistinct: 1000, keyLike: true })]);

    expect(studio.qualityFindings()).toEqual([]);
    expect(studio.profileColumns()[0].keyLike).toBe(true);
  });

  it('is not clean before anything has been scanned', () => {
    const { studio } = opened();
    studio.showTab('quality');
    expect(studio.qualityClean()).toBe(false);
    expect(studio.qualityChecked()).toBe(0);
  });

  const BROKEN = [
    columnOf({
      name: 'notes', type: 'VARCHAR', allNull: true, nullPercentage: 100, completeness: 0,
      approxNullRows: 5000, approxDistinct: 0, min: null, max: null, avg: null, std: null,
      approxQ25: null, approxQ50: null, approxQ75: null,
    }),
    textColumn({
      name: 'region', nullPercentage: 38.24, completeness: 61.76, approxNullRows: 1912,
      approxDistinct: 1, constant: true, min: 'GB', max: 'GB',
    }),
    textColumn({
      name: 'postcode', typeSurprise: 'NUMBER', min: '00123', max: '99999',
    }),
    columnOf(),
  ];

  it('puts the loudest finding first and the untouched column nowhere', () => {
    const { studio } = profiled(BROKEN, 5000);

    expect(studio.qualityFindings().map(finding => finding.column))
      .toEqual(['notes', 'region', 'region', 'postcode']);
    expect(studio.qualityFindings()[0].level).toBe('crit');
    expect(studio.qualityClean()).toBe(false);
    expect(studio.qualityClearCount()).toBe(1);
  });

  it('says an empty column is empty because both signals agreed, not because one did', () => {
    const finding = profiled(BROKEN, 5000).studio.qualityFindings()[0];

    expect(finding.title).toBe('Empty column');
    expect(finding.detail).toContain('100% of rows null, and not one distinct value');
    expect(finding.detail).toContain('Both signals agree');
  });

  it('hedges the derived row count on a mostly-empty column', () => {
    const finding = profiled(BROKEN, 5000).studio.qualityFindings()[1];

    expect(finding.title).toBe('Mostly empty');
    expect(finding.level).toBe('warn');
    expect(finding.detail).toBe('38.24% of rows have no value — about 1,912 of 5,000.');
  });

  it('says a constant column is constant among the rows that HAVE a value', () => {
    const finding = profiled(BROKEN, 5000).studio.qualityFindings()[2];

    expect(finding.title).toBe('One value throughout');
    expect(finding.detail).toContain('Estimated at a single distinct value');
    expect(finding.detail).toContain('Rows with no value are not counted in that');
  });

  it('names the type surprise and warns that it was judged from two values', () => {
    const finding = profiled(BROKEN, 5000).studio.qualityFindings()[3];

    expect(finding.title).toBe('Numbers read as text');
    expect(finding.detail).toContain('"9" after "100"');
    expect(finding.detail).toContain('leading-zero codes');
  });

  it('names a date surprise as a question rather than a fault', () => {
    const { studio } = profiled([textColumn({ typeSurprise: 'DATE' })], 5000);

    expect(studio.qualityFindings()[0].title).toBe('Dates read as text');
    expect(studio.qualityFindings()[0].level).toBe('note');
  });

  it('mentions a column that is a little empty, quietly', () => {
    const { studio } = profiled(
      [columnOf({ nullPercentage: 7.5, completeness: 92.5, approxNullRows: 75 })], 1000);

    expect(studio.qualityFindings()[0].title).toBe('Some values missing');
    expect(studio.qualityFindings()[0].level).toBe('note');
  });

  it('says nothing at all about a column that is barely empty', () => {
    const { studio } = profiled(
      [columnOf({ nullPercentage: 1.2, completeness: 98.8, approxNullRows: 12 })], 1000);
    expect(studio.qualityFindings()).toEqual([]);
  });

  it('reports a far-out extreme without claiming to have looked for outliers', () => {
    const { studio } = profiled([columnOf({ avg: '10', std: '2', max: '1000' })], 1000);
    const finding = studio.qualityFindings()[0];

    expect(finding.title).toBe('An extreme far from the mean');
    expect(finding.detail).toContain('1,000 sits 495 standard deviations above the mean of 10');
    expect(finding.detail).toContain('cannot say whether that is one stray row or many');
  });

  it('reports one below the mean on the side it is actually on', () => {
    const { studio } = profiled([columnOf({ min: '-1000', avg: '10', std: '2' })], 1000);
    expect(studio.qualityFindings()[0].detail).toContain('standard deviations below the mean');
  });

  it('says nothing about extremes on a column with no spread to measure them against', () => {
    // std of zero is every value identical, and dividing by it would report Infinity sigma on
    // the least interesting column in the file.
    const { studio } = profiled([columnOf({ avg: '5', std: '0', min: '5', max: '5' })], 1000);
    expect(studio.qualityFindings()).toEqual([]);
  });

  it('checks nothing on a dataset with no rows, rather than flagging every column', () => {
    const { studio } = profiled([columnOf({ nullPercentage: null, completeness: null })], 0);
    expect(studio.qualityFindings()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------

const REFUNDS: ObjectSummary = {
  name: 'refunds-2026.csv', key: 'daily/refunds-2026.csv', folder: false, size: 2048,
};

const SECOND_SCHEMA = {
  bucket: 'minio-main', path: 'daily/refunds-2026.csv', format: 'CSV', multiFile: false,
  columns: [{ name: 'id', type: 'BIGINT' }, { name: 'refunded', type: 'DECIMAL(18,3)' }],
};

function resultOf(over: Partial<QueryResult> = {}): QueryResult {
  return {
    columns: ['id', 'amount'], rows: [['1', '9.50'], ['2', null]], rowCount: 2, truncated: false,
    ...over,
  };
}

const SAVED: SavedQuery = {
  analyticsQueryId: 7, queryName: 'Daily totals', connectionAlias: 'minio-main',
  datasetPath: 'daily/sales-2026.csv', queryText: 'select sum(amount) from dataset',
};

function runOf(over: Partial<QueryRun> = {}): QueryRun {
  return {
    analyticsQueryRunId: 41, analyticsQueryId: 7, connectionAlias: 'minio-main',
    datasetPath: 'daily/sales-2026.csv', queryText: 'select sum(amount) from dataset',
    runStatus: 'SUCCESS', rowCount: 1, durationMs: 340, errorMessage: null,
    dateCreated: '2026-09-08T14:55:40.779Z', ...over,
  };
}

/**
 * The console, rendered, with a dataset already open and the SQL tab showing.
 *
 * RENDERED rather than driven through signals, because the two claims this tab has to keep are
 * both sentences on a screen: that a truncated result says so beside its row count, and that a
 * refusal reaches the reader in the server's own words. Neither is a property of a signal, and a
 * refactor that drops either one leaves every signal test green.
 *
 * Every analytics call hands back a fresh Subject, so a test can hold the console in its running
 * state and then decide what became of the query.
 */
function consoleWith(over: { objects?: ObjectSummary[]; confirms?: boolean } = {}) {
  const answers: {
    schema?: Subject<any>; preview?: Subject<any>; profile?: Subject<any>; query?: Subject<any>;
    saved?: Subject<any>; runs?: Subject<any>; store?: Subject<any>; rename?: Subject<any>;
    remove?: Subject<any>; download?: Subject<any>; writeBack?: Subject<any>;
    cancel?: Subject<any>;
  } = {};

  const listObjects = vi.fn(() =>
    of(SERVER_RESPONSE({ objects: over.objects ?? [CSV_FILE, REFUNDS, TEXT_FILE] })));
  const buckets = vi.fn(() => of(SERVER_RESPONSE([MINIO])));
  const schema = vi.fn(() => (answers.schema = new Subject<any>()).asObservable());
  const preview = vi.fn(() => (answers.preview = new Subject<any>()).asObservable());
  const profile = vi.fn(() => (answers.profile = new Subject<any>()).asObservable());
  const query = vi.fn((_request?: any) => (answers.query = new Subject<any>()).asObservable());
  const fetchAllQueries = vi.fn(() => (answers.saved = new Subject<any>()).asObservable());
  const fetchRecentRuns = vi.fn(() => (answers.runs = new Subject<any>()).asObservable());
  const saveQuery = vi.fn(() => (answers.store = new Subject<any>()).asObservable());
  const renameQuery = vi.fn(() => (answers.rename = new Subject<any>()).asObservable());
  const deleteQuery = vi.fn(() => (answers.remove = new Subject<any>()).asObservable());
  const cancel = vi.fn((_id?: string) => (answers.cancel = new Subject<any>()).asObservable());
  const download = vi.fn((_request?: any) => (answers.download = new Subject<any>()).asObservable());
  const writeBack = vi.fn((_request?: any) => (answers.writeBack = new Subject<any>()).asObservable());

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: StorageService, useValue: { buckets, listObjects } },
      {
        provide: AnalyticsService,
        useValue: {
          schema, preview, profile, query, fetchAllQueries, fetchRecentRuns, saveQuery,
          renameQuery, deleteQuery, download, writeBack, cancel,
        },
      },
      // confirmWith resolves as soon as the dialog "closes", so this is the reader saying yes or
      // no to the delete without an overlay ever being rendered.
      { provide: Dialog, useValue: { open: () => ({ closed: of(over.confirms ?? true) }) } },
    ],
  });

  const fixture = TestBed.createComponent(Analytics);
  fixture.detectChanges();
  const studio = fixture.componentInstance;
  studio.openFile(CSV_FILE);
  answers.schema!.next(SERVER_RESPONSE(SCHEMA));
  answers.preview!.next(SERVER_RESPONSE(pageOf()));
  studio.showTab('sql');
  fixture.detectChanges();
  // The editor is created in afterNextRender, which is queued rather than run inline.
  TestBed.tick();
  fixture.detectChanges();

  return {
    download, writeBack, cancel,
    studio, fixture, answers,
    query, fetchAllQueries, fetchRecentRuns, saveQuery, renameQuery, deleteQuery, schema,
    /** Everything a person can read on the console, with the template's whitespace collapsed. */
    show(): string {
      fixture.detectChanges();
      return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    },
    /** Types a statement and runs it, stopping while it is in flight. */
    runs(sql = 'select * from dataset'): void {
      studio.sql.set(sql);
      studio.run();
      fixture.detectChanges();
    },
  };
}

describe('the console before anything has run', () => {
  it('will not run an empty editor, and offers something to put in it', () => {
    const console = consoleWith();

    expect(console.studio.canRun()).toBe(false);
    expect(console.show()).toContain('Start from');
    expect(console.show()).toContain('Nothing has run yet.');
  });

  it('fills the editor from the starter rather than leaving a blank page', () => {
    const console = consoleWith();
    console.studio.useStarter();

    expect(console.studio.sql()).toContain('from dataset');
    expect(console.studio.canRun()).toBe(true);
  });

  it('does not run a statement that is only whitespace', () => {
    const console = consoleWith();
    console.studio.sql.set('   \n  ');
    console.studio.run();

    expect(console.query).not.toHaveBeenCalled();
    expect(console.studio.canRun()).toBe(false);
  });

  it('names the two tables the SQL is allowed to use, because that naming IS the interface', () => {
    const text = consoleWith().show();

    expect(text).toContain('What your SQL can name');
    expect(text).toContain('dataset');
    expect(text).toContain('minio-main/daily/sales-2026.csv');
    expect(text).toContain('there is no bucket, URL or path to write');
  });
});

describe('running a query', () => {
  it('holds the console in its running state until the server answers', () => {
    const console = consoleWith();
    console.runs();

    expect(console.studio.running()).toBe(true);
    expect(console.studio.canRun()).toBe(false);
    expect(console.show()).toContain('Running…');
  });

  it('sends the statement as typed, with no second dataset on a one-dataset query', () => {
    const console = consoleWith();
    console.runs('select *\n  from dataset\n');

    expect(console.query).toHaveBeenCalledWith({
      connection: 'minio-main', path: 'daily/sales-2026.csv',
      sql: 'select *\n  from dataset\n',
      queryId: expect.stringMatching(/^ui-/),
      connection2: undefined, path2: undefined,
    });
  });

  it('names the run before sending it, so there is something to stop', () => {
    // The endpoint is synchronous, so an id minted by the SERVER arrives with the rows — after
    // there is anything left to stop. The client naming the run is what makes cancellation
    // reachable at all; the backend was built and tested and no user could get to it.
    const console = consoleWith();
    console.runs();

    const sent = console.query.mock.calls[0][0];
    expect(sent.queryId).toBeTruthy();
    expect(console.studio.runningId()).toBe(sent.queryId);
    expect(console.studio.canStop()).toBe(true);
  });

  it('stops waiting for nothing: the run id is released whether the query lands or fails', () => {
    const ok = consoleWith();
    ok.runs();
    ok.answers.query!.next(SERVER_RESPONSE(resultOf()));
    expect(ok.studio.runningId()).toBe('');
    expect(ok.studio.canStop()).toBe(false);

    const bad = consoleWith();
    bad.runs();
    bad.answers.query!.error({ error: { message: 'gone' } });
    expect(bad.studio.runningId()).toBe('');
  });

  it('asks the server to stop, and does NOT decide the outcome itself', () => {
    // The original request is still open and will answer — with rows if it finished first, or
    // with the engine's interruption if the cancel won. Clearing the result here would be the
    // screen guessing at a race the server has already settled.
    const console = consoleWith();
    console.runs();
    console.studio.stop();

    expect(console.cancel).toHaveBeenCalledWith(console.studio.runningId());
    expect(console.studio.stopping()).toBe(true);
    expect(console.studio.running()).toBe(true);
  });

  it('shows the rows it got back, telling a null apart from a blank', () => {
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(resultOf()));
    const text = console.show();

    expect(console.studio.result()!.rowCount).toBe(2);
    expect(text).toContain('9.50');
    expect(text).toContain('null');
  });
});

describe('taking the result away', () => {
  it('sends the QUERY to be re-run, never the rows the browser is holding', () => {
    // A client that posted its own rows could post any rows, and the file would carry an
    // application filename over data the application never produced. It costs a second execution.
    const c = consoleWith();
    c.runs('SELECT * FROM dataset');
    c.answers.query!.next(SERVER_RESPONSE(resultOf()));
    c.studio.downloadResult();

    expect(c.download).toHaveBeenCalledWith(expect.objectContaining({
      connection: 'minio-main', path: 'daily/sales-2026.csv',
      sql: 'SELECT * FROM dataset', format: 'csv',
    }));
    // Not the rows. If this ever appears in the request the guarantee above is gone.
    expect(c.download.mock.calls[0][0]).not.toHaveProperty('rows');
  });

  it('says a downloaded file is partial, at the last moment the reader is looking at it', () => {
    const c = consoleWith();
    c.runs();
    c.answers.query!.next(SERVER_RESPONSE(resultOf({ rowCount: 10000, truncated: true })));
    c.studio.downloadResult();
    c.answers.download!.next(SERVER_RESPONSE({
      filename: 'sales-partial.csv', contentType: 'text/csv', content: 'YQ==', bytes: 1,
      rowCount: 10000, truncated: true, notice: 'This file holds 10,000 rows and there are more.',
    }));

    expect(c.show()).toContain('This file holds 10,000 rows and there are more.');
  });

  it('never names a bucket when writing back — only a folder inside the one already open', () => {
    const c = consoleWith();
    c.runs();
    c.answers.query!.next(SERVER_RESPONSE(resultOf()));
    c.studio.writeFolder.set('exports');
    c.studio.writeResultBack();

    const sent = c.writeBack.mock.calls[0][0];
    expect(sent).toMatchObject({ connection: 'minio-main', folder: 'exports' });
    // The bucket comes from the connection record on the server. If the client could name one,
    // the module's central property would stop being true at its newest endpoint.
    expect(sent).not.toHaveProperty('bucket');
  });

  it('shows the server\'s refusal verbatim rather than a generic export failure', () => {
    const c = consoleWith();
    c.runs();
    c.answers.query!.next(SERVER_RESPONSE(resultOf()));
    c.studio.writeResultBack();
    c.answers.writeBack!.next({
      status: 'ERROR', message: 'An export folder cannot contain "..", an empty step, or a leading slash.',
    });

    expect(c.show()).toContain('An export folder cannot contain');
  });
});

describe('a truncated result is a partial answer and has to read as one', () => {
  it('says so beside the row count, not in a footnote under the table', () => {
    // The whole point. A reader handed ten thousand rows out of forty thousand and not told has
    // a WRONG answer, not a short one, and the count is the figure they take away -- so the
    // caveat has to be on the count itself, where it is read at the same moment.
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(resultOf({ rowCount: 10000, truncated: true })));
    const text = console.show();

    expect(console.studio.truncated()).toBe(true);
    expect(text).toContain('stopped at the limit — there may be more');
    expect(text).toContain('This is part of the answer, not all of it.');
    expect(text).not.toContain('everything the query matched');
  });

  it('refuses to say how many are missing, because nothing here knows', () => {
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(resultOf({ rowCount: 10000, truncated: true })));

    expect(console.show()).toContain('Nothing here can say how many.');
  });

  it('calls a complete result complete, so the warning means something by contrast', () => {
    // The control. A console that hedged every result would make the hedge invisible on the one
    // that needed it.
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(resultOf()));
    const text = console.show();

    expect(text).toContain('everything the query matched');
    expect(text).not.toContain('there may be more');
  });
});

describe('a refusal reaches the reader in the server’s own words', () => {
  const GATE = 'A query may not name a location of its own; read the dataset by its name instead.';

  it('shows the server’s sentence unchanged rather than a failure of its own invention', () => {
    const console = consoleWith();
    console.runs('select * from read_csv(\'s3://elsewhere/secrets.csv\')');
    console.answers.query!.next(SERVER_REFUSAL(GATE));
    const text = console.show();

    expect(console.studio.queryError()).toBe(GATE);
    expect(text).toContain(GATE);
    // Several of these are security refusals. Folding them into one generic line takes away the
    // only thing that tells a reader which of the two happened to them.
    expect(text).toContain('refusals rather than faults');
    expect(text).not.toContain('Nothing has run yet.');
  });

  it('still reads as a failure when the server sent no words with it', () => {
    // The same hole the profile scan had: an empty message left the error signal falsy, and a
    // refused query rendered as the clean "nothing has run yet" empty state.
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_REFUSAL(''));
    const text = console.show();

    expect(text).toContain('The query did not run');
    expect(text).not.toContain('Nothing has run yet.');
  });

  it('leaves the dataset alone: a bad statement is not a file that could not be read', () => {
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_REFUSAL(GATE));

    expect(console.studio.error()).toBe('');
    expect(console.studio.preview()).not.toBeNull();
  });

  it('records the attempt either way, because a refusal is the row worth keeping', () => {
    const console = consoleWith();
    const before = console.fetchRecentRuns.mock.calls.length;
    console.runs();
    console.answers.query!.next(SERVER_REFUSAL(GATE));

    expect(console.fetchRecentRuns.mock.calls.length).toBe(before + 1);
  });
});

describe('the second dataset, and the naming that is the whole interface', () => {
  it('offers the rail’s own readable files, and never the dataset already open', () => {
    const paths = consoleWith().studio.secondOptions().map(option => option.path);

    expect(paths).toContain('daily/refunds-2026.csv');
    // Joining a file to itself is spelled by naming "dataset" twice, not by resolving and paying
    // for the same file a second time.
    expect(paths).not.toContain('daily/sales-2026.csv');
    // notes.txt is in the folder and is not something this reader can open.
    expect(paths).not.toContain('daily/notes.txt');
  });

  it('reads the second dataset’s schema as soon as it is picked, not when the query runs', () => {
    const console = consoleWith();
    console.studio.pickSecond('daily/refunds-2026.csv');

    expect(console.schema).toHaveBeenLastCalledWith('minio-main', 'daily/refunds-2026.csv');
    expect(console.studio.secondLoading()).toBe(true);
  });

  it('feeds both files’ columns to the editor under the names the SQL will use', () => {
    const console = consoleWith();
    expect(console.studio.editorSchema()).toEqual({ dataset: ['id', 'amount'] });

    console.studio.pickSecond('daily/refunds-2026.csv');
    console.answers.schema!.next(SERVER_RESPONSE(SECOND_SCHEMA));

    expect(console.studio.editorSchema())
      .toEqual({ dataset: ['id', 'amount'], dataset2: ['id', 'refunded'] });
  });

  it('says on screen that the second file is called dataset2', () => {
    const console = consoleWith();
    console.studio.pickSecond('daily/refunds-2026.csv');
    console.answers.schema!.next(SERVER_RESPONSE(SECOND_SCHEMA));
    const text = console.show();

    expect(text).toContain('dataset2');
    expect(text).toContain('minio-main/daily/refunds-2026.csv');
  });

  it('sends both datasets once one is picked', () => {
    const console = consoleWith();
    console.studio.pickSecond('daily/refunds-2026.csv');
    console.answers.schema!.next(SERVER_RESPONSE(SECOND_SCHEMA));
    console.runs('select * from dataset join dataset2 using (id)');

    expect(console.query).toHaveBeenLastCalledWith(expect.objectContaining({
      connection2: 'minio-main', path2: 'daily/refunds-2026.csv',
    }));
  });

  it('says the second file could not be read where it was picked, not on the query', () => {
    const console = consoleWith();
    console.studio.pickSecond('daily/refunds-2026.csv');
    console.answers.schema!.next(SERVER_REFUSAL('Storage connection not found.'));

    expect(console.show()).toContain('Storage connection not found.');
  });

  it('drops the second dataset when the connection changes, because its path went with it', () => {
    const console = consoleWith();
    console.studio.pickSecond('daily/refunds-2026.csv');
    console.answers.schema!.next(SERVER_RESPONSE(SECOND_SCHEMA));
    console.studio.pickConnection('minio-main');

    expect(console.studio.secondPath()).toBe('');
    expect(console.studio.editorSchema()['dataset2']).toBeUndefined();
  });
});

describe('the library: saving, loading and deleting a query', () => {
  it('is asked for once, when a reader opens the tab that needs it', () => {
    const console = consoleWith();
    expect(console.fetchAllQueries).toHaveBeenCalledTimes(1);

    console.studio.showTab('data');
    console.studio.showTab('sql');

    expect(console.fetchAllQueries).toHaveBeenCalledTimes(1);
  });

  it('saves only the four fields a person decides, with no id on a new one', () => {
    const console = consoleWith();
    console.studio.sql.set('select 1 from dataset');
    console.studio.saveName.set('  Daily totals  ');
    console.studio.saveAsNew();

    expect(console.saveQuery).toHaveBeenCalledWith({
      queryName: 'Daily totals',
      connectionAlias: 'minio-main',
      datasetPath: 'daily/sales-2026.csv',
      // Stored exactly as typed: the row ceiling belongs to the engine on the day it runs, so a
      // saved query must not carry a rewritten copy of itself.
      queryText: 'select 1 from dataset',
    });
  });

  it('will not save a query with no name to find it by', () => {
    const console = consoleWith();
    console.studio.sql.set('select 1 from dataset');
    console.studio.saveAsNew();

    expect(console.saveQuery).not.toHaveBeenCalled();
  });

  it('shows the server’s refusal rather than pretending the query was kept', () => {
    const console = consoleWith();
    console.studio.sql.set('select 1');
    console.studio.saveName.set('Totals');
    console.studio.saveAsNew();
    console.answers.store!.next(SERVER_REFUSAL('A saved query name is at most 120 characters.'));

    expect(console.show()).toContain('A saved query name is at most 120 characters.');
    expect(console.studio.loadedQuery()).toBeNull();
  });

  it('points Update at the row the server built, not the payload that was sent', () => {
    const console = consoleWith();
    console.studio.sql.set('select 1');
    console.studio.saveName.set('Totals');
    console.studio.saveAsNew();
    console.answers.store!.next(SERVER_RESPONSE({ ...SAVED, analyticsQueryId: 31 }));

    console.studio.updateLoaded();

    expect(console.saveQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ analyticsQueryId: 31 }));
  });

  it('separates Update from Save as new rather than guessing between them', () => {
    // The same button silently overwriting somebody's saved work on one visit and forking it on
    // the next is not recoverable from either side.
    const console = consoleWith();
    console.studio.loadSaved(SAVED);
    console.studio.saveAsNew();

    expect(console.saveQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ analyticsQueryId: 7 }));
  });

  it('loads a saved query into the editor and clears the last result with it', () => {
    const console = consoleWith();
    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(resultOf()));
    console.studio.loadSaved(SAVED);

    expect(console.studio.sql()).toBe('select sum(amount) from dataset');
    expect(console.studio.saveName()).toBe('Daily totals');
    // A result that stayed would be the previous query's answer sitting under this one's name.
    expect(console.studio.result()).toBeNull();
  });

  it('does not reopen the file a saved query was written against, and says so instead', () => {
    const console = consoleWith();
    console.studio.loadSaved({ ...SAVED, datasetPath: 'daily/2025-archive.csv' });
    const text = console.show();

    expect(console.studio.path()).toBe('daily/sales-2026.csv');
    expect(text).toContain('saved against');
    expect(text).toContain('daily/2025-archive.csv');
  });

  it('says nothing about a mismatch when there is none', () => {
    const console = consoleWith();
    console.studio.loadSaved(SAVED);

    expect(console.studio.loadedElsewhere()).toBe('');
  });

  it('asks before deleting, and says what deleting does not do', async () => {
    const console = consoleWith({ confirms: false });
    await console.studio.removeSaved(SAVED);

    expect(console.deleteQuery).not.toHaveBeenCalled();
  });

  it('deletes once the reader has said yes, and forgets it was loaded', async () => {
    const console = consoleWith({ confirms: true });
    console.studio.loadSaved(SAVED);
    await console.studio.removeSaved(SAVED);
    console.answers.remove!.next(SERVER_RESPONSE(undefined));

    expect(console.deleteQuery).toHaveBeenCalledWith(7);
    expect(console.studio.loadedQuery()).toBeNull();
  });

  it('renames in place, and keeps the loaded copy’s name in step with the list', () => {
    const console = consoleWith();
    console.studio.loadSaved(SAVED);
    console.studio.startRename(SAVED);
    console.studio.renameName.set('  Monthly totals ');
    console.studio.applyRename();
    console.answers.rename!.next(SERVER_RESPONSE({ ...SAVED, queryName: 'Monthly totals' }));

    expect(console.renameQuery).toHaveBeenCalledWith(7, 'Monthly totals');
    // A header still saying the old name would be the screen disagreeing with itself.
    expect(console.studio.loadedQuery()!.queryName).toBe('Monthly totals');
    expect(console.studio.saveName()).toBe('Monthly totals');
  });

  it('leaves a way back when the library could not be read', () => {
    // The library is fetched once, on the first visit to this tab. A failure with no retry
    // beside it would leave the card dead for the rest of the session.
    const console = consoleWith();
    console.answers.saved!.next(SERVER_REFUSAL('Data could not be fetched.'));
    expect(console.show()).toContain('Data could not be fetched.');

    const before = console.fetchAllQueries.mock.calls.length;
    console.studio.loadSavedQueries();
    expect(console.fetchAllQueries.mock.calls.length).toBe(before + 1);
  });

  it('lists what is saved, and says so plainly when nothing is', () => {
    const empty = consoleWith();
    empty.answers.saved!.next(SERVER_RESPONSE([]));
    expect(empty.show()).toContain('Nothing saved yet.');

    const stocked = consoleWith();
    stocked.answers.saved!.next(SERVER_RESPONSE([SAVED]));
    expect(stocked.show()).toContain('Daily totals');
  });
});

describe('the run history', () => {
  it('says what ran, when, how long it took and how many rows came back', () => {
    const console = consoleWith();
    console.answers.runs!.next(SERVER_RESPONSE([runOf()]));
    const text = console.show();

    expect(text).toContain('ran');
    expect(text).toContain('340 ms');
    expect(text).toContain('1 rows');
    expect(text).toContain('select sum(amount) from dataset');
  });

  it('draws a refusal as a refusal, not as a failure, and carries its sentence', () => {
    // The two are different events: FAILED reached the engine and broke there, REFUSED never
    // reached it. A history that drew both in red would hide the one worth looking at.
    const console = consoleWith();
    console.answers.runs!.next(SERVER_RESPONSE([
      runOf({
        analyticsQueryRunId: 42, runStatus: 'REFUSED', rowCount: null, durationMs: null,
        errorMessage: 'A query may not attach another database.',
      }),
    ]));
    const text = console.show();

    expect(text).toContain('refused');
    expect(text).toContain('A query may not attach another database.');
  });

  it('shows a zero-row run as zero rather than as no answer at all', () => {
    const console = consoleWith();
    expect(console.studio.runRows(runOf({ rowCount: 0 }))).toBe('0');
    expect(console.studio.runRows(runOf({ rowCount: null }))).toBe('');
  });

  it('writes a duration in the unit a reader can hold', () => {
    const console = consoleWith();
    expect(console.studio.runTook(runOf({ durationMs: 340 }))).toBe('340 ms');
    expect(console.studio.runTook(runOf({ durationMs: 4200 }))).toBe('4.2 s');
    expect(console.studio.runTook(runOf({ durationMs: null }))).toBe('');
  });

  it('puts a statement back in the editor without running it', () => {
    // A row here may be one the engine refused or one that took thirty seconds. A single click
    // that re-spends a governor permit on either punishes curiosity.
    const console = consoleWith();
    const before = console.query.mock.calls.length;
    console.studio.reuseRun(runOf({ queryText: 'select count(*) from dataset' }));

    expect(console.studio.sql()).toBe('select count(*) from dataset');
    expect(console.query.mock.calls.length).toBe(before);
    // It is no longer the saved query that was loaded, so Update must not point at that row.
    expect(console.studio.loadedQuery()).toBeNull();
  });

  it('says the durations are the engine’s, not the wait the reader had', () => {
    const console = consoleWith();
    console.answers.runs!.next(SERVER_RESPONSE([runOf()]));

    expect(console.show()).toContain('wall clock inside the query engine');
  });

  it('says plainly when nothing has been run in the workspace', () => {
    const console = consoleWith();
    console.answers.runs!.next(SERVER_RESPONSE([]));

    expect(console.show()).toContain('Nothing has been run here yet.');
  });
});

describe('the console does not disturb the tabs beside it', () => {
  it('opens a dataset on Overview, with SQL last in the strip', () => {
    // Canvas sits before SQL and after Quality. The console stays last because it is the escape
    // hatch for the questions a structured analysis cannot phrase, and an escape hatch belongs at
    // the end of a strip rather than in the middle of it.
    const console = consoleWith();
    expect(console.studio.tabs.map(tab => tab.id))
      .toEqual(['overview', 'data', 'profile', 'quality', 'canvas', 'sql']);

    console.studio.openFile(CSV_FILE);
    expect(console.studio.tab()).toBe('overview');
  });

  it('clears a result when another file is opened, and keeps the statement', () => {
    // A result table left standing under a new file's heading claims to be that file's answer.
    // The SQL is the reader's own work, and running it against the next file is a normal want.
    const console = consoleWith();
    console.runs('select count(*) from dataset');
    console.answers.query!.next(SERVER_RESPONSE(resultOf()));
    console.studio.openFile(REFUNDS);

    expect(console.studio.result()).toBeNull();
    expect(console.studio.sql()).toBe('select count(*) from dataset');
  });

  it('does not scan the profile just because the SQL tab was opened', () => {
    const console = consoleWith();
    expect(console.studio.profileLoading()).toBe(false);
    expect(console.studio.profile()).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------

/**
 * The chart, which is the easiest place on this screen to tell a lie.
 *
 * Everything below is one of two questions. The first is whether the console can tell what a
 * column IS, given a result that is entirely text -- and it has to answer by parsing, because a
 * VARCHAR of "1200" is drawable and a DOUBLE of nulls is not.
 *
 * The second is the one worth the file space. A chart compresses thousands of rows into a few
 * shapes and then looks equally finished whether or not those shapes are the whole story, so
 * every way this one can quietly narrow its input is pinned here: a truncated result, a row that
 * does not parse, a row with no label, rows folded together by a shared label, and a tail rolled
 * up behind a top N. Several of those claims are SENTENCES ON A SCREEN rather than properties of
 * a signal, so they are asserted against the rendered console for the same reason the truncation
 * pill and the profile hedges are.
 */
function pairsOf(rows: [string, string | null][], over: Partial<QueryResult> = {}): QueryResult {
  return resultOf({
    columns: ['region', 'amount'], rows: rows.map(([name, value]) => [name, value]),
    rowCount: rows.length, ...over,
  });
}

/** N categories carrying 1, 2, 3... so nothing is zero and every value is distinct. */
function categories(count: number): QueryResult {
  return pairsOf(Array.from({ length: count },
    (_, index) => [`region-${index}`, String(index + 1)] as [string, string]));
}

/** A console holding the answer to one query, rendered. */
function charted(result: QueryResult) {
  const console = consoleWith();
  console.runs();
  console.answers.query!.next(SERVER_RESPONSE(result));
  console.fixture.detectChanges();
  return console;
}

describe('choosing what the chart draws', () => {
  it('takes the names for the label and the measure for the value, not the other way round', () => {
    // `select region, month, sum(amount)` puts what a row IS at the front and what it measures
    // at the end. Defaulting to the first numeric column would chart an id.
    const { studio } = charted(resultOf({
      columns: ['region', 'month', 'total'],
      rows: [['north', '1', '900'], ['south', '2', '400']], rowCount: 2,
    }));

    expect(studio.labelColumn()!.name).toBe('region');
    expect(studio.valueColumn()!.name).toBe('total');
  });

  it('decides a column by parsing it, never by what its values look like they are', () => {
    // Every cell of a result is text -- a DECIMAL has no JSON form that survives -- so a type
    // name is not available and would not be trusted if it were. A date column parses as nothing
    // and is a label; a column of numeric strings is a value.
    const { studio } = charted(resultOf({
      columns: ['day', 'amount'],
      rows: [['2026-01-01', '12.5'], ['2026-01-02', '18'], ['2026-01-03', '4']], rowCount: 3,
    }));
    const reading = new Map(studio.chartColumns().map(column => [column.name, column]));

    expect(reading.get('day')!.numbers).toBe(0);
    expect(reading.get('amount')!.numbers).toBe(3);
    expect(studio.labelColumn()!.name).toBe('day');
    expect(studio.valueColumn()!.name).toBe('amount');
  });

  it('holds a pick by NAME, so the next result keeps it or visibly loses it', () => {
    // By index it would silently become a different column the moment a query returns one more
    // in front of it, under a chart that still looks like the one being read a second ago.
    const console = charted(resultOf({
      columns: ['region', 'orders', 'total'],
      rows: [['north', '3', '900'], ['south', '5', '400']], rowCount: 2,
    }));
    console.studio.chartValueName.set('orders');
    expect(console.studio.valueColumn()!.name).toBe('orders');

    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(pairsOf([['north', '900'], ['south', '400']])));

    // "orders" is not in this result at all, so the pick falls back where a reader can see it.
    expect(console.studio.valueColumn()!.name).toBe('amount');
  });

  it('never offers one column as both the label and the value', () => {
    // Grouping a column by itself and adding the duplicates up is a chart of how often each
    // number occurs, drawn as though it were a chart of the numbers.
    const { studio } = charted(pairsOf([['north', '10'], ['south', '20']]));

    expect(studio.chartLabelOptions().map(column => column.name)).toEqual(['region']);
    expect(studio.chartValueOptions().map(column => column.name)).toEqual(['amount']);
  });

  it('has no label column on a one-column result, rather than labelling a number with itself', () => {
    const { studio } = charted(resultOf({
      columns: ['duration'], rows: [['12'], ['30'], ['44']], rowCount: 3,
    }));

    expect(studio.labelColumn()).toBeNull();
    expect(studio.valueColumn()!.name).toBe('duration');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the kinds offered change with the columns', () => {
  /** The kinds that can draw the result as it stands, by id. */
  function offered(studio: { chartKinds: () => { id: string; issue: string }[] }) {
    return studio.chartKinds().filter(kind => !kind.issue).map(kind => kind.id);
  }

  it('offers a ring for a handful of categories', () => {
    const { studio } = charted(categories(4));

    expect(offered(studio)).toContain('donut');
  });

  it('refuses a ring of hundreds of slices, and says so on the option itself', () => {
    // "A donut of 500 categories is not a chart." The option stays listed and inert with the
    // reason on it, exactly as an unreadable connection does in the picker above.
    const console = charted(categories(40));
    const donut = console.studio.chartKinds().find(kind => kind.id === 'donut')!;

    expect(donut.issue).toContain('ring of 40 slices');
    expect(offered(console.studio)).not.toContain('donut');
    // On the screen, not only in the signal: the reason is what stops a reader hunting for it.
    expect(console.show()).toContain('A ring of 40 slices cannot be read');
  });

  it('stops drawing bars in result order once no name can fit under one', () => {
    const { studio } = charted(categories(70));

    expect(offered(studio)).not.toContain('bar');
    // Ranked bars still work at any count, because they keep the largest and roll up the rest.
    expect(offered(studio)).toContain('ranked');
  });

  it('refuses every length-based kind on a column with negatives, and keeps the distribution', () => {
    // app-bar-chart floors a bar at zero height and app-ranked-bar drops the row, so a loss of
    // -400 would read as an absence beside a profit of 400. A distribution has an axis and can
    // put it where it belongs.
    const console = charted(pairsOf([
      ['a', '10'], ['b', '-400'], ['c', '30'], ['d', '40'],
      ['e', '50'], ['f', '60'], ['g', '70'], ['h', '80'],
    ]));

    expect(offered(console.studio)).toEqual(['histogram']);
    expect(console.studio.chartKind()).toBe('histogram');
    expect(console.show()).toContain('a length cannot be negative');
  });

  it('bins the result as ROWS, and keeps a negative value on the axis', () => {
    // The two things app-histogram had welded into it for its first caller. Its bins said "412
    // runs between 0 and 100", which on a column of sales amounts is a false sentence on screen,
    // and it threw away every value below zero -- right for a run that carries -1 instead of a
    // duration, wrong for a refund. Asserted through the caller, because the point is not that
    // the component has two more inputs but that this screen's chart says true things.
    const console = charted(pairsOf([
      ['a', '10'], ['b', '-400'], ['c', '30'], ['d', '40'],
      ['e', '50'], ['f', '60'], ['g', '70'], ['h', '80'],
    ]));
    const chart = (console.fixture.nativeElement as HTMLElement)
      .querySelector('app-histogram [role="img"]');

    expect(console.studio.chartKind()).toBe('histogram');
    expect(console.studio.chartValues()).toHaveLength(8);
    // Eight rows, none dropped, and the axis starts at the negative one.
    expect(chart!.getAttribute('aria-label')).toContain('Distribution of 8 rows from -400');
  });

  it('offers a distribution of a single column, which is the only chart it can have', () => {
    const console = charted(resultOf({
      columns: ['duration'],
      rows: [['1'], ['2'], ['3'], ['4'], ['5'], ['6'], ['7'], ['8']], rowCount: 8,
    }));

    expect(offered(console.studio)).toEqual(['histogram']);
    expect(console.show()).toContain('This result has one column, so there is nothing to label');
  });

  it('refuses a distribution of too few numbers to have a shape', () => {
    const { studio } = charted(pairsOf([['north', '10'], ['south', '20']]));
    const distribution = studio.chartKinds().find(kind => kind.id === 'histogram')!;

    expect(distribution.issue).toContain('too few');
    expect(offered(studio)).toEqual(['bar', 'ranked', 'donut']);
  });

  it('leaves a picked kind behind when the next result cannot support it', () => {
    // A control that keeps saying "share of the total" over an empty frame is worse than one
    // that moves: the columns changed under the pick, and the picker shows that they did.
    const console = charted(categories(4));
    console.studio.chartKindName.set('donut');
    expect(console.studio.chartKind()).toBe('donut');

    console.runs();
    console.answers.query!.next(SERVER_RESPONSE(categories(40)));

    expect(console.studio.chartKind()).not.toBe('donut');
    expect(console.studio.chartKind()).toBe('bar');
  });
});

// ---------------------------------------------------------------------------------------------

describe('a truncated result makes a wrong chart, and has to say so ON it', () => {
  it('marks the chart partial beside its own title and again above it', () => {
    // The point of the whole section. "Sales by region" over the first ten thousand of forty
    // thousand rows is not a slightly-off chart, it is a wrong one, and it has exactly the shape,
    // the confidence and the finish of a right one.
    const console = charted(pairsOf(
      [['north', '10'], ['south', '20'], ['east', '30']], { truncated: true, rowCount: 3 }));
    const text = console.show();

    expect(console.studio.chartDrawn()).toBe(true);
    expect(text).toContain('partial — part of the answer');
    expect(text).toContain('This chart is drawn from part of the answer.');
    // And it does not guess at what is missing, because nothing here knows. The wording is the
    // chart's own -- the result table above says the same thing about its rows, and asserting a
    // sentence the two share would pass with no strip on the chart at all.
    expect(text).toContain('which way they would move one');
  });

  it('marks it on every kind, not only the one that happens to be first', () => {
    const console = charted(pairsOf(
      [['north', '10'], ['south', '20'], ['east', '30']], { truncated: true, rowCount: 3 }));

    for (const kind of ['bar', 'ranked', 'donut'] as const) {
      console.studio.chartKindName.set(kind);
      expect(console.show(), kind).toContain('partial — part of the answer');
    }
  });

  it('says nothing of the sort about a complete result, so the mark means something', () => {
    const console = charted(pairsOf([['north', '10'], ['south', '20'], ['east', '30']]));

    expect(console.show()).not.toContain('partial — part of the answer');
    expect(console.show()).not.toContain('This chart is drawn from part of the answer.');
  });
});

// ---------------------------------------------------------------------------------------------

describe('what the picture cannot say about itself', () => {
  it('leaves a row that is not a number OUT, and counts it, rather than drawing it as zero', () => {
    // A zero is a measurement. "n/a" is the absence of one, and a bar drawn at zero for it is a
    // claim about the data that nobody made.
    const console = charted(pairsOf([['north', '10'], ['south', 'n/a'], ['east', '20']]));

    expect(console.studio.chartData()).toEqual([
      { name: 'north', value: 10, rows: 1 }, { name: 'east', value: 20, rows: 1 },
    ]);
    expect(console.show()).toContain('1 row has no number in "amount"');
    expect(console.show()).toContain('an unknown value is not a zero');
  });

  it('counts an empty cell as a row with no number, not as a blank category', () => {
    const console = charted(pairsOf([['north', '10'], ['south', null], ['east', '  ']]));

    expect(console.studio.chartData()).toEqual([{ name: 'north', value: 10, rows: 1 }]);
    expect(console.show()).toContain('2 rows have no number in "amount"');
  });

  it('leaves a row with nothing to call it out, and says that separately', () => {
    // A different fact from a missing number: this row has a measurement and nowhere to put it.
    const console = charted(pairsOf([['north', '10'], ['', '25'], ['east', '20']]));

    expect(console.studio.chartData().map(point => point.name)).toEqual(['north', 'east']);
    expect(console.show()).toContain('1 row has nothing in "region" to be called');
  });

  it('says out loud that rows sharing a label were added together', () => {
    // The one interpretation this screen makes of a reader's own data. Adding is right for a
    // count or a total and wrong for an average, and only the person who wrote the query knows.
    const console = charted(pairsOf([['north', '10'], ['north', '5'], ['south', '2']]));

    expect(console.studio.chartData()).toEqual([
      { name: 'north', value: 15, rows: 2 }, { name: 'south', value: 2, rows: 1 },
    ]);
    expect(console.show()).toContain('shared a label with another one');
    expect(console.show()).toContain('wrong for an average');
  });

  it('says nothing about adding up when every label appeared once', () => {
    const console = charted(pairsOf([['north', '10'], ['south', '2']]));

    expect(console.show()).not.toContain('shared a label with another one');
  });

  it('counts the rows it drew against the rows the result actually had', () => {
    const console = charted(pairsOf([['north', '10'], ['south', 'n/a'], ['east', '20']]));

    expect(console.show()).toContain('Drawn from 2 of the 3 rows in this result');
  });
});

// ---------------------------------------------------------------------------------------------

describe('a top N is disclosed, never a quiet tail', () => {
  it('says how many categories it is showing, and that the rest were rolled up', () => {
    const console = charted(categories(12));
    console.studio.chartKindName.set('ranked');
    const text = console.show();

    expect(console.studio.chartKind()).toBe('ranked');
    // From the component's own constant, not a literal. This asserted 8 while the chart drew 8,
    // and both were wrong: Donut and RankedBar colour their marks var(--chart-N % 6), so the
    // seventh and eighth categories reused the first two colours and the legend mapped two names
    // to one swatch. Lowering the threshold to match the palette moved the sentence, and a
    // hardcoded 8 here would have made a correct fix look like a regression.
    expect(text).toContain(`Showing the ${console.studio.rankedRows} largest of 12`);
    expect(text).toContain('added together as one "Other" row rather than dropped');
  });

  it('counts only the rows a ranked bar will actually draw, not every point', () => {
    // RankedBar filters value > 0 BEFORE taking its top N, so its universe is smaller than the
    // one the note used to count. With zero-valued categories among them this said "Showing the
    // N largest of 10 ... the rest are added together as one Other row" above a chart with fewer
    // rows and no Other row at all. A disclosure that is wrong is worse than no disclosure,
    // because it reads as having been checked.
    const rows = [['a', '9'], ['b', '8'], ['c', '7'], ['d', '6'], ['e', '5'], ['f', '4'],
                  ['g', '3'], ['z1', '0'], ['z2', '0'], ['z3', '0']];
    const console = charted({ columns: ['region', 'amount'], rows, rowCount: rows.length, truncated: false });
    console.studio.chartKindName.set('ranked');
    const text = console.show();

    // Seven categories carry a value, and rankedRows of them are drawn, so there IS a tail --
    // but it is a tail of seven, never of ten.
    expect(text).not.toContain('largest of 10');
    expect(text).toContain(`Showing the ${console.studio.rankedRows} largest of 7`);
  });

  it('says nothing about a top N when every category is on the chart', () => {
    const console = charted(categories(5));
    console.studio.chartKindName.set('ranked');

    expect(console.show()).not.toContain('Showing the 8 largest');
  });

  it('owns up to a category worth zero, which a ranked bar has no row for', () => {
    const console = charted(pairsOf([['north', '10'], ['south', '0'], ['east', '20']]));
    console.studio.chartKindName.set('ranked');

    expect(console.show()).toContain('1 category adds up to zero');
  });

  it('says a ring is a share of a sum, which is a claim about the numbers in it', () => {
    const console = charted(categories(4));
    console.studio.chartKindName.set('donut');

    expect(console.show()).toContain('A ring asserts that the parts add up to a whole');
  });
});

// ---------------------------------------------------------------------------------------------

describe('the chart’s empty states are four different facts', () => {
  it('says a chart comes from a result before anything has been run', () => {
    const console = consoleWith();

    expect(console.studio.chartDrawn()).toBe(false);
    expect(console.show()).toContain('Nothing has run yet — a chart is drawn from a result');
  });

  it('says a query matched nothing, rather than that nothing can be drawn', () => {
    const console = charted(resultOf({ columns: ['region', 'amount'], rows: [], rowCount: 0 }));

    expect(console.show()).toContain('That query matched no rows');
  });

  it('says which column has no numbers in it when the result is one column of text', () => {
    const console = charted(resultOf({
      columns: ['note'], rows: [['a'], ['b']], rowCount: 2,
    }));

    expect(console.studio.chartDrawn()).toBe(false);
    expect(console.show()).toContain('Nothing in "note" parses as a number');
  });

  it('says no column carries numbers when several do not', () => {
    const console = charted(resultOf({
      columns: ['region', 'note'], rows: [['north', 'a'], ['south', 'b']], rowCount: 2,
    }));

    expect(console.show()).toContain('No column in this result has numbers in it');
  });

  it('draws no chart at all under a refusal, where there is no result to draw', () => {
    const console = consoleWith();
    console.runs('drop table dataset');
    console.answers.query!.next(SERVER_REFUSAL('A query may not write.'));

    expect(console.show()).toContain('A query may not write.');
    expect(console.show()).not.toContain('Nothing has run yet — a chart is drawn from a result');
  });
});

// ---------------------------------------------------------------------------------------------

/**
 * The Canvas: document 07, and the tab where an aggregate can most easily be believed.
 *
 * Everything below is one of three questions.
 *
 * THE FIRST is whether the analysis this screen SENDS is the analysis it SHOWS. Dimensions in
 * order, a measure that only carries a column when the aggregation is about one, and a drill trail
 * that is echoed rather than rebuilt. That last one is the sharpest: the endpoints are stateless
 * and the trail travels on every request, and the moment this client's idea of the accumulated
 * filters differs from the server's, the figure and the breadcrumb over it describe two different
 * questions with nothing on screen saying so.
 *
 * THE SECOND is the rendering rule, and it is a correctness rule rather than a cosmetic one. A
 * measured defect on this deployment: sum(amount) comes back as "7.466125E7", which is 74,661,250,
 * and a DATE comes back as a midnight the column cannot hold. Both are fixed on the string,
 * because going via a float to make a total legible would quietly change it.
 *
 * THE THIRD is the honesty of the figure, and it is why this tab has more tests than the chart on
 * the SQL tab. An aggregate hides its own uncertainty: a chart of ten of forty thousand rows looks
 * exactly as finished as one of all forty thousand. Five ways that can be wrong are pinned here --
 * the row ceiling, the rolled-up tail, a distinct count whose exactness differs from the same word
 * on the Profile tab, a relative window that means a different week depending on when it ran, and
 * rows a filter excluded being excluded rather than zero -- and each is asserted against the
 * SCREEN, because the screen is where the claim is made.
 */

const CANVAS_SCHEMA = {
  bucket: 'minio-main', path: 'daily/sales-2026.csv', format: 'CSV', multiFile: false,
  columns: [
    { name: 'region', type: 'VARCHAR' },
    { name: 'status', type: 'VARCHAR' },
    { name: 'city', type: 'VARCHAR' },
    { name: 'amount', type: 'DECIMAL(18,3)' },
    { name: 'booked_on', type: 'DATE' },
  ],
};

function analysisOf(over: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    columns: [
      { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
      { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
    ],
    rows: [['north', '12500.00'], ['south', '9800.00']],
    rowCount: 2,
    truncated: false,
    dimensions: ['region'],
    measure: 'amount_sum',
    other: null,
    crumbs: [{ label: 'All rows' }],
    drillPath: [],
    pivot: null,
    queryId: 'ui-1',
    durationMs: 42,
    ...over,
  };
}

/**
 * The Canvas, rendered, with a dataset open and the tab showing.
 *
 * Rendered rather than driven through signals for the same reason the console harness is: the
 * claims that matter most here are sentences -- "partial", "rolled into Other", "excluded, not
 * zero" -- and a refactor that drops one of those leaves every signal assertion green.
 */
function canvasWith(over: { confirms?: boolean } = {}) {
  const answers: {
    schema?: Subject<any>; preview?: Subject<any>; analyze?: Subject<any>; drill?: Subject<any>;
    drillUp?: Subject<any>; analyses?: Subject<any>; saveAnalysis?: Subject<any>;
    deleteAnalysis?: Subject<any>; cancel?: Subject<any>;
  } = {};

  const listObjects = vi.fn(() => of(SERVER_RESPONSE({ objects: [CSV_FILE, REFUNDS] })));
  const buckets = vi.fn(() => of(SERVER_RESPONSE([MINIO])));
  const schema = vi.fn(() => (answers.schema = new Subject<any>()).asObservable());
  const preview = vi.fn(() => (answers.preview = new Subject<any>()).asObservable());
  const profile = vi.fn(() => new Subject<any>().asObservable());
  const analyze = vi.fn((_request?: any) => (answers.analyze = new Subject<any>()).asObservable());
  const drill = vi.fn((_request?: any, _into?: any) =>
    (answers.drill = new Subject<any>()).asObservable());
  const drillUp = vi.fn((_request?: any, _steps?: number) =>
    (answers.drillUp = new Subject<any>()).asObservable());
  const fetchAllAnalyses = vi.fn(() => (answers.analyses = new Subject<any>()).asObservable());
  const saveAnalysis = vi.fn((_body?: any) =>
    (answers.saveAnalysis = new Subject<any>()).asObservable());
  const deleteAnalysis = vi.fn((_id?: number) =>
    (answers.deleteAnalysis = new Subject<any>()).asObservable());
  const cancel = vi.fn((_id?: string) => (answers.cancel = new Subject<any>()).asObservable());

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: StorageService, useValue: { buckets, listObjects } },
      {
        provide: AnalyticsService,
        useValue: {
          schema, preview, profile, analyze, drill, drillUp, fetchAllAnalyses, saveAnalysis,
          deleteAnalysis, cancel,
        },
      },
      { provide: Dialog, useValue: { open: () => ({ closed: of(over.confirms ?? true) }) } },
    ],
  });

  const fixture = TestBed.createComponent(Analytics);
  fixture.detectChanges();
  const studio = fixture.componentInstance;
  studio.openFile(CSV_FILE);
  answers.schema!.next(SERVER_RESPONSE(CANVAS_SCHEMA));
  answers.preview!.next(SERVER_RESPONSE(pageOf()));
  studio.showTab('canvas');
  fixture.detectChanges();

  return {
    studio, fixture, answers,
    analyze, drill, drillUp, fetchAllAnalyses, saveAnalysis, deleteAnalysis, cancel,
    show(): string {
      fixture.detectChanges();
      return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ');
    },
    /** Picks a one-dimension sum and runs it, settling the request with `result`. */
    ran(result: AnalysisResult = analysisOf()): void {
      studio.setDimension(0, 'region');
      studio.aggregation.set('SUM');
      studio.measureField.set('amount');
      studio.runAnalysis();
      answers.analyze!.next(SERVER_RESPONSE(result));
      fixture.detectChanges();
    },
    /** The body of the most recent analyze call. */
    sent(): any {
      return analyze.mock.calls[analyze.mock.calls.length - 1]?.[0];
    },
  };
}

describe('the analysis that is sent is the analysis that is shown', () => {
  it('will not run a measure that needs a column until one is picked, and says why', () => {
    const canvas = canvasWith();
    canvas.studio.aggregation.set('SUM');

    expect(canvas.studio.canAnalyse()).toBe(false);
    expect(canvas.show()).toContain('Pick the column to measure');

    canvas.studio.measureField.set('amount');
    expect(canvas.studio.canAnalyse()).toBe(true);
  });

  it('runs Count rows with no column at all, and sends no field with it', () => {
    // COUNT_ROWS is the one aggregation that is a question about rows rather than about a
    // column. A field sent with it would appear in the record of what was asked while having had
    // no part in the answer.
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.runAnalysis();

    expect(canvas.sent().measure).toEqual({ aggregation: 'COUNT_ROWS' });
  });

  it('keeps the dimensions in the order they were picked', () => {
    // Department × Status and Status × Department bucket the same rows and are not the same
    // picture: the first dimension is the one a pivot puts down the side.
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.setDimension(1, 'status');
    canvas.studio.runAnalysis();

    expect(canvas.sent().dimensions).toEqual(['region', 'status']);
  });

  it('takes no dimensions at all as a real analysis rather than an unfinished one', () => {
    // One figure over the matching rows, which is what a KPI is.
    const canvas = canvasWith();
    canvas.studio.runAnalysis();

    expect(canvas.sent().dimensions).toEqual([]);
    expect(canvas.studio.canvasCaption()).toContain('over every matching row');
  });

  it('compacts the list when a middle dimension is cleared, leaving no hole', () => {
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.setDimension(1, 'status');
    canvas.studio.setDimension(2, 'city');
    canvas.studio.setDimension(1, '');

    expect(canvas.studio.dimensions()).toEqual(['region', 'city']);
  });

  it('stops at three dimensions', () => {
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.setDimension(1, 'status');
    canvas.studio.setDimension(2, 'city');

    expect(canvas.studio.dimensionSlots()).toEqual(['region', 'status', 'city']);
    expect(canvas.studio.dimensionSlots()).toHaveLength(3);
  });

  it('does not offer a column that is already a dimension in another slot', () => {
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');

    expect(canvas.studio.dimensionOptions(1).map(column => column.name)).not.toContain('region');
  });

  it('sends no filters key at all when nothing is filtering', () => {
    // An empty group on the wire is a filter that means nothing, and a server reading it as one
    // is a server deciding what "no clauses" implies.
    const canvas = canvasWith();
    canvas.studio.runAnalysis();

    expect(canvas.sent().filters).toBeUndefined();
  });

  it('sends the Top-N and its Other bucket only when one is chosen', () => {
    const canvas = canvasWith();
    canvas.studio.runAnalysis();
    expect(canvas.sent().topN).toBeUndefined();
    // Settled before the second run: a run already in flight blocks another, which is the same
    // rule the console keeps about spending a second governor permit on an impatient click.
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));

    canvas.studio.setTopN(25);
    canvas.studio.runAnalysis();
    expect(canvas.sent().topN).toEqual({ limit: 25, includeOther: true });
  });

  it('refuses a custom N that is not a usable number rather than sending it', () => {
    const canvas = canvasWith();
    canvas.studio.setCustomTopN('0');
    expect(canvas.studio.topNLimit()).toBeNull();

    canvas.studio.setCustomTopN('-5');
    expect(canvas.studio.topNLimit()).toBeNull();

    canvas.studio.setCustomTopN('120');
    expect(canvas.studio.topNLimit()).toBe(120);
  });

  it('names the run before it is sent, so there is something to stop', () => {
    const canvas = canvasWith();
    canvas.studio.runAnalysis();

    expect(canvas.sent().queryId).toMatch(/^ui-/);
    expect(canvas.studio.canStopAnalysis()).toBe(true);

    canvas.studio.stopAnalysis();
    expect(canvas.cancel).toHaveBeenCalledWith(canvas.sent().queryId);
  });

  it('shows the server’s refusal in its own words', () => {
    const canvas = canvasWith();
    canvas.studio.runAnalysis();
    canvas.answers.analyze!.next(SERVER_REFUSAL('amount holds VARCHAR, which cannot be summed.'));

    expect(canvas.show()).toContain('amount holds VARCHAR, which cannot be summed.');
    expect(canvas.show()).toContain('The analysis did not run');
  });
});

describe('the filter tree reaches the request with its shape intact', () => {
  it('sends a nested OR group as a group, not as a flattened list', () => {
    const canvas = canvasWith();
    canvas.studio.setFilters({
      op: 'AND',
      clauses: [
        { field: 'status', operator: 'EQ', value: 'active' },
        {
          op: 'OR',
          clauses: [
            { field: 'region', operator: 'EQ', value: 'north' },
            { field: 'region', operator: 'EQ', value: 'south' },
          ],
        },
      ],
    });
    canvas.studio.runAnalysis();

    expect(canvas.sent().filters).toEqual({
      op: 'AND',
      clauses: [
        { field: 'status', operator: 'EQ', value: 'active' },
        {
          op: 'OR',
          clauses: [
            { field: 'region', operator: 'EQ', value: 'north' },
            { field: 'region', operator: 'EQ', value: 'south' },
          ],
        },
      ],
    });
  });

  it('nests an OR tree rather than spreading it beside a clicked filter', () => {
    // Spreading (a OR b) into a list joined by AND turns a filter that admitted either into one
    // that demands both -- silently, and only when a chip happens to be present.
    const canvas = canvasWith();
    canvas.studio.setFilters({
      op: 'OR',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        { field: 'region', operator: 'EQ', value: 'south' },
      ],
    });
    canvas.studio.crossFilter('status', 'active');

    const filters = canvas.sent().filters;
    expect(filters.op).toBe('AND');
    expect(filters.clauses[0].op).toBe('OR');
    expect(filters.clauses[1]).toEqual({ field: 'status', operator: 'EQ', value: 'active' });
  });

  it('does not send a condition that is still missing an operand, and says how many', () => {
    const canvas = canvasWith();
    canvas.studio.setFilters({
      op: 'AND',
      clauses: [
        { field: 'region', operator: 'EQ', value: 'north' },
        { field: 'amount', operator: 'BETWEEN', values: ['10'] },
      ],
    });
    canvas.studio.runAnalysis();

    expect(canvas.sent().filters.clauses).toHaveLength(1);
    expect(canvas.studio.unfinishedFilterCount()).toBe(1);
    expect(canvas.show()).toContain('1 not finished, so not applied');
  });

  it('says that these filters do not reach the Data tab’s preview', () => {
    // The preview endpoint takes a page and a size and has no filter parameter. A chip claiming
    // to filter a table it cannot reach would be worse than no chip.
    const canvas = canvasWith();

    expect(canvas.show()).toContain('narrow the Data tab');
  });
});

describe('cross-filtering: clicking a result narrows everything drawn from it', () => {
  it('adds a chip and re-runs the analysis', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.crossFilter('region', 'north');

    expect(canvas.sent().filters.clauses)
      .toEqual([{ field: 'region', operator: 'EQ', value: 'north' }]);
    expect(canvas.studio.filterChips().map(chip => chip.label)).toEqual(['region is "north"']);
  });

  it('shows the chip on screen, as something that can be taken off', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.crossFilter('region', 'north');
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));

    expect(canvas.show()).toContain('Filtered to');
    expect(canvas.show()).toContain('region is "north"');
  });

  it('removes the chip and re-runs without it', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.crossFilter('region', 'north');
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));
    canvas.studio.removeChip({ kind: 'clicked', index: 0 });

    expect(canvas.studio.crossFilters()).toEqual([]);
    expect(canvas.sent().filters).toBeUndefined();
  });

  it('does not add the same filter twice when the same cell is clicked again', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.crossFilter('region', 'north');
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));
    canvas.studio.crossFilter('region', 'north');

    expect(canvas.studio.crossFilters()).toHaveLength(1);
  });

  it('filters a null group with IS NULL rather than an equality that is never true', () => {
    // "= NULL" is never true, so an equality here would hand back an empty result for a group the
    // reader can see has rows in it -- and they would read that emptiness as the answer.
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [[null, '100']] }));
    canvas.studio.crossFilter('region', null);

    expect(canvas.sent().filters.clauses)
      .toEqual([{ field: 'region', operator: 'IS_NULL' }]);
  });

  it('leaves a chart mark inert when the label is several dimensions joined together', () => {
    // "north · active" is not a value in any column, so filtering on it would match nothing
    // while looking like it matched something.
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.setDimension(1, 'status');
    canvas.studio.aggregation.set('SUM');
    canvas.studio.measureField.set('amount');
    canvas.studio.runAnalysis();
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'status', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
      ],
      rows: [['north', 'active', '100']],
      dimensions: ['region', 'status'],
    })));

    expect(canvas.studio.markClickable()).toBe(false);
    canvas.studio.crossFilterFromMark('north · active');
    expect(canvas.studio.crossFilters()).toEqual([]);
  });

  it('says that the figures cover the matching rows, and that a missing one is not a zero', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.crossFilter('region', 'north');
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));

    expect(canvas.show())
      .toContain('absent from this result, which is not the same as its value being zero');
  });
});

describe('drill-down and drill-up, where the trail is echoed and never rebuilt', () => {
  const STEP = { dimension: 'region', value: 'north', nextDimension: 'city' };
  const DRILLED = analysisOf({
    columns: [
      { name: 'city', type: 'VARCHAR', role: 'DIMENSION' },
      { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
    ],
    rows: [['leeds', '4000']],
    dimensions: ['city'],
    drillPath: [STEP],
    crumbs: [{ label: 'All rows' }, { label: 'region: north', field: 'region', value: 'north' }],
  });

  function drilling() {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.drillNext.set('city');
    canvas.studio.drillInto('north');
    return canvas;
  }

  it('sends the whole analysis with the step, and lets the server compose it', () => {
    const canvas = drilling();
    const [request, into] = canvas.drill.mock.calls[0];

    expect(into).toEqual({ dimension: 'region', value: 'north', nextDimension: 'city' });
    expect(request.dimensions).toEqual(['region']);
    expect(request.drillPath).toEqual([]);
  });

  it('does not narrow anything until the drill has actually succeeded', () => {
    // Applying the composition first would leave the screen holding a narrowing that never
    // happened if the request failed.
    const canvas = drilling();
    expect(canvas.studio.dimensions()).toEqual(['region']);

    canvas.answers.drill!.next(SERVER_REFUSAL('The engine had no slot free.'));
    expect(canvas.studio.dimensions()).toEqual(['region']);
    expect(canvas.studio.drillPath()).toEqual([]);
  });

  it('takes the new dimensions and the new trail from the answer, not from a local guess', () => {
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));

    expect(canvas.studio.dimensions()).toEqual(['city']);
    expect(canvas.studio.drillPath()).toEqual([STEP]);
  });

  it('echoes the trail back on the next request, unchanged', () => {
    // The endpoints are stateless: the trail has to travel, and it travels as the server wrote it.
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));
    canvas.studio.runAnalysis();

    expect(canvas.sent().drillPath).toEqual([STEP]);
  });

  it('does not repeat the drill’s own filters in the filter tree', () => {
    // The server derives a drill's predicates from drillPath itself. Echoing them into `filters`
    // as well would apply each one twice -- and a null step, which the server narrows with IS
    // NULL, would be narrowed here with an equality that is never true.
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.crossFilter('status', 'active');
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));
    canvas.studio.drillInto('north');
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));
    canvas.studio.runAnalysis();

    expect(canvas.sent().filters.clauses)
      .toEqual([{ field: 'status', operator: 'EQ', value: 'active' }]);
    expect(canvas.sent().drillPath).toEqual([STEP]);
  });

  it('sends a null group as null, so the server narrows it with IS NULL', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [[null, '100']] }));
    canvas.studio.drillInto(canvas.studio.drillValueOf(canvas.studio.analysisRows()[0]));

    expect(canvas.drill.mock.calls[0][1].value).toBeNull();
  });

  it('renders the crumbs the server sent, and does not build its own', () => {
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(analysisOf({
      dimensions: ['city'],
      drillPath: [STEP],
      crumbs: [
        { label: 'All users' },
        { label: 'Department: Engineering', field: 'department', value: 'Engineering' },
      ],
    })));

    // The labels are the server's words. "Department: Engineering" is nowhere in this component.
    expect(canvas.show()).toContain('All users');
    expect(canvas.show()).toContain('Department: Engineering');
  });

  it('labels a drill chip with the server’s crumb, so the two never word a step differently', () => {
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));

    expect(canvas.studio.filterChips().map(chip => chip.label)).toEqual(['region: north']);
  });

  it('asks the server to undo the steps rather than undoing them here', () => {
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));
    canvas.studio.drillUp(1);

    expect(canvas.drillUp.mock.calls[0][1]).toBe(1);
    expect(canvas.drillUp.mock.calls[0][0].drillPath).toEqual([STEP]);

    canvas.answers.drillUp!.next(SERVER_RESPONSE(analysisOf()));
    expect(canvas.studio.dimensions()).toEqual(['region']);
    expect(canvas.studio.drillPath()).toEqual([]);
  });

  it('counts the steps to remove from the crumbs on screen, not from its own stack', () => {
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));
    canvas.studio.drillInto('leeds');
    canvas.answers.drill!.next(SERVER_RESPONSE(analysisOf({
      dimensions: [],
      drillPath: [STEP, { dimension: 'city', value: 'leeds' }],
      crumbs: [{ label: 'All rows' }, { label: 'region: north' }, { label: 'city: leeds' }],
    })));

    // Clicking "All rows" -- crumb 0 of three -- climbs out of both steps.
    canvas.studio.crumbClick(0);
    expect(canvas.drillUp.mock.calls[0][1]).toBe(2);
  });

  it('says so when it has drilled and the server sent no trail back', () => {
    // A response with a drill path and no crumbs is a server not holding up its half of the
    // contract. Inventing the labels here would hide exactly that.
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(analysisOf({
      dimensions: ['city'], drillPath: [STEP], crumbs: [],
    })));

    expect(canvas.studio.crumbsMissing()).toBe(true);
    expect(canvas.show()).toContain('the server did not send a breadcrumb trail');
  });

  it('drops the trail when the dimensions it drilled through are re-picked', () => {
    // A drill is a narrowing of one particular analysis. Sending its trail on with a fresh set of
    // dimensions would leave a reader filtered by a step they can no longer see or undo.
    const canvas = drilling();
    canvas.answers.drill!.next(SERVER_RESPONSE(DRILLED));
    expect(canvas.studio.drillPath()).toEqual([STEP]);

    canvas.studio.setDimension(0, 'status');
    expect(canvas.studio.drillPath()).toEqual([]);
    canvas.studio.runAnalysis();
    // Empty rather than absent here because these tests see the request object; the wire body
    // omits an empty trail entirely, which is analysisBody's job and clauseToWire's neighbour.
    expect(canvas.sent().drillPath).toEqual([]);
  });
});

describe('a value on the wire is a string, and has to be a faithful one', () => {
  it('expands scientific notation without going anywhere near a float', () => {
    // The measured defect: sum(amount) came back as 7.466125E7 and a reader glancing at it sees
    // seven point something.
    expect(plainDecimal('7.466125E7')).toBe('74661250');
    expect(plainDecimal('-1.5e3')).toBe('-1500');
    expect(plainDecimal('1.23E-4')).toBe('0.000123');
    expect(plainDecimal('5E0')).toBe('5');
  });

  it('leaves a plain decimal exactly as the engine wrote it, trailing zeros and all', () => {
    // "12500.00" is a currency amount with two places. Normalising it to 12500 would throw away
    // the scale the engine chose, and a round trip through Number would round a wide DECIMAL.
    expect(plainDecimal('12500.00')).toBe('12500.00');
    expect(plainDecimal('0.000000000000000001')).toBe('0.000000000000000001');
    expect(plainDecimal('123456789012345678901234567890'))
      .toBe('123456789012345678901234567890');
  });

  it('leaves anything that is not a number alone', () => {
    expect(plainDecimal('north')).toBe('north');
    expect(plainDecimal('')).toBe('');
  });

  it('trims a DATE’s phantom midnight, and only when it really is midnight', () => {
    expect(dateOnly('2024-01-01 00:00:00.0')).toBe('2024-01-01');
    expect(dateOnly('2024-01-01T00:00:00')).toBe('2024-01-01');
    expect(dateOnly('2024-01-01 00:00')).toBe('2024-01-01');
    // A time under a column typed DATE is a contradiction between the type and the value, and
    // the right thing to do with a contradiction is show it.
    expect(dateOnly('2024-01-01 09:30:00.0')).toBe('2024-01-01 09:30:00.0');
  });

  it('renders each cell as the column says it is, and no further', () => {
    const canvas = canvasWith();

    expect(canvas.studio.renderCell(
      { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' }, '7.466125E7')).toBe('74661250');
    expect(canvas.studio.renderCell(
      { name: 'booked_on', type: 'DATE', role: 'DIMENSION' }, '2024-01-01 00:00:00.0'))
      .toBe('2024-01-01');
    // A TIMESTAMP genuinely carries a time; trimming it would be the opposite error.
    expect(canvas.studio.renderCell(
      { name: 'seen_at', type: 'TIMESTAMP', role: 'DIMENSION' }, '2024-01-01 00:00:00.0'))
      .toBe('2024-01-01 00:00:00.0');
    expect(canvas.studio.renderCell(
      { name: 'region', type: 'VARCHAR', role: 'DIMENSION' }, '007')).toBe('007');
  });

  it('draws the faithful value on the screen, not the wire form', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [['north', '7.466125E7']] }));

    expect(canvas.show()).toContain('74661250');
    expect(canvas.show()).not.toContain('7.466125E7');
  });

  it('keeps a null a null rather than turning it into an empty cell', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [[null, '100']] }));

    expect(canvas.studio.analysisRows()[0].cells[0].isNull).toBe(true);
    expect(canvas.show()).toContain('null');
  });
});

describe('a partial answer says so on the figure, not in a footnote', () => {
  it('marks a truncated result beside its count and again on the figure’s own title', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ truncated: true }));
    const text = canvas.show();

    expect(text).toContain('stopped at the limit — there may be more');
    expect(text).toContain('partial — part of the answer');
    expect(text).toContain('This is part of the answer.');
  });

  it('says the opposite when the result is whole', () => {
    // The control. A screen that always hedged would be as useless as one that never did.
    const canvas = canvasWith();
    canvas.ran();
    const text = canvas.show();

    expect(text).toContain('every group that matched');
    expect(text).not.toContain('partial — part of the answer');
  });

  it('shows the Other bucket rather than implying it', () => {
    const canvas = canvasWith();
    canvas.studio.setTopN(10);
    canvas.ran(analysisOf({
      rows: [['north', '12500.00'], ['Other', '3000.00']],
      other: {
        label: 'Other', values: ['east', 'west', 'central'], valueCount: 3, valuesTruncated: false,
      },
    }));
    const text = canvas.show();

    expect(text).toContain('3 rolled into');
    expect(text).toContain('east, west, central');
  });

  it('reports the size of the bucket, not the length of the sample it was sent', () => {
    // The server caps the list on a high-cardinality dimension and says so. Reporting the sample
    // length as the bucket size would turn its own honesty about the cap into a smaller, wrong
    // number.
    const canvas = canvasWith();
    canvas.studio.setTopN(10);
    canvas.ran(analysisOf({
      rows: [['north', '12500.00'], ['Other', '3000.00']],
      other: {
        label: 'Other', values: ['east', 'west'], valueCount: 4212, valuesTruncated: true,
      },
    }));
    const text = canvas.show();

    expect(text).toContain('4212 rolled into');
    // Asserted on the note as well as the pill: they are two separate claims, and only one of
    // them was reading valueCount when this was written.
    expect(canvas.studio.canvasNotes().some(note => note.includes('4212 values were rolled into')))
      .toBe(true);
    expect(text).toContain('and more that are not listed');
  });

  it('will not let the rolled-up row be filtered to or drilled into', () => {
    // "Other" is not a value in the data. It is the values the reader has not been shown.
    const canvas = canvasWith();
    canvas.studio.setTopN(10);
    canvas.ran(analysisOf({
      rows: [['north', '12500.00'], ['Other', '3000.00']],
      other: { label: 'Other', values: ['east', 'west'], valueCount: 2, valuesTruncated: false },
    }));

    expect(canvas.studio.analysisRows()[0].isOther).toBe(false);
    expect(canvas.studio.analysisRows()[1].isOther).toBe(true);
  });

  it('warns before the run that a Top-N with no Other loses the tail entirely', () => {
    const canvas = canvasWith();
    canvas.studio.setTopN(10);
    canvas.studio.topNOther.set(false);

    expect(canvas.show()).toContain('the tail will be missing, not summarised');
  });

  it('says that rows a filter excluded are excluded, not zero', () => {
    const canvas = canvasWith();
    canvas.studio.setFilters({
      op: 'AND', clauses: [{ field: 'status', operator: 'EQ', value: 'active' }],
    });
    canvas.ran();

    expect(canvas.show()).toContain('not the same as its value being zero');
  });

  it('says an empty result is an answer rather than a failure', () => {
    const canvas = canvasWith();
    canvas.studio.setFilters({
      op: 'AND', clauses: [{ field: 'status', operator: 'EQ', value: 'nothing' }],
    });
    canvas.ran(analysisOf({ rows: [], rowCount: 0 }));

    expect(canvas.show()).toContain('the rows are excluded, not zero');
  });

  it('counts a row whose measure will not parse out of the chart rather than as a zero', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [['north', '12500'], ['south', 'n/a']] }));
    canvas.studio.canvasKindName.set('ranked');

    expect(canvas.studio.canvasUnparsed()).toBe(1);
    expect(canvas.show()).toContain('does not read as a number');
  });

  it('says when the ranked view is silently dropping a zero or a negative', () => {
    // RankedBar filters out values at or below zero, and a dropped bar looks exactly like a
    // category that was never in the data. A SUM over refunds is negative; a filtered group is
    // zero. Both are real results here.
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [['north', '12500'], ['south', '-400'], ['east', '0']] }));
    canvas.studio.canvasKindName.set('ranked');

    expect(canvas.studio.canvasNonPositive()).toBe(2);
    expect(canvas.show()).toContain('zero or below and the ranked view does not draw a bar');
  });

  it('says what a relative window actually resolved to', () => {
    // "Last 7 days" is not reproducible from the request alone -- it depends on when it ran -- so
    // two charts taken an hour either side of midnight legitimately differ. This is the only
    // thing on screen that lets a reader see why.
    const canvas = canvasWith();
    canvas.ran(analysisOf({ resolvedWindows: { LAST_7_DAYS: '2024-03-01 to 2024-03-07' } }));

    expect(canvas.show()).toContain('"LAST_7_DAYS" resolved to 2024-03-01 to 2024-03-07');
  });
});

describe('a distinct count is labelled as whatever it actually is', () => {
  function counted(measureColumn: string) {
    const canvas = canvasWith();
    canvas.studio.aggregation.set('DISTINCT_COUNT');
    canvas.studio.measureField.set('region');
    canvas.studio.setDimension(0, 'status');
    canvas.studio.runAnalysis();
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf({
      columns: [
        { name: 'status', type: 'VARCHAR', role: 'DIMENSION' },
        { name: measureColumn, type: 'BIGINT', role: 'MEASURE' },
      ],
      rows: [['active', '12']],
      dimensions: ['status'],
      measure: measureColumn,
    })));
    return canvas;
  }

  it('says a grouped distinct count is exact, and that the Profile tab’s is not', () => {
    // The same word means two different things on two tabs of this screen. The Canvas runs
    // count(DISTINCT ...); the Profile tab reads SUMMARIZE's approx_unique, a HyperLogLog sketch
    // measured 3.7% low over a million distinct values. A reader who has learnt to distrust one
    // has no way of knowing the other is trustworthy unless it is said.
    const canvas = counted('region_distinct_count');

    expect(canvas.studio.distinctExactness()).toBe('exact');
    expect(canvas.show()).toContain('This distinct count is exact');
  });

  it('follows the server’s own column name if it ever becomes an estimate', () => {
    const canvas = counted('region_approx_distinct');

    expect(canvas.studio.distinctExactness()).toBe('estimated');
    expect(canvas.show()).toContain('estimated, not counted');
    expect(canvas.show()).toContain('3.7% low');
  });

  it('will not claim either when the name says neither', () => {
    const canvas = counted('regions');

    expect(canvas.studio.distinctExactness()).toBe('unstated');
    expect(canvas.show()).toContain('exactness not stated');
    expect(canvas.show()).toContain('does not say whether this distinct count is exact');
  });

  it('says nothing about exactness for the aggregations where it does not arise', () => {
    const canvas = canvasWith();
    canvas.ran();

    expect(canvas.studio.distinctExactness()).toBe('');
    expect(canvas.show()).not.toContain('exactness not stated');
  });

  it('hedges the median on the picker, before anything has been run', () => {
    const canvas = canvasWith();
    canvas.studio.aggregation.set('MEDIAN');

    expect(canvas.show()).toContain('two middle values');
  });
});

describe('the pivot: two dimensions, with the aggregate in the cells', () => {
  const GRID = analysisOf({
    columns: [
      { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
      { name: 'status', type: 'VARCHAR', role: 'DIMENSION' },
      { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
    ],
    rows: [['north', 'active', '100'], ['north', 'closed', '40'], ['south', 'active', '60']],
    rowCount: 3,
    dimensions: ['region', 'status'],
    pivot: {
      rowDimension: 'region', columnDimension: 'status', columnValues: ['active', 'closed'],
      rows: [
        { key: 'north', cells: ['100', '40'] },
        { key: 'south', cells: ['60', null] },
      ],
      columnsTruncated: false,
    },
  });

  function pivoted(result: AnalysisResult = GRID) {
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.setDimension(1, 'status');
    canvas.studio.aggregation.set('SUM');
    canvas.studio.measureField.set('amount');
    canvas.studio.runAnalysis();
    canvas.answers.analyze!.next(SERVER_RESPONSE(result));
    canvas.studio.canvasKindName.set('pivot');
    canvas.fixture.detectChanges();
    return canvas;
  }

  it('draws the grid the server composed rather than rebuilding one', () => {
    // Rebuilding it from the flat rows is a second implementation of the same rearrangement, and
    // the two could disagree about which dimension is the row axis -- which transposes somebody's
    // chart without saying so.
    const canvas = pivoted();
    const pivot = canvas.studio.pivot()!;

    expect(pivot.rowDimension).toBe('region');
    expect(pivot.columnDimension).toBe('status');
    expect(pivot.columns).toEqual(['active', 'closed']);
    expect(pivot.rows.map(row => row.label)).toEqual(['north', 'south']);
  });

  it('leaves a combination with no rows empty, and never calls it zero', () => {
    const canvas = pivoted();

    expect(canvas.studio.pivot()!.rows[1].values).toEqual(['60', null]);
    expect(canvas.show()).toContain('An empty cell means no rows in that combination');
  });

  it('totals a row only when the parts add up to it', () => {
    const canvas = pivoted();

    expect(canvas.studio.pivot()!.additive).toBe(true);
    expect(canvas.studio.pivot()!.rows[0].total).toBe(140);
  });

  it('offers no total at all for an average, rather than summing averages', () => {
    const canvas = pivoted();
    canvas.studio.aggregation.set('AVERAGE');

    expect(canvas.studio.pivot()!.additive).toBe(false);
    expect(canvas.studio.pivot()!.rows[0].total).toBeNull();
    expect(canvas.studio.pivotTotalNote()).toContain('does not add up');
  });

  it('says why there is no grid when the column dimension is too wide for one', () => {
    // A table five thousand columns wide is not a narrower version of the answer, it is an
    // unusable one, so the server sends the reason instead of the grid.
    const canvas = pivoted(analysisOf({
      columns: [
        { name: 'region', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'status', type: 'VARCHAR', role: 'DIMENSION' },
        { name: 'amount_sum', type: 'DOUBLE', role: 'MEASURE' },
      ],
      dimensions: ['region', 'status'],
      pivot: {
        rowDimension: 'region', columnDimension: 'status', columnValues: [], rows: null,
        columnsTruncated: true,
      },
    }));

    expect(canvas.studio.canvasKinds().find(kind => kind.id === 'pivot')!.issue)
      .toContain('more values than a grid can carry');
  });

  it('is not offered at all when the server sent no grid', () => {
    const canvas = canvasWith();
    canvas.ran();
    const pivot = canvas.studio.canvasKinds().find(kind => kind.id === 'pivot')!;

    expect(pivot.issue).toContain('needs exactly two dimensions');
    expect(canvas.studio.pivot()).toBeNull();
  });
});

describe('the chart kinds offered depend on what the analysis can honestly show', () => {
  it('refuses a ring of averages, because a share needs a total to be a share of', () => {
    const canvas = canvasWith();
    canvas.studio.aggregation.set('AVERAGE');
    canvas.studio.measureField.set('amount');
    canvas.studio.setDimension(0, 'region');
    canvas.studio.runAnalysis();
    canvas.answers.analyze!.next(SERVER_RESPONSE(analysisOf()));
    const donut = canvas.studio.canvasKinds().find(kind => kind.id === 'donut')!;

    expect(donut.issue).toContain('no total to divide');
  });

  it('refuses a ring that would have to include a negative slice', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [['north', '100'], ['south', '-40']] }));
    const donut = canvas.studio.canvasKinds().find(kind => kind.id === 'donut')!;

    expect(donut.issue).toContain('zero or below');
  });

  it('refuses a ring past the number of colours the palette can tell apart', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({
      rows: [['a', '1'], ['b', '2'], ['c', '3'], ['d', '4'], ['e', '5'], ['f', '6'], ['g', '7']],
    }));
    const donut = canvas.studio.canvasKinds().find(kind => kind.id === 'donut')!;

    expect(donut.issue).toContain('six colours');
  });

  it('falls back visibly when the kind that was picked stops working', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.canvasKindName.set('pivot');

    // One dimension, so the pivot is unavailable and the picker moves rather than drawing
    // nothing.
    expect(canvas.studio.canvasKind()).toBe('table');
  });

  it('offers the table whenever there is any result at all', () => {
    const canvas = canvasWith();
    canvas.ran(analysisOf({ rows: [['north', 'n/a']] }));

    expect(canvas.studio.canvasKinds().find(kind => kind.id === 'table')!.issue).toBe('');
    expect(canvas.studio.canvasKind()).toBe('table');
  });
});

describe('saving an analysis: the configuration, never the rows', () => {
  it('sends the dimensions, measure, filters, sort and Top-N as one configuration', () => {
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.aggregation.set('SUM');
    canvas.studio.measureField.set('amount');
    canvas.studio.setTopN(25);
    canvas.studio.setFilters({
      op: 'AND', clauses: [{ field: 'status', operator: 'EQ', value: 'active' }],
    });
    canvas.studio.analysisName.set('Sales by region');
    canvas.studio.saveAnalysis(false);

    const body = canvas.saveAnalysis.mock.calls[0][0];
    expect(body.analysisName).toBe('Sales by region');
    expect(body.connectionAlias).toBe('minio-main');
    expect(body.datasetPath).toBe('daily/sales-2026.csv');

    const config = JSON.parse(body.analysisConfig);
    expect(config.dimensions).toEqual(['region']);
    expect(config.measure).toEqual({ aggregation: 'SUM', field: 'amount' });
    expect(config.topN).toEqual({ limit: 25, includeOther: true });
    expect(config.sort).toEqual({ by: 'MEASURE', direction: 'DESC' });
    expect(config.filters.clauses)
      .toEqual([{ field: 'status', operator: 'EQ', value: 'active' }]);
  });

  it('keeps the chart kind out of the configuration, because the row has a column for it', () => {
    // AnalyticsAnalysis lifts visualization_type into its own column so a listing can show it
    // without parsing, and its javadoc calls a value stored in two places "one row that can
    // disagree with itself".
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.canvasKindName.set('ranked');
    canvas.studio.analysisName.set('Sales by region');
    canvas.studio.saveAnalysis(false);

    const body = canvas.saveAnalysis.mock.calls[0][0];
    expect(body.visualizationType).toBe('ranked');
    expect(JSON.parse(body.analysisConfig).visualizationType).toBeUndefined();
  });

  it('will not save without a name', () => {
    const canvas = canvasWith();
    canvas.ran();

    expect(canvas.studio.canSaveAnalysis()).toBe(false);
    canvas.studio.analysisName.set('  ');
    expect(canvas.studio.canSaveAnalysis()).toBe(false);
  });

  it('offers updating separately from saving a new one, never guessing between them', () => {
    const canvas = canvasWith();
    canvas.ran();
    canvas.studio.analysisName.set('Sales by region');
    canvas.studio.saveAnalysis(false);
    expect(canvas.saveAnalysis.mock.calls[0][0].analyticsAnalysisId).toBeUndefined();

    canvas.answers.saveAnalysis!.next(SERVER_RESPONSE({
      analyticsAnalysisId: 9, analysisName: 'Sales by region', connectionAlias: 'minio-main',
      datasetPath: 'daily/sales-2026.csv', analysisConfig: '{}',
    } as SavedAnalysis));
    canvas.studio.saveAnalysis(true);
    expect(canvas.saveAnalysis.mock.calls[1][0].analyticsAnalysisId).toBe(9);
  });

  it('reopens an analysis onto the canvas without running it', () => {
    // An analysis can be a full scan. Browsing the list should not spend a governor permit.
    const canvas = canvasWith();
    const before = canvas.analyze.mock.calls.length;
    canvas.studio.openAnalysis({
      analyticsAnalysisId: 3, analysisName: 'By status', connectionAlias: 'minio-main',
      datasetPath: 'daily/sales-2026.csv', visualizationType: 'donut',
      analysisConfig: JSON.stringify({
        dimensions: ['status'],
        measure: { aggregation: 'AVERAGE', field: 'amount' },
        filters: { op: 'AND', clauses: [{ field: 'region', operator: 'EQ', value: 'north' }] },
        topN: { limit: 50, includeOther: false },
        sort: { by: 'DIMENSION', direction: 'ASC' },
      }),
    });

    expect(canvas.analyze.mock.calls.length).toBe(before);
    expect(canvas.studio.dimensions()).toEqual(['status']);
    expect(canvas.studio.aggregation()).toBe('AVERAGE');
    expect(canvas.studio.measureField()).toBe('amount');
    expect(canvas.studio.topNLimit()).toBe(50);
    expect(canvas.studio.topNOther()).toBe(false);
    expect(canvas.studio.sortBy()).toBe('DIMENSION');
    expect(canvas.studio.canvasKindName()).toBe('donut');
    expect((canvas.studio.canvasFilters() as FilterGroup).clauses).toHaveLength(1);
  });

  it('refuses to half-restore an analysis whose configuration will not parse', () => {
    // Half a restored analysis -- the dimensions but not the filters -- looks like the saved one
    // and answers a different question.
    const canvas = canvasWith();
    canvas.studio.setDimension(0, 'region');
    canvas.studio.openAnalysis({
      analysisName: 'Broken', connectionAlias: 'minio-main', datasetPath: 'daily/sales-2026.csv',
      analysisConfig: '{not json',
    });

    expect(canvas.studio.dimensions()).toEqual(['region']);
    expect(canvas.show()).toContain('its saved configuration is not readable');
  });

  it('warns when the analysis on screen was saved against a different dataset', () => {
    const canvas = canvasWith();
    canvas.studio.openAnalysis({
      analyticsAnalysisId: 4, analysisName: 'Elsewhere', connectionAlias: 'minio-main',
      datasetPath: 'archive/2025.parquet', analysisConfig: '{}',
    });

    expect(canvas.show()).toContain('archive/2025.parquet');
  });

  it('fetches the saved list once, when the tab is opened, and never runs an analysis for it', () => {
    const canvas = canvasWith();

    expect(canvas.fetchAllAnalyses).toHaveBeenCalledTimes(1);
    expect(canvas.analyze).not.toHaveBeenCalled();

    canvas.studio.showTab('overview');
    canvas.studio.showTab('canvas');
    expect(canvas.fetchAllAnalyses).toHaveBeenCalledTimes(1);
  });
});

describe('the canvas does not disturb the tabs beside it', () => {
  it('clears its picks when another file is opened, because a dimension is a column name', () => {
    const canvas = canvasWith();
    canvas.ran();
    expect(canvas.studio.dimensions()).toEqual(['region']);

    canvas.studio.openFile(REFUNDS);
    expect(canvas.studio.dimensions()).toEqual([]);
    expect(canvas.studio.analysisResult()).toBeNull();
    expect(canvas.studio.crossFilters()).toEqual([]);
    expect(canvas.studio.canvasFilters().clauses).toEqual([]);
    expect(canvas.studio.drillPath()).toEqual([]);
  });

  it('does not scan the profile just because the Canvas tab was opened', () => {
    const canvas = canvasWith();

    expect(canvas.studio.profileLoading()).toBe(false);
    expect(canvas.studio.profile()).toBeNull();
  });

  it('keeps the storage rail’s own filter separate from the analysis filters', () => {
    // Two things called "filtered" on one screen is how a template ends up asking one and
    // meaning the other.
    const canvas = canvasWith();
    canvas.studio.filter.set('sales');

    expect(canvas.studio.analysisFiltered()).toBe(false);
    canvas.studio.crossFilter('region', 'north');
    expect(canvas.studio.analysisFiltered()).toBe(true);
  });
});
