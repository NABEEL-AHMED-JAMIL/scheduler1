import { describe, it, expect } from 'vitest';
import {
  ConversionRow, ConverterLimits, FormatFamily, assistantPrompt, badgeTone, checkLines, conversionText, defaultTarget, documentsTakes,
  folderOf, kindLabel, limitMbFor, notKeptText, panelMeta, problemOf, queueProblem, resultShort, resultText, statusNote, statusOf, stripHint,
} from './converter.model';
import { matchFamilies } from './formats-sheet';
import { pagesOf } from './conversion-panel';
import { facetOptions, togglePick } from '../tools-facets';
import { languageName, rangeText } from '../tools-shared';

const FAMILIES: FormatFamily[] = [
  { key: 'text', label: 'Text document', inputFormats: ['docx', 'odt', 'txt'], outputFormats: ['pdf', 'docx', 'odt'] },
  { key: 'sheet', label: 'Spreadsheet', inputFormats: ['xlsx', 'csv'], outputFormats: ['pdf', 'xlsx', 'csv'] },
  { key: 'drawing', label: 'Drawing', inputFormats: ['vsdx', 'odg'], outputFormats: ['pdf', 'png'] },
];
const LIMITS: ConverterLimits = { maxFileSizeMb: 50, tableMaxFileSizeMb: 500, xlsxMaxFileSizeMb: 100, pdfMaxRows: 5000, pdfMaxPages: 2000,
  maxOutputMb: 50, timeoutSeconds: 140, slots: 2, maxWaiting: 4, running: 0, waiting: 0 };
const row = (over: Partial<ConversionRow> = {}): ConversionRow => ({ conversionId: 1, name: 'Discharge_letter_P-1042', inputFileName: 'Discharge_letter_P-1042.docx',
  inputFormat: 'docx', inputFileSize: 184 * 1024, outputFormat: 'pdf', outputFileSize: 212 * 1024, outputPages: 3, outcome: 'DONE', tookMs: 3100, ...over });

