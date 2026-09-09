import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { KafkaConnections, KafkaProfile } from './kafka-connections';

/**
 * Whose profile a row is, and whose default it is.
 *
 * fetchAllProfiles hands a platform admin every workspace's profiles in one list, ordered newest
 * id first, and each row carries a tenantId and no name. Two things went wrong with that: the
 * screen showed six identically named rows with nothing saying which workspace each belonged to,
 * and isDefault -- which setAsDefault sets per workspace -- was read as though the first flagged
 * row in the list were the one default there is, so the tile credited whichever tenant had most
 * recently set one and the "nothing is default" warning stayed quiet while the platform itself
 * had none.
 */

const ACTING_ID = 9000;

function profile(over: Partial<KafkaProfile>): KafkaProfile {
  return {
    kafkaConnectionProfileId: 1,
    profileName: 'broker',
    bootstrapServers: 'broker:9092',
    securityProtocol: 'PLAINTEXT',
    status: 'Active',
    ...over,
  };
}

// The order fetchAllProfiles actually returns: newest id first, so a tenant's default comes before
// the platform's older one.
const PLATFORM_DEFAULT = profile({
  kafkaConnectionProfileId: 1009, profileName: 'Platform Local Broker', isDefault: true,
});
const GLOBEX_DEFAULT = profile({
  kafkaConnectionProfileId: 1088, tenantId: 1828, profileName: 'Globex Data PLAINTEXT', isDefault: true,
});
const DEMO_DEFAULT = profile({
  kafkaConnectionProfileId: 1249, tenantId: 2364, profileName: 'ETL Demo Broker', isDefault: true,
});

const TENANTS = [
  { tenantId: 1828, tenantName: 'Globex Data' },
  { tenantId: 2364, tenantName: 'ETL Demo' },
];

function screenFor(isPlatformAdmin: boolean, profiles: KafkaProfile[], tenants = TENANTS) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AuthService,
        useValue: {
          user: signal({ appUserId: ACTING_ID, username: 'me@example.com', userRole: 'PLATFORM_ADMIN' }),
          isPlatformAdmin: () => isPlatformAdmin,
        },
      },
      {
        provide: HttpClient,
        useValue: {
          get: (url: string) => of({
            status: 'SUCCESS', message: '',
            data: url.includes('listTenants') ? tenants : profiles,
          }),
        },
      },
      { provide: Dialog, useValue: {} },
      { provide: ToastService, useValue: { success: () => {}, error: () => {} } },
      { provide: ActivatedRoute, useValue: { queryParamMap: of({ get: () => null }) } },
      { provide: Router, useValue: { navigate: () => {} } },
    ],
  });
  const screen = TestBed.runInInjectionContext(() => new KafkaConnections());
  screen.ngOnInit();
  return screen;
}

describe('which default the Kafka screen reports', () => {
  it('credits the platform-owned profile, not the first tenant default in the list', () => {
    const screen = screenFor(true, [DEMO_DEFAULT, GLOBEX_DEFAULT, PLATFORM_DEFAULT]);
    expect(screen.defaultProfile()?.profileName).toBe('Platform Local Broker');
  });

  it('reports none when only tenants have set one, because clearDefault here clears the platform row', () => {
    const screen = screenFor(true, [DEMO_DEFAULT, GLOBEX_DEFAULT]);
    expect(screen.defaultProfile()).toBeNull();
  });

  it('stays the single flagged row for a tenant, whose list holds nothing but its own', () => {
    const screen = screenFor(false, [GLOBEX_DEFAULT]);
    expect(screen.defaultProfile()?.profileName).toBe('Globex Data PLAINTEXT');
  });
});

describe('whose profile a row is', () => {
  it('names the workspace from listTenants', () => {
    const screen = screenFor(true, [DEMO_DEFAULT, GLOBEX_DEFAULT, PLATFORM_DEFAULT]);
    expect(screen.workspaceName(GLOBEX_DEFAULT)).toBe('Globex Data');
    expect(screen.workspaceName(DEMO_DEFAULT)).toBe('ETL Demo');
  });

  it('marks a profile with no tenant as the platform fallback rather than a workspace', () => {
    const screen = screenFor(true, [PLATFORM_DEFAULT]);
    expect(screen.workspaceName(PLATFORM_DEFAULT)).toBe('Platform');
    expect(screen.workspaceHint(PLATFORM_DEFAULT)).toContain('Platform-owned');
  });

  it('falls back to the id rather than inventing a name listTenants did not give', () => {
    const orphan = profile({ kafkaConnectionProfileId: 1107, tenantId: 2104 });
    const screen = screenFor(true, [orphan], []);
    expect(screen.workspaceName(orphan)).toBe('Tenant 2104');
  });

  it('says which workspace a default pill belongs to', () => {
    const screen = screenFor(true, [DEMO_DEFAULT, GLOBEX_DEFAULT, PLATFORM_DEFAULT]);
    expect(screen.defaultHint(GLOBEX_DEFAULT)).toContain('Globex Data');
    expect(screen.defaultHint(PLATFORM_DEFAULT)).toContain('Platform default');
  });

  it('leaves the hint alone for a tenant, whose rows are all its own', () => {
    const screen = screenFor(false, [GLOBEX_DEFAULT]);
    expect(screen.defaultHint(GLOBEX_DEFAULT)).toBe('Used by tasks with no explicit profile');
  });

  it('lets a platform admin search by workspace, which is the only thing telling the rows apart', () => {
    // Neither name carries its workspace, which is the case the column exists for.
    const globex = profile({ kafkaConnectionProfileId: 1089, tenantId: 1828, profileName: 'prod-cluster' });
    const demo = profile({ kafkaConnectionProfileId: 1249, tenantId: 2364, profileName: 'staging-cluster' });
    const screen = screenFor(true, [globex, demo]);

    screen.search.set('globex');
    expect(screen.filtered().map(p => p.kafkaConnectionProfileId)).toEqual([1089]);
  });

  it('does not match a tenant on a workspace name it is not shown', () => {
    const globex = profile({ kafkaConnectionProfileId: 1089, tenantId: 1828, profileName: 'prod-cluster' });
    const screen = screenFor(false, [globex]);

    screen.search.set('globex');
    expect(screen.filtered()).toEqual([]);
  });
});
