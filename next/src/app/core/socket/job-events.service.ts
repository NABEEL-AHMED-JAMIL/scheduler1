import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { Client, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { AuthService } from '../auth/auth.service';
import { API_BASE } from '../api/api.config';

export interface JobEvent {
  type: 'job.status' | 'job.log' | 'job.deleted' | 'job.toggled' | string;
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
    return user.userRole === 'PLATFORM_ADMIN'
      ? '/topic/jobs.all'
      : `/topic/jobs.${user.tenantId}`;
  });

  constructor() {
    // Follows the session: connects on sign-in, tears down on sign-out, and reconnects with
    // a fresh token when the interceptor refreshes one.
    effect(() => {
      const target = this.destination();
      const token = this.auth.user()?.accessToken;
      this.disconnect();
      if (target && token) this.connect(target, token);
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