describe('Converter rules (tools redesign)', () => {
  it('gives a new file the format asked for all files when its family has it, else its first other format', () => {
    expect(defaultTarget(FAMILIES[0], 'docx', 'pdf')).toBe('pdf');
    expect(defaultTarget(FAMILIES[0], 'docx', 'png')).toBe('pdf');
    expect(defaultTarget(FAMILIES[2], 'vsdx', 'png')).toBe('png');
    expect(defaultTarget(null, 'zip', 'pdf')).toBe('');
  });

  it('streams a table to PDF under its own, larger limit', () => {
    expect(limitMbFor(LIMITS, 'csv', 'pdf')).toBe(500);
    expect(limitMbFor(LIMITS, 'xlsx', 'pdf')).toBe(100);
    expect(limitMbFor(LIMITS, 'docx', 'pdf')).toBe(50);
    expect(limitMbFor(null, 'docx', 'pdf')).toBeNull();
    expect(stripHint(LIMITS)).toBe('up to 20 at once, 50 MB each');
    expect(stripHint(null)).toBe('up to 20 at once, 50 MB each');
  });

  it('says a recording is Audio Transcript\'s, and any other unknown type points at Supported formats', () => {
    expect(queueProblem(FAMILIES, 'ward-round.m4a')?.title).toBe('A recording, not a document.');
    expect(queueProblem(FAMILIES, 'archive.zip')?.text).toContain('Supported formats');
    expect(queueProblem(FAMILIES, 'README')?.text).toContain('no extension');
    expect(queueProblem(FAMILIES, 'Letter.DOCX')).toBeNull();
  });

  it('says each failure in plain words with what to do next', () => {
    const big = problemOf(row({ outcome: 'FAILED', errorCode: 'TOO_LARGE', inputFormat: 'pdf', inputFileSize: 61.2 * 1024 * 1024 }), LIMITS)!;
    expect(big.title).toBe('Too large to convert.');
    expect(big.text).toBe('This file is 61.2 MB; the converter takes up to 50 MB a file. Split it into parts, or ask your administrator to raise the limit.');
    const locked = problemOf(row({ outcome: 'FAILED', errorCode: 'PASSWORD' }))!;
    expect(locked.icon).toBe('lock');
    expect(locked.text).toContain('File › Info › Protect Document');
    expect(problemOf(row({ outcome: 'FAILED', errorCode: 'PASSWORD', inputFormat: 'pdf' }))!.text).toContain('PDF reader');
    expect(problemOf(row({ outcome: 'FAILED', errorCode: 'FAILED', errorHint: 'The server said why.' }))!.text).toBe('The server said why.');
    expect(problemOf(row())).toBeNull();
  });

  it('labels Recent conversions\' status and the line under it', () => {
    expect(statusOf(row())).toEqual({ label: 'Done', tone: 'ok', icon: 'check' });
    expect(statusOf(row({ outcome: 'SHORTENED' })).label).toBe('Shortened');
    expect(statusOf(row({ outcome: 'FAILED', errorCode: 'TOO_LARGE' })).label).toBe('Too large');
    expect(statusOf(row({ outcome: 'FAILED', errorCode: 'PASSWORD' }))).toMatchObject({ label: 'Password', icon: 'lock' });
    expect(statusNote(row({ outcome: 'SHORTENED', rowCount: 7412, rowsShown: 5000 }), LIMITS)).toBe('first 5,000 of 7,412 rows');
    expect(statusNote(row({ outcome: 'FAILED', errorCode: 'TOO_LARGE', inputFormat: 'pdf', inputFileSize: 61.2 * 1024 * 1024 }), LIMITS)).toBe('61.2 MB, limit 50 MB');
    expect(statusNote(row(), LIMITS)).toBe('');
  });

  it('writes a row\'s conversion and result, and the panel\'s meta line, as the design does', () => {
    expect(resultText(row())).toBe('184.0 KB → 212.0 KB · 3 pages');
    expect(resultText(row({ outcome: 'FAILED' }))).toBe('—');
    expect(conversionText(row())).toBe('DOCX → PDF');
    expect(conversionText(row({ outcome: 'FAILED', inputFormat: 'pdf' }))).toBe('PDF → —');
    expect(resultShort(row())).toBe('3 pages · 212.0 KB');
    expect(resultShort(row({ outputPages: 1 }))).toBe('1 page · 212.0 KB');
    expect(resultShort(row({ outcome: 'FAILED' }))).toBe('—');
    expect(panelMeta(row())).toBe('DOCX → PDF · 3.1 s');
    expect(panelMeta(row({ tookMs: null }))).toBe('DOCX → PDF');
  });

  it('says the converter\'s checks on one line, and apart what did not pass', () => {
    const checks = [{ key: 'pages', ok: true, text: 'Same page count' }, { key: 'fonts', ok: true, text: 'Fonts embedded' },
      { key: 'text', ok: true, text: 'Text can be selected and searched' }];
    expect(checkLines(row({ checks }))).toEqual({ ok: 'Same page count · fonts embedded', warn: '' });
    expect(checkLines(row({ checks: [...checks, { key: 'substitution', ok: false, text: 'Calibri replaced by Carlito' }] })).warn).toBe('Calibri replaced by Carlito');
    expect(checkLines(row({ outcome: 'SHORTENED', rowCount: 7412, rowsShown: 5000, checks: [] })).warn).toBe('First 5,000 of 7,412 rows printed');
    expect(checkLines(row({ checks: null }))).toEqual({ ok: '', warn: '' });
  });

  it('lists a facet\'s choices with their counts, a picked one kept at 0, and toggles a pick', () => {
    const words = { DONE: 'Done', SHORTENED: 'Shortened', FAILED: 'Failed' };
    expect(facetOptions({ DONE: 10, FAILED: 1 }, words, [], ['DONE', 'SHORTENED', 'FAILED']).map(o => `${o.label} ${o.count}`))
      .toEqual(['Done 10', 'Shortened 0', 'Failed 1']);
    expect(facetOptions({ word: 7 }, { word: 'Word', excel: 'Excel and CSV' }, ['excel']).map(o => o.value)).toEqual(['word', 'excel']);
    expect(facetOptions({ en: 5, unknown: 1 }, {}, [], [], languageName).map(o => o.label)).toEqual(['English', 'Unknown']);
    expect(togglePick({}, 'status', 'DONE')).toEqual({ status: ['DONE'] });
    expect(togglePick({ status: ['DONE', 'FAILED'] }, 'status', 'DONE')).toEqual({ status: ['FAILED'] });
    expect(rangeText(2, 25, 60)).toBe('26–50 of 60');
    expect(rangeText(1, 25, 0)).toBe('0 of 0');
  });

  it('names where a result is kept, or until when it is listed', () => {
    expect(folderOf({ outputStorageKey: 'converted/2026-11/1042/output/a.pdf', targetFolder: 'converted/2026-11' })).toBe('converted/2026-11/1042/output/');
    expect(folderOf({ outputStorageKey: null, targetFolder: '/policies' })).toBe('policies/');
    expect(folderOf({ outputStorageKey: null, targetFolder: null })).toBe('/');
    expect(notKeptText(row(), '2 Dec')).toBe('Not kept · until 2 Dec');
    expect(notKeptText(row({ keptIn: 'bucket' }), '2 Dec')).toBe('');
    expect(notKeptText(row({ outcome: 'FAILED' }), '2 Dec')).toBe('');
  });

  it('offers Send to Documents only for what Document Intelligence reads', () => {
    expect(documentsTakes('PDF')).toBe(true);
    expect(documentsTakes('tiff')).toBe(true);
    expect(documentsTakes('docx')).toBe(false);
    expect(documentsTakes(null)).toBe(false);
  });

  it('names a file\'s kind and colour group, never a colour', () => {
    expect(kindLabel('xlsx')).toBe('Excel workbook');
    expect(kindLabel('zzz')).toBe('ZZZ file');
    expect(badgeTone('docx')).toBe('ft-word');
    expect(badgeTone('tiff')).toBe('ft-image');
    expect(badgeTone('pdf')).toBe('ft-pdf');
  });

  it('starts the AI Assistant on the kept file', () => {
    expect(assistantPrompt('riverside-health', 'converted/2026-11/a.pdf')).toBe('Build a pipeline that reads the file riverside-health/converted/2026-11/a.pdf and ');
  });

  it('finds a family by a format with or without its dot', () => {
    expect(matchFamilies(FAMILIES, '.vsdx').map(f => f.key)).toEqual(['drawing']);
    expect(matchFamilies(FAMILIES, 'spread').map(f => f.key)).toEqual(['sheet']);
    expect(matchFamilies(FAMILIES, '  ')).toHaveLength(3);
  });

  it('counts a side\'s pages from the row, else the server\'s header, else one', () => {
    expect(pagesOf(row(), 'output', 9)).toBe(3);
    expect(pagesOf(row({ inputPages: null }), 'input', 2)).toBe(2);
    expect(pagesOf(row({ inputPages: null }), 'input', null)).toBe(1);
  });
});
