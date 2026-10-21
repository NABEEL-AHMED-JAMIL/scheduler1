import { describe, it, expect, beforeEach } from 'vitest';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { StorageService } from '../objects/storage.service';
import { PipelineApprovalCard, breakdowns, imageColumnOf, orderedColumns, parseCsv, shownColumns } from './pipeline-approval-card';

/**
 * Owner 2026-10-21 (task 1047): a pipeline step's approval listed its raw subject -- job id, step index, approval id and the
 * FIRST row's fields -- so a nurse approving 18 wound photos saw one of them. The card shows the step in words, what it asks,
 * the figures it reported and every row the run kept before the step, with a breakdown to filter by and the photos.
 */
describe('Pipeline approval card: the rows, not the raw subject', () => {
  const csv = 'wound_id,photo_role,photo_file,image_key,measurement_check,length_diff_pct,_source_key\r\n'
    + 'W-1,First visit,w-1-visit1.jpg,agency/p/w-1-visit1.jpg,Matches the chart,2.7,a.csv\r\n'
    + 'W-1,Latest visit,w-1-visit6.jpg,agency/p/w-1-visit6.jpg,"Re-measure: photo and chart disagree",-29.6,a.csv\r\n'
    + 'W-2,First visit,w-2-visit1.jpg,agency/p/w-2-visit1.jpg,Matches the chart,1.0,a.csv\r\n'
    + 'W-2,Latest visit,w-2-visit6.jpg,agency/p/w-2-visit6.jpg,Matches the chart,"4,5",a.csv\r\n';

  it('reads a CSV with quoted fields, commas inside quotes and CRLF', () => {
    const rows = parseCsv(csv);
    expect(rows).toHaveLength(4);
    expect(rows[1]['measurement_check']).toBe('Re-measure: photo and chart disagree');
    expect(rows[3]['length_diff_pct']).toBe('4,5');
    expect(parseCsv('a,b\n"say ""hi""",2')).toEqual([{ a: 'say "hi"', b: '2' }]);
  });

  it('shows the photos once (as photos) and hides the engine\'s own columns', () => {
    const rows = parseCsv(csv);
    expect(imageColumnOf(rows)).toBe('image_key');
    expect(shownColumns(rows, 'image_key')).toEqual(['wound_id', 'photo_role', 'measurement_check', 'length_diff_pct']);
  });

  it('counts the rows by their kinds, the status-like column first, and never by a number', () => {
    const rows = parseCsv(csv);
    const b = breakdowns(rows, shownColumns(rows, 'image_key'));
    expect(b[0].column).toBe('measurement_check');
    expect(b[0].counts).toEqual([{ value: 'Matches the chart', count: 3 }, { value: 'Re-measure: photo and chart disagree', count: 1 }]);
    expect(b.map(x => x.column)).not.toContain('length_diff_pct');
  });

  it('puts a row\'s identity, what tells its rows apart, and its kinds first', () => {
    expect(orderedColumns(['location', 'length_diff_pct', 'photo_role', 'measurement_check', 'wound_id'], ['measurement_check']))
      .toEqual(['wound_id', 'photo_role', 'measurement_check', 'location', 'length_diff_pct']);
  });

  it('breaks down by a status-like column alone when the rows have one', () => {
    const rows = [1, 2, 3, 4].map(i => ({ id: String(i), site: i % 2 ? 'heel' : 'hip', check: i === 4 ? 'Re-measure' : 'Matches' }));
    expect(breakdowns(rows, ['id', 'site', 'check']).map(b => b.column)).toEqual(['check']);
    expect(breakdowns(rows, ['id', 'site']).map(b => b.column)).toEqual(['site']);
  });

  describe('rendered', () => {
    let http: HttpTestingController;
    const subject = {
      link: '/pipelines/schedules/1006/runs/1019/logs', jobId: 1006, attempt: 1, jobName: 'Wound photo measurement (workflow)',
      stepKey: 'approve', stepIndex: 5, rowCount: 4, approvalId: 1019, jobQueueId: 1019, pipelineId: 'LHH_WOUND_PHOTO_REVIEW',
      requestedAt: '2026-10-21T21:32:28.809Z', expiresAt: '2026-10-24T21:32:28.809Z',
      instructions: 'Re-measure every wound flagged before its next visit.', fields: { Flagged: '1' },
    };

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
          { provide: StorageService, useValue: { download: (_b: string, k: string) => of(new Blob([k.endsWith('.csv') ? csv : 'jpg'],
            { type: k.endsWith('.csv') ? 'text/csv' : 'image/jpeg' })) } }],
      });
      http = TestBed.inject(HttpTestingController);
    });

    async function render() {
      const f = TestBed.createComponent(PipelineApprovalCard);
      f.componentRef.setInput('subject', subject);
      f.componentRef.setInput('open', true);
      f.detectChanges();
      http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs')).flush({ status: 'SUCCESS', data: { outputs: [
        { stepIndex: 4, stepKey: 'keep', kind: 'bucket', name: 'measured.csv', format: 'csv', rowCount: 4,
          bucket: 'lakeside-home-health-s3', key: 'results/wound-photo-review/measured.csv' },
        { stepIndex: 6, stepKey: 'report', kind: 'file', name: 'Wound_photo_review.pdf', format: 'pdf', rowCount: 4, runDatasetId: 1111 },
      ] } });
      await settle(f);
      return f;
    }

    async function settle(f: { detectChanges(): void; whenStable(): Promise<unknown> }) {
      for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 0)); f.detectChanges(); await f.whenStable(); }
    }

    it('says what is approved in words, with no raw ids outside Technical details', async () => {
      const el = (await render()).nativeElement as HTMLElement;
      const facts = el.querySelector('[data-test="approval-facts"]')!.textContent!;
      expect(facts).toContain('Wound photo measurement (workflow)');
      expect(facts).toContain('#1019');
      expect(facts).toContain('Approve (step 6)');
      expect(facts).toContain('Decide by');
      expect(el.querySelector('[data-test="approval-instructions"]')!.textContent).toContain('Re-measure every wound flagged');
      expect(el.querySelector('[data-test="approval-figures"]')!.textContent).toContain('Flagged');
      expect(el.querySelector('[data-test="approval-technical"]')!.hasAttribute('open')).toBe(false);
    });

    it('lists every row the run kept before the step, with its photos and the report', async () => {
      const el = (await render()).nativeElement as HTMLElement;
      expect(el.querySelectorAll('[data-test="approval-rows"] tbody tr')).toHaveLength(4);
      expect(el.querySelectorAll('[data-test="approval-photos"] figure')).toHaveLength(4);
      expect(el.querySelector('[data-test="approval-pdf"]')!.textContent).toContain('Wound_photo_review.pdf');
      expect(el.querySelector('[data-test="approval-rows"] thead')!.textContent).not.toContain('Source key');
    });

    it('lists the exception first, marked, in the table and the photos, with its count', async () => {
      const el = (await render()).nativeElement as HTMLElement;
      expect(el.querySelector('[data-test="approval-exceptions"]')!.textContent).toContain('1 to look at first');
      const first = el.querySelector('[data-test="approval-rows"] tbody tr')!;
      expect(first.classList.contains('pac-odd')).toBe(true);
      expect(first.textContent).toContain('Re-measure');
      expect(el.querySelector('[data-test="approval-photos"] figure')!.classList.contains('pac-odd')).toBe(true);
      expect(el.querySelector('[data-test="approval-photos"] figcaption')!.textContent).toBe('W-1 · Latest visit');
    });

    it('filters the rows and photos by a kind when its count is pressed, and back', async () => {
      const f = await render();
      const el = f.nativeElement as HTMLElement;
      const chip = [...el.querySelectorAll<HTMLButtonElement>('[data-test="approval-breakdown"] button')].find(b => b.textContent!.includes('Re-measure'))!;
      chip.click();
      await settle(f);
      expect(chip.getAttribute('aria-pressed')).toBe('true');
      expect(el.querySelectorAll('[data-test="approval-rows"] tbody tr')).toHaveLength(1);
      expect(el.querySelectorAll('[data-test="approval-photos"] figure')).toHaveLength(1);
      chip.click();
      await settle(f);
      expect(el.querySelectorAll('[data-test="approval-rows"] tbody tr')).toHaveLength(4);
    });

    it('says plainly when the run kept no rows before the step', async () => {
      const f = TestBed.createComponent(PipelineApprovalCard);
      f.componentRef.setInput('subject', { ...subject, stepIndex: 2 });
      f.detectChanges();
      http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs')).flush({ status: 'SUCCESS', data: { outputs: [
        { stepIndex: 4, stepKey: 'keep', kind: 'bucket', name: 'measured.csv', format: 'csv', rowCount: 4, bucket: 'b', key: 'k.csv' }] } });
      await settle(f);
      expect((f.nativeElement as HTMLElement).querySelector('[data-test="approval-rows-none"]')).not.toBeNull();
    });
  });
});
