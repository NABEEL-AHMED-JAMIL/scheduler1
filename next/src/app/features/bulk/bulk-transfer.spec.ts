import { describe, it, expect, vi, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { HttpEventType, HttpHeaders } from '@angular/common/http';
import { BulkTransfer } from './bulk-transfer';
import { ToastService } from '../../shared/ui/toast.service';
import { localIsoDay } from '../../shared/ui/local-day';

function page(http: Record<string, unknown> = {}) {
  const errors: string[] = [];
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [BulkTransfer], providers: [
    provideRouter([]),
    { provide: HttpClient, useValue: http },
    { provide: ToastService, useValue: { success: vi.fn(), error: (m: string) => errors.push(m), info: vi.fn() } },
  ] });
  const fixture = TestBed.createComponent(BulkTransfer);
  fixture.componentRef.setInput('kind', 'task');
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, component: fixture.componentInstance, errors };
}

describe('Bulk import / export', () => {
  /**
   * Back was location.back(): opened directly or in a new tab it left the console. Each route
   * already carried a backTo that nothing read (UI audit, Low).
   */
  it('links back to its own list rather than to the browser history', () => {
    const { el } = page();
    const back = [...el.querySelectorAll('a')].find(a => /Back to pipelines/.test(a.textContent!));
    expect(back?.getAttribute('href')).toBe('/pipelines');
  });

  /**
   * A download asks for a blob, so on failure err.error is a Blob and err.error.message was
   * always undefined: the server's reason was never shown (UI audit, Low).
   */
  it('shows the server\'s reason when a download is refused', async () => {
    const body = new Blob([JSON.stringify({ status: 'ERROR', message: 'Nothing to export yet.' })], { type: 'application/json' });
    const { component, errors } = page({ get: () => throwError(() => ({ error: body })) });
    component.download('exportAll');
    await vi.waitFor(() => expect(errors).toEqual(['Nothing to export yet.']));
    expect(component.downloading()).toBe('');
  });

  it('falls back to its own sentence when the refusal body says nothing useful', async () => {
    const { component, errors } = page({ get: () => throwError(() => ({ error: new Blob(['<html>502</html>']) })) });
    component.download('template');
    await vi.waitFor(() => expect(errors).toEqual(['The file could not be downloaded.']));
  });

  /** The shared dropzone takes the drop; this screen still only takes a spreadsheet. */
  it('refuses a file that is not a spreadsheet', () => {
    const { component, errors } = page();
    component.onFile(new File(['a,b'], 'orders.csv'));
    expect(component.file()).toBeNull();
    expect(errors[0]).toContain('.xlsx');
    component.onFile(new File(['x'], 'orders.xlsx'));
    expect(component.file()?.name).toBe('orders.xlsx');
  });

  /**
   * The importer reads the sheet as an .xlsx workbook (XSSF), so an .xls was offered by the
   * picker and then refused by the server (UI review jobs#15).
   */
  it('refuses an old .xls workbook, and offers only .xlsx', () => {
    const { component, errors, el } = page();
    component.onFile(new File(['x'], 'orders.xls'));
    expect(component.file()).toBeNull();
    expect(errors[0]).toContain('.xlsx');
    expect(el.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('.xlsx');
  });

  /**
   * The Import card said "Start from the template" and the template sat in the Export card
   * (UI review tasks#19, jobs#15): the template is part of importing, so it lives there.
   */
  it('keeps the import template in the Import card', () => {
    const { el } = page();
    const [importCard, exportCard] = [...el.querySelectorAll('.card')] as HTMLElement[];
    expect(importCard.textContent).toContain('Import');
    expect([...importCard.querySelectorAll('button')].some(b => /template/i.test(b.textContent!))).toBe(true);
    expect([...exportCard.querySelectorAll('button')].some(b => /template/i.test(b.textContent!))).toBe(false);
  });

  /** The upload's only feedback is its bar; it is announced as a progress bar with a value. */
  it('exposes upload progress as a progressbar', () => {
    const upload = new Subject<unknown>();
    const { fixture, el, component } = page({ post: () => upload });
    component.onFile(new File(['x'], 'orders.xlsx'));
    component.upload();
    component.progress.set(40);
    fixture.detectChanges();
    const bar = el.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute('aria-valuenow')).toBe('40');
    expect(bar?.getAttribute('aria-valuemin')).toBe('0');
    expect(bar?.getAttribute('aria-valuemax')).toBe('100');
  });

  /**
   * A rejected sheet comes back as "Total 3 source jobs invalid." with each bad row's reason in
   * data. The card showed only the total, so nobody could tell which rows to fix.
   */
  describe('a rejected sheet', () => {
    const answer = (body: unknown) => ({ post: () => of({ type: HttpEventType.Response, body }) });
    const send = (http: Record<string, unknown>) => {
      const view = page(http);
      view.component.onFile(new File(['x'], 'jobs.xlsx'));
      view.component.upload();
      view.fixture.detectChanges();
      const items = () => [...view.el.querySelectorAll('.bulk-rows li')].map(li => li.textContent!.trim());
      return { ...view, items };
    };

    it('lists the reason for each row', () => {
      const { items, el } = send(answer({ status: 'ERROR', message: 'Total 2 source jobs invalid.',
        data: ['Row 3: Job name is required.\n', 'Row 7: Task 99 not found.\n'] }));
      expect(el.textContent).toContain('Total 2 source jobs invalid.');
      expect(items()).toEqual(['Row 3: Job name is required.', 'Row 7: Task 99 not found.']);
      expect(el.textContent).toContain('Copy all 2 reasons');
    });

    it('lists the first twenty and says how many more there are', () => {
      const data = Array.from({ length: 25 }, (_, i) => `Row ${i + 2}: bad.`);
      const { items, el } = send(answer({ status: 'ERROR', message: 'Total 25 source jobs invalid.', data }));
      expect(items()).toHaveLength(20);
      expect(el.textContent).toContain('and 5 more');
    });

    it('lists each of a row\'s reasons on its own line, and never shows a <br>', () => {
      const { items } = send(answer({ status: 'ERROR', message: 'Total 1 source jobs invalid.',
        data: ['Frequency must be one of [Daily] at row 4.\nStart Date is not valid at row 4.', 'Row 5 old.<br>Row 5 older.<br>'] }));
      expect(items()).toEqual(['Frequency must be one of [Daily] at row 4.', 'Start Date is not valid at row 4.', 'Row 5 old.', 'Row 5 older.']);
    });

    it('lists nothing for a sheet that went in', () => {
      const { el } = send(answer({ status: 'SUCCESS', message: 'Upload complete.', data: ['ignored'] }));
      expect(el.querySelector('.bulk-rows')).toBeNull();
    });

    it('says something the uploader can act on when the server fails outright', () => {
      const { el } = send({ post: () => throwError(() => ({ status: 500, error: { message: 'Some internal error occurred contact with support.' } })) });
      expect(el.textContent).toContain('The server could not read that file.');
      expect(el.textContent).not.toContain('Some internal error');
    });

    it('lists the reasons from a refusal too', () => {
      const { items } = send({ post: () => throwError(() => ({ status: 400, error: { message: 'Total 1 source task invalid.', data: ['Row 4: bad cron.'] } })) });
      expect(items()).toEqual(['Row 4: bad cron.']);
    });
  });
});

