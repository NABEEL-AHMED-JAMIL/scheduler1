import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { AuthService } from '../auth/auth.service';
import { API_BASE } from '../api/api.config';

export interface JobEvent {
  /**
   * Closed on purpose. The trailing `| string` this used to carry widened the whole union back
   * to `string`, so the compiler had nothing to check against: 'job.log' was declared here and
   * read nowhere, while the jobs table branched on a 'job.updated' this never mentioned, and
   * neither showed up as an error. A misspelt type is a branch that silently never runs, which
   * is exactly the failure the socket exists to avoid, so the set is spelled out and the
   * compiler is left able to say so.
   *
   * Only `job.status` reaches a client today. `job.log` is published by the server and consumed
   * nowhere here; `job.deleted`, `job.toggled` and `job.updated` are declared by
   * JobEventPublisher.publishChanged, which has **no callers anywhere in the backend** -- so the
   * branches for them in the jobs table are unreachable, and an edit, toggle or delete made in one
   * tab stays invisible in another until a manual refresh, on a screen that says it is live.
   *
   * They are kept in the union because that is the contract the server is expected to fill; the
   * fix is on the server (call publishChanged from add/update/toggle/delete in
   * SourceJobServiceImpl), and is planned in .ai/synthesis/source-jobs.md. Narrowing this type
   * catches a typo on THIS side only -- publishChanged takes a bare Java String with no shared
   * constant, so a misspelling there is still invisible to the compiler.
   */
  type: 'job.status' | 'job.log' | 'job.deleted' | 'job.toggled' | 'job.updated';
  jobId: number;
  jobQueueId?: number;
  jobRunningStatus?: string;
  message?: string;
  tenantId?: number;
  at?: string;
}

/**
 * The STOMP endpoint is registered as "/ws", but the app serves under a /api/v1 context
 * path, so it answers at /api/v1/ws. Stripping the context produced a 404 whose missing
 * CORS headers made the browser report it as a CORS failure instead.
 */
const WS_URL = `${API_BASE}/ws`;

/**
 * One STOMP connection for the whole app, feeding the screens that show job state.
 *
 * The packages for this were already in package.json and nothing imported them, so every
 * screen polled or reloaded wholesale instead. A tenant user joins its own tenant's feed; a
 * platform admin, who sees every tenant's jobs, joins the cross-tenant one. The server
 * refuses any subscription whose tenant does not match the token, so the destination chosen
 * here is a convenience rather than the security boundary.
 */
@Injectable({ providedIn: 'root' })
export class JobEventsService {
  private readonly auth = inject(AuthService);

  private client: Client | null = null;
  private subscription: StompSubscription | null = null;

  private readonly events$ = new Subject<JobEvent>();
  readonly events = this.events$.asObservable();

  readonly connected = signal(false);

  /** Which feed this user is entitled to; null when signed out. */
  private readonly destination = computed(() => {
    const user = this.auth.user();
    if (!user) return null;
    // The role comes from the token by way of AuthService rather than from the stored blob's
    // own userRole field. That field sits in localStorage where anything on the page can
    // rewrite it, and this was the last role decision left reading it -- typing PLATFORM_ADMIN
    // into devtools pointed the socket at the cross-tenant feed on a token the server refuses
    // it for, so the console simply stopped receiving events.
    return this.auth.isPlatformAdmin()
      ? '/topic/jobs.all'
      : `/topic/jobs.${user.tenantId}`;
  });

  /**
   * The two facts the socket actually follows, compared by value.
   *
   * The stored user is one object, rewritten whole for anything that changes about a person: a
   * rename, a new picture, the password debt being settled. Reading the token straight off it
   * inside the effect made every one of those tear the connection down and shake hands again,
   * losing whatever job events arrived in between. Same shape as AuthService.avatarSource, and
   * for the same reason.
   */
  private readonly session = computed(
    () => ({ destination: this.destination(), token: this.auth.user()?.accessToken ?? '' }),
    { equal: (a, b) => a.destination === b.destination && a.token === b.token });

  constructor() {
    // Follows the session: connects on sign-in, tears down on sign-out, and reconnects with
    // a fresh token when the interceptor refreshes one.
    effect(() => {
      const { destination, token } = this.session();
      this.disconnect();
      if (destination && token) this.connect(destination, token);
    });
  }

  private connect(destination: string, token: string): void {
    const client = new Client({
      webSocketFactory: () => new SockJS(WS_URL) as any,
      connectHeaders: { Authorization: `Bearer ${token}` },
      // A dropped socket should recover on its own; the screens using it show live data.
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => { /* the STOMP frame log is noise in the console */ },
    });

    client.onConnect = () => {
      this.connected.set(true);
      // The token rides on the SUBSCRIBE frame too: that is where the server checks the
      // destination's tenant against the caller.
      this.subscription = client.subscribe(destination, frame => {
        try {
          this.events$.next(JSON.parse(frame.body) as JobEvent);
        } catch {
          /* a frame that is not our JSON is not ours to act on */
        }
      }, { Authorization: `Bearer ${token}` });
    };

    client.onWebSocketClose = () => this.connected.set(false);
    client.onStompError = () => this.connected.set(false);

    client.activate();
    this.client = client;
  }

  private disconnect(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
    this.client?.deactivate();
    this.client = null;
    this.connected.set(false);
  }
}
