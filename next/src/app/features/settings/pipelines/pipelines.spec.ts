import { describe, it, expect, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { Pipelines } from './pipelines';

/**
 * The screen, its buttons and its dialog say "pipeline"; its confirm and error messages still
 * said "form" from before the rename, so deleting a pipeline asked you to "Delete form".
 */
function screenWith(del: () => Observable<any>, list: () => Observable<any> = () => of({ status: 'SUCCESS', data: { rows: [] } })) {
  const opened: any[] = [];
  const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() };
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      { provide: HttpClient, useValue: { get: list, delete: del } },
      { provide: Dialog, useValue: { open: (_: unknown, config: any) => { opened.push(config.data); return { closed: of(true) }; } } },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: { isPlatformAdmin: () => false, user: () => null } },
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new Pipelines());
  return { screen, opened, toast };
}

describe('Pipelines -- names the thing it deletes', () => {
  it('asks to "Delete pipeline"', async () => {
    const { screen, opened } = screenWith(() => of({ status: 'SUCCESS', message: 'Deleted.' }));
    await screen.remove({ pipelineKey: 7, pipelineId: 'F7', pipelineName: 'Claims loader' } as any);
    expect(opened[0].confirmLabel).toBe('Delete pipeline');
    expect(opened[0].danger).toBe(true);
  });

  it('says the pipeline, not a form, could not be deleted', async () => {
    const { screen, toast } = screenWith(() => new Observable(sub => sub.error({ error: {} })));
    await screen.remove({ pipelineKey: 7, pipelineId: 'F7', pipelineName: 'Claims loader' } as any);
    expect(toast.error).toHaveBeenCalledWith('The pipeline could not be deleted.');
  });

  it('says the pipelines could not be loaded', () => {
    const { screen } = screenWith(() => of({}), () => new Observable(sub => sub.error({ error: {} })));
    screen.load();
    expect(screen.error()).toBe('Could not load pipelines.');
  });
});