/**
 * Both downloads arrived as the server's "BatchDownload-<date>-<uuid>.xlsx", so the template and
 * the export could not be told apart in a downloads folder (UI review tasks#19).
 */
describe('Bulk download names', () => {
  const saved: string[] = [];
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.restoreAllMocks();
    saved.length = 0;
  });

  function download(which: 'template' | 'exportAll', disposition: string) {
    URL.createObjectURL = () => 'blob:x';
    URL.revokeObjectURL = () => {};
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { saved.push(this.download); });
    const { component } = page({ get: () => of({ body: new Blob(['x']),
      headers: new HttpHeaders({ 'content-disposition': disposition }) }) });
    component.download(which);
    return saved[0];
  }

  it('names the template and the export for what they are, not the server\'s generic name', () => {
    expect(download('template', 'attachment; filename=BatchDownload-2026-09-28-1a2b.xlsx')).toBe('pipelines-import-template.xlsx');
    saved.length = 0;
    expect(download('exportAll', 'attachment; filename=BatchDownload-2026-09-28-1a2b.xlsx'))
      .toBe(`pipelines-export-${localIsoDay(new Date())}.xlsx`);
  });

  it('keeps a name the server chose on purpose', () => {
    expect(download('exportAll', 'attachment; filename="tasks-export-2026-09-28.xlsx"')).toBe('tasks-export-2026-09-28.xlsx');
  });
});

/** Wave 4: the schedules sheet keeps its eleven columns, so a Cron row's Recurrence cell holds the expression. */
describe('Bulk schedules: the Cron row', () => {
  it('says where a Cron row keeps its expression', () => {
    const { fixture, el } = page();
    expect(el.textContent).not.toContain('Recurrence');
    fixture.componentRef.setInput('kind', 'job');
    fixture.detectChanges();
    const note = el.querySelector('[data-template-note]');
    expect(note?.textContent).toContain('Recurrence');
    expect(note?.textContent).toContain('0 3 * * *');
  });
});
