import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { ApiResponse, ApiCode, AppNotification } from '@/_models';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';
import { WebSocketAPI } from './websocketapi.service';
import { WebSocketShareService } from './websocketshare.service';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class NotificationService implements OnDestroy {

    private unreadCountSubject = new BehaviorSubject<number>(0);
    private recentSubject = new BehaviorSubject<AppNotification[]>([]);

    private wsSubscription: Subscription;

    private static readonly MAX_RECENT = 12;

    constructor(private http: HttpClient,
        private router: Router,
        private webSocketAPI: WebSocketAPI,
        private webSocketShareService: WebSocketShareService,
        private authService: AuthService) {
        this.wsSubscription = this.webSocketShareService.getNewNotification()
            .subscribe({
                next: (data) => {
                    if (data) {
                        this.handleLivePush(data);
                    }
                }
            });
    }

    public get unreadCount$(): Observable<number> {
        return this.unreadCountSubject.asObservable();
    }

    public get recent$(): Observable<AppNotification[]> {
        return this.recentSubject.asObservable();
    }

    public connectLive(): void {
        if (!this.authService.isLoggedIn()) {
            return;
        }
        this.webSocketAPI.connect();
    }

    public disconnectLive(): void {
        this.webSocketAPI.disconnect();
        this.unreadCountSubject.next(0);
        this.recentSubject.next([]);
    }

    public refreshUnreadCount(): void {
        this.unreadCount().subscribe({
            next: (response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.unreadCountSubject.next(Number(response.data) || 0);
                }
            }
        });
    }

    public loadRecent(): void {
        this.list(false, 1, NotificationService.MAX_RECENT).subscribe({
            next: (response) => {
                if (response.status === ApiCode.SUCCESS) {
                    this.recentSubject.next(response.data || []);
                }
            }
        });
    }

    public list(unreadOnly?: boolean, page?: number, limit?: number): Observable<ApiResponse> {
        let params: any = {};
        if (unreadOnly) {
            params.unreadOnly = true;
        }
        if (page) {
            params.page = page;
        }
        if (limit) {
            params.limit = limit;
        }
        return this.http.get<ApiResponse>(`${config.apiUrl}/notification.json/list`, { params });
    }

    public unreadCount(): Observable<ApiResponse> {
        return this.http.get<ApiResponse>(`${config.apiUrl}/notification.json/unreadCount`);
    }

    public markRead(notificationId: number): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/notification.json/markRead/${notificationId}`, {});
    }

    public markAllRead(): Observable<ApiResponse> {
        return this.http.post<ApiResponse>(`${config.apiUrl}/notification.json/markAllRead`, {});
    }

    public markReadLocally(notificationId: number): void {
        const current = this.recentSubject.value;
        const updated = current.map((notification) =>
            notification.notificationId === notificationId ? { ...notification, read: true } : notification);
        this.recentSubject.next(updated);
        const unread = this.unreadCountSubject.value;
        if (unread > 0) {
            this.unreadCountSubject.next(unread - 1);
        }
    }

    public markAllReadLocally(): void {
        const current = this.recentSubject.value;
        this.recentSubject.next(current.map((notification) => ({ ...notification, read: true })));
        this.unreadCountSubject.next(0);
    }

    public open(notification: AppNotification): void {
        if (!notification.read) {
            this.markRead(notification.notificationId).subscribe();
            this.markReadLocally(notification.notificationId);
            notification.read = true;
        }
        if (notification.linkUrl) {
            this.router.navigateByUrl(notification.linkUrl);
        }
    }

    public iconClass(notification: AppNotification): string {
        switch (notification.severity) {
            case 'SUCCESS': return 'ok';
            case 'ERROR': return 'err';
            case 'WARNING': return 'warn';
            default: return notification.type === 'TASK_ASSIGNED' ? 'task' : 'info';
        }
    }

    public timeAgo(dateCreated: string): string {
        if (!dateCreated) {
            return '';
        }
        const then = new Date(dateCreated).getTime();
        const diffMs = Date.now() - then;
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) {
            return 'Just now';
        }
        if (diffMin < 60) {
            return `${diffMin}m ago`;
        }
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) {
            return `${diffHr}h ago`;
        }
        const diffDay = Math.floor(diffHr / 24);
        if (diffDay === 1) {
            return 'Yesterday';
        }
        if (diffDay < 7) {
            return `${diffDay}d ago`;
        }
        const date = new Date(dateCreated);
        return `${date.toLocaleString('en-US', { month: 'short' })} ${date.getDate()}`;
    }

    private handleLivePush(raw: any): void {
        try {
            const payload = JSON.parse(raw);
            const notification: AppNotification = payload.notification;
            if (notification) {
                const current = this.recentSubject.value;
                this.recentSubject.next([notification, ...current].slice(0, NotificationService.MAX_RECENT));
            }
            if (payload.unreadCount !== undefined && payload.unreadCount !== null) {
                this.unreadCountSubject.next(Number(payload.unreadCount));
            }
        } catch (e) {
            console.log('NotificationService: failed to parse live push -- ' + e);
        }
    }

    public ngOnDestroy(): void {
        if (this.wsSubscription) {
            this.wsSubscription.unsubscribe();
        }
    }

}
