import { describe, it, expect } from 'vitest';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/ui/toast.service';
import { KafkaConnections, KafkaProfile } from './kafka-connections';

/**
 * Whose profile a row is, and whose default it is.
 *
 * fetchAllProfiles hands a platform administrator every workspace's profiles in one list, ordered newest
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
          get: (url: string) => url.includes('testTopic')
            // What the server says of a topic nobody consumes: a pass, with a warning in it.
            ? of({ status: 'SUCCESS', message: 'Topic "x" is reachable -- 1 partition(s) -- but no consumer is reading it right now. A run dispatched to it will wait until a worker subscribes.' })
            : of({
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

  it('lets a platform administrator search by workspace, which is the only thing telling the rows apart', () => {
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

// ---- environments -------------------------------------------------------------------------

import { KAFKA_ENVIRONMENTS, kafkaEnvironment } from './kafka-environment';

describe('kafkaEnvironment', () => {
  it('resolves the five listed keys whatever their case or padding', () => {
    for (const e of KAFKA_ENVIRONMENTS) {
      expect(kafkaEnvironment(e.key)!.tone).toBe(e.tone);
      expect(kafkaEnvironment(`  ${e.key.toUpperCase()} `)!.key).toBe(e.key);
    }
  });

  it('draws production, and only production, as critical', () => {
    expect(kafkaEnvironment('prod')!.tone).toBe('crit');
    expect(KAFKA_ENVIRONMENTS.filter(e => e.tone === 'crit').map(e => e.key)).toEqual(['prod']);
  });

  it('keeps an older free-text label visible as a neutral chip rather than dropping it', () => {
    const legacy = kafkaEnvironment('Staging EU');
    expect(legacy).toEqual(expect.objectContaining({ key: 'staging eu', label: 'Staging EU', tone: 'neutral' }));
  });

  it('is nothing for an empty label', () => {
    expect(kafkaEnvironment('')).toBeNull();
    expect(kafkaEnvironment('   ')).toBeNull();
    expect(kafkaEnvironment(undefined)).toBeNull();
  });
});

describe('the topic test', () => {
  it('shows a reachable topic that nobody reads as a warning, not a tick', () => {
    const screen = screenFor(false, [GLOBEX_DEFAULT]);
    screen.testTopic(GLOBEX_DEFAULT as any, { sourceTaskTypeId: 42, serviceName: 'Claims', queueTopicPartition: 'topic=x&partitions=[*]' } as any);
    const result = screen.topicTests()[42];
    expect(result.ok).toBe(true);
    expect(result.unread).toBe(true);
    expect(result.message).toContain('no consumer is reading');
  });
});

describe('when the topics cannot be read', () => {
  function screenWithTopics(answer: 'refused' | 'failed') {
    const screen = screenFor(false, [GLOBEX_DEFAULT]);
    const http = TestBed.inject(HttpClient) as any;
    const original = http.get;
    http.get = (url: string, options?: any) => url.includes('topicsForProfile')
      ? (answer === 'refused'
          ? of({ status: 'ERROR', message: 'Topics are not available right now.' })
          : new Observable(sub => sub.error({ error: {} })))
      : original(url, options);
    screen.selectedId.set(GLOBEX_DEFAULT.kafkaConnectionProfileId);
    screen.loadTopics();
    return screen;
  }

  it('says so, rather than presenting a failed load as a profile with no topics', () => {
    const screen = screenWithTopics('refused');
    expect(screen.topicsError()).toBe('Topics are not available right now.');
    expect(screen.topicsHere()).toEqual([]);
  });

  it('says so when the request itself fails', () => {
    const screen = screenWithTopics('failed');
    expect(screen.topicsError()).toBe('The topics could not be loaded.');
  });

  it('clears the error once a retry succeeds', () => {
    const screen = screenWithTopics('refused');
    (TestBed.inject(HttpClient) as any).get = () => of({ status: 'SUCCESS', message: '', data: [] });
    screen.loadTopics();
    expect(screen.topicsError()).toBe('');
  });
});

/**
 * A workspace with no Kafka profile of its own is shown the platform default its runs go through,
 * read-only and without its brokers (fetchAllProfiles, 2026-09-24). The server refuses every write
 * and probe on it; the screen does not offer them.
 */
describe('the platform default, as a workspace with no Kafka of its own sees it', () => {
  const SHOWN = { kafkaConnectionProfileId: 1009, profileName: 'Platform Local Broker [PF]', environmentLabel: 'local',
    securityProtocol: 'PLAINTEXT', status: 'Active', isDefault: true, platform: true, readOnly: true,
    connectionStatus: 'SUCCESS' } as KafkaProfile;

  function tenantScreen(calls: { url: string; options?: any }[] = [], opened: any[] = []) {
    const screen = screenFor(false, [SHOWN]);
    const http = TestBed.inject(HttpClient) as any;
    const original = http.get;
    http.get = (url: string, options?: any) => { calls.push({ url, options }); return original(url, options); };
    (screen as any).dialog.open = (component: any, config: any) => { opened.push(config); return { closed: of(false) }; };
    return screen;
  }

  it('offers no edit, test, default or delete on it', () => {
    const screen = tenantScreen();
    expect(screen.canManage(SHOWN)).toBe(false);
    expect(screen.canManage(GLOBEX_DEFAULT)).toBe(true);
  });

  it('names it as the platform default and says the brokers are the platform\'s', () => {
    const screen = tenantScreen();
    expect(screen.displayName(SHOWN)).toBe('Platform Local Broker [PF] (platform default)');
    expect(screen.brokersText(SHOWN)).toBe('Managed by the platform');
    // Read-only decides it, not whether the server happened to leave the field out.
    expect(screen.brokersText({ ...SHOWN, bootstrapServers: 'platform-kafka:9092' })).toBe('Managed by the platform');
    expect(screen.brokersText(GLOBEX_DEFAULT)).toBe('broker:9092');
  });

  it('is the default the tiles report, but not one of the workspace\'s own profiles', () => {
    const screen = tenantScreen();
    expect(screen.defaultProfile()?.kafkaConnectionProfileId).toBe(1009);
    expect(screen.summary().total).toBe(0);
    expect(screen.summary().testedOk).toBe(0);
  });

  it('tests a topic on it by resolving the caller\'s connection, not by naming the platform\'s', () => {
    const calls: { url: string; options?: any }[] = [];
    const screen = tenantScreen(calls);
    screen.testTopic(SHOWN, { sourceTaskTypeId: 42, serviceName: 'Claims', queueTopicPartition: 'topic=x&partitions=[*]' } as any);
    const call = calls.find(c => c.url.includes('testTopic'))!;
    expect(call.options.params).toEqual({ topicName: 'x' });

    screen.testTopic(GLOBEX_DEFAULT, { sourceTaskTypeId: 43, serviceName: 'Audit', queueTopicPartition: 'topic=y&partitions=[*]' } as any);
    expect(calls.filter(c => c.url.includes('testTopic'))[1].options.params)
      .toEqual({ topicName: 'y', kafkaConnectionProfileId: String(GLOBEX_DEFAULT.kafkaConnectionProfileId) });
  });

  it('adds a topic under it unrouted, so the topic follows the workspace to its own Kafka later', () => {
    const opened: any[] = [];
    const screen = tenantScreen([], opened);
    screen.addTopic(SHOWN);
    expect(opened[0].data.defaultProfileId).toBeNull();
    expect(opened[0].data.profileName).toBe('Platform Local Broker [PF] (platform default)');
  });
});
