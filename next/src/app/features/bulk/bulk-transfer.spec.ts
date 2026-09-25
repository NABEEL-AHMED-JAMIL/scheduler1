import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { Subject, of, throwError } from 'rxjs';
import { HttpEventType } from '@angular/common/http';
import { BulkTransfer } from './bulk-transfer';
import { ToastService } from '../../shared/ui/toast.service';

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
    const back = [...el.querySelectorAll('a')].find(a => /Back to tasks/.test(a.textContent!));
    expect(back?.getAttribute('href')).toBe('/operations/tasks');
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

    it('lists nothing for a sheet that went in', () => {
      const { el } = send(answer({ status: 'SUCCESS', message: 'Upload complete.', data: ['ignored'] }));
      expect(el.querySelector('.bulk-rows')).toBeNull();
    });

    it('lists the reasons from a refusal too', () => {
      const { items } = send({ post: () => throwError(() => ({ status: 400, error: { message: 'Total 1 source task invalid.', data: ['Row 4: bad cron.'] } })) });
      expect(items()).toEqual(['Row 4: bad cron.']);
    });
  });
});
