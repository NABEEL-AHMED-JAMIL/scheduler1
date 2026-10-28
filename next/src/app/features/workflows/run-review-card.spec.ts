import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { StorageService } from '../objects/storage.service';
import { RunReviewCard, fieldLabel, imageKeyOf, reviewFields } from './run-review-card';

describe('Run review card (owner 2026-10-20)', () => {
  const row = {
    image_id: 'breast-us-011', key: 'intake/2026/10/19/x-breast-us-011.png', image_key: 'datasets/breast-ultrasound/images/breast-us-011.png',
    mask_key: 'datasets/breast-ultrasound/masks/breast-us-011-mask.png', true_label: 'benign', finding: 'suspicious for malignancy',
    match: 'no', urgency: 'review first', confidence: 'medium', description: 'An irregular hypoechoic mass.', status: 'DRAFT', lesion_area_pct: '8.61',
  };

  it('names fields the way a person reads them', () => {
    expect(fieldLabel('predicted_label')).toBe('Predicted label');
    expect(fieldLabel('imageQuality')).toBe('Image quality');
  });

  it('shows the image a field names, not its mask nor the inbox copy when there is a better one', () => {
    expect(imageKeyOf(row)).toBe('datasets/breast-ultrasound/images/breast-us-011.png');
    expect(imageKeyOf({ scan: 'a/b/xray-001.jpg', mask_key: 'a/m.png' })).toBe('a/b/xray-001.jpg');
    expect(imageKeyOf({ key: 'intake/x.png' })).toBe('intake/x.png');
    expect(imageKeyOf({ finding: 'normal' })).toBeNull();
  });

  it('puts the finding, the truth, the match and the urgency first, and the description apart', () => {
    const f = reviewFields(row);
    expect(f.first.map(x => x.label)).toEqual(['Finding', 'True label', 'Match', 'Urgency', 'Confidence', 'Status']);
    expect(f.text).toEqual({ label: 'Description', value: 'An irregular hypoechoic mass.' });
    expect(f.rest.map(x => x.label)).toContain('Lesion area pct');
    expect(f.rest.map(x => x.label)).not.toContain('Finding');
  });
});

describe('Run review card -- loading, empty, error (owner 2026-10-27)', () => {
  function mount() {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), provideHttpClient(), provideHttpClientTesting(),
        { provide: StorageService, useValue: { download: () => of(new Blob(['png'], { type: 'image/png' })) } }],
    });
    const http = TestBed.inject(HttpTestingController);
    const f = TestBed.createComponent(RunReviewCard);
    f.componentRef.setInput('jobQueueId', 1019);
    f.componentRef.setInput('link', '/pipelines/schedules/1006/runs/1019');
    f.detectChanges();
    return { f, http, el: f.nativeElement as HTMLElement };
  }

  it('is loading until the run answers', () => {
    const { f, el } = mount();
    expect(f.componentInstance.loading()).toBe(true);
    expect(el.querySelector('app-loading')).not.toBeNull();
    expect(el.querySelector('[data-test="run-review-none"]')).toBeNull();
  });

  it('says the run kept nothing to show, rather than drawing nothing', () => {
    const { f, http, el } = mount();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs')).flush({ status: 'SUCCESS', data: { outputs: [] } });
    f.detectChanges();
    expect(f.componentInstance.loading()).toBe(false);
    expect(el.querySelector('[data-test="run-review-none"]')?.textContent).toContain('no result or PDF');
  });

  it('says the result could not be read, with Try again, and reads it again', () => {
    const { f, http, el } = mount();
    http.expectOne(r => r.url.endsWith('/sourceJob.json/runOutputs')).flush({}, { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(f.componentInstance.loadError()).toBe('What the run made could not be read.');
    expect(el.querySelector('[data-test="run-review-error"]')?.textContent).toContain('Try again');
    f.componentInstance.retry();
    expect(http.match(r => r.url.endsWith('/sourceJob.json/runOutputs')).length).toBe(1);
  });
});
