import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiCollectionsApi } from './api-collections.service';
import { API_BASE } from '../../../core/api/api.config';

const BASE = `${API_BASE}/apiCollection.json`;

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
  return { api: TestBed.inject(ApiCollectionsApi), http: TestBed.inject(HttpTestingController) };
}

describe('ApiCollectionsApi: the workspace a platform administrator picked', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('names it as ?tenantId= on every read and write', () => {
    const { api, http } = setup();
    api.list('', 1, 50, 2960).subscribe();
    api.get(7, 2960).subscribe();
    api.usage(7, 2960).subscribe();
    api.getRequest(8, 2960).subscribe();
    api.sample(8, 2960).subscribe();
    api.saveCollection({ name: 'x' }, 2960).subscribe();
    api.saveRequest({ name: 'y' }, 2960).subscribe();
    api.setEnabled(8, false, 2960).subscribe();
    api.deleteRequest(8, 2960).subscribe();
    api.test({ requestId: 8 }, 2960).subscribe();
    api.saveEnvironment({ collectionId: 7, name: 'Prod', isDefault: true, variables: [] }, 2960).subscribe();
    api.deleteEnvironment(9, 2960).subscribe();
    api.deleteCollection(7, 2960).subscribe();
    api.import({ format: 'BRUNO', files: [] }, 2960).subscribe();
    const asked = http.match(() => true);
    expect(asked.map(r => `${r.request.method} ${r.request.urlWithParams.replace(BASE, '')}`)).toEqual([
      'GET /list?page=1&limit=50&tenantId=2960', 'GET /get?collectionId=7&tenantId=2960', 'GET /usage?collectionId=7&tenantId=2960',
      'GET /request/get?requestId=8&tenantId=2960', 'GET /request/sample?requestId=8&tenantId=2960', 'POST /save?tenantId=2960',
      'POST /request/save?tenantId=2960', 'PUT /request/setEnabled?requestId=8&enabled=false&tenantId=2960',
      'DELETE /request/delete?requestId=8&tenantId=2960', 'POST /request/test?tenantId=2960', 'POST /environment/save?tenantId=2960',
      'DELETE /environment/delete?environmentId=9&tenantId=2960', 'DELETE /delete?collectionId=7&tenantId=2960', 'POST /import?tenantId=2960',
    ]);
    expect(asked[5].request.body).toEqual({ name: 'x' });
    asked.forEach(r => r.flush({ status: 'SUCCESS', message: '' }));
  });

  it('names none for a workspace\'s people', () => {
    const { api, http } = setup();
    api.list('clinic', 1, 50).subscribe();
    api.get(7, null).subscribe();
    api.saveCollection({ name: 'x' }).subscribe();
    const asked = http.match(() => true);
    expect(asked.map(r => r.request.urlWithParams.replace(BASE, ''))).toEqual(['/list?page=1&limit=50&search=clinic', '/get?collectionId=7', '/save']);
    asked.forEach(r => r.flush({ status: 'SUCCESS', message: '' }));
  });
});
