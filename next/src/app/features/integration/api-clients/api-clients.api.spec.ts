import { describe, it, expect, afterEach } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiClientsApi } from './api-clients.api';
import { API_BASE } from '../../../core/api/api.config';

function setup() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()] });
  return { api: TestBed.inject(ApiClientsApi), http: TestBed.inject(HttpTestingController) };
}

describe('ApiClientsApi: the workspace a platform administrator picked', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('names it on every read of the page, as ?tenantId=', () => {
    const { api, http } = setup();
    api.list(2960).subscribe();
    api.limits(2960).subscribe();
    api.history('cl_x', false, 2960).subscribe();
    api.sandbox(2960).subscribe();
    api.sandboxList(2960).subscribe();
    api.routesList(2960).subscribe();
    api.routeTargets(2960).subscribe();
    api.webhookList(2960).subscribe();
    api.deliveries('7', null, 50, 2960).subscribe();
    api.attempts('7', '9', 2960).subscribe();
    const asked = http.match(() => true);
    expect(asked.map(r => r.request.urlWithParams)).toEqual([
      `${API_BASE}/apiClient.json/list?tenantId=2960`,
      `${API_BASE}/apiClient.json/limits?tenantId=2960`,
      `${API_BASE}/apiClient.json/history?clientId=cl_x&tenantId=2960`,
      `${API_BASE}/apiClient.json/sandbox?tenantId=2960`,
      `${API_BASE}/apiClient.json/list?sandbox=true&tenantId=2960`,
      `${API_BASE}/eventRoute.json/list?tenantId=2960`,
      `${API_BASE}/eventRoute.json/targets?tenantId=2960`,
      `${API_BASE}/webhook.json/list?tenantId=2960`,
      `${API_BASE}/webhook.json/deliveries?webhookId=7&limit=50&tenantId=2960`,
      `${API_BASE}/webhook.json/attempts?webhookId=7&deliveryId=9&tenantId=2960`,
    ]);
    asked.forEach(r => r.flush({ status: 'SUCCESS', message: '' }));
  });

  it('names it in the body of every write', () => {
    const { api, http } = setup();
    api.create({ name: 'Portal' }, 2960).subscribe();
    api.update({ clientId: 'cl_x', name: 'Portal' }, 2960).subscribe();
    api.rotateSecret('cl_x', false, 2960).subscribe();
    api.revoke('cl_test_x', true, 2960).subscribe();
    api.saveRoute({ eventType: 'a.b', targetKind: 'PIPELINE', jobId: 4, active: true }, 2960).subscribe();
    api.deleteRoute(5, 2960).subscribe();
    api.createWebhook({ url: 'https://x.example', eventTypes: ['run.failed'] }, 2960).subscribe();
    api.deleteWebhook('7', 2960).subscribe();
    const sent = http.match(() => true);
    expect(sent.map(r => r.request.body.tenantId)).toEqual(Array(8).fill(2960));
    expect(sent[3].request.body).toEqual({ clientId: 'cl_test_x', sandbox: true, tenantId: 2960 });
    expect(sent[5].request.body).toEqual({ routeId: 5, tenantId: 2960 });
    sent.forEach(r => r.flush({ status: 'SUCCESS', message: '' }));
  });

  it('a workspace administrator\'s calls name no workspace: theirs is always their own', () => {
    const { api, http } = setup();
    api.list(null).subscribe();
    api.routesList(null).subscribe();
    api.webhookList().subscribe();
    api.deleteRoute(5, null).subscribe();
    api.rotateSecret('cl_x', false, null).subscribe();
    const asked = http.match(() => true);
    expect(asked.slice(0, 3).map(r => r.request.urlWithParams)).toEqual([
      `${API_BASE}/apiClient.json/list`, `${API_BASE}/eventRoute.json/list`, `${API_BASE}/webhook.json/list`]);
    expect(asked[3].request.body).toEqual({ routeId: 5 });
    expect(asked[4].request.body).toEqual({ clientId: 'cl_x' });
    asked.forEach(r => r.flush({ status: 'SUCCESS', message: '' }));
  });
});
