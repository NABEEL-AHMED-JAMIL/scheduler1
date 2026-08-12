import { Injectable } from "@angular/core";
import * as Stomp from 'stompjs';
import * as SockJS from 'sockjs-client';
import { WebSocketShareService } from './websocketshare.service';
import { AuthService } from './auth.service';

/**
 * Connects to the backend's STOMP/SockJS endpoint and subscribes to this user's own
 * notification queue -- "own" because the CONNECT frame carries the same JWT used for regular
 * REST calls (see StompAuthChannelInterceptor server-side), which the server uses to set the
 * session's Principal to the real logged-in username. /user/queue/reply is Spring's per-user
 * destination convention: the broker rewrites it per-session based on that Principal, so this
 * subscription only ever receives messages the server explicitly sent to this user (via
 * convertAndSendToUser) -- not a fixed shared channel every browser tab used to receive
 * identically regardless of who was actually logged in.
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class WebSocketAPI {

    public stompClient: any;
    private connecting = false;

    constructor(private websocketShare: WebSocketShareService,
        private authService: AuthService) { }

    public connect(): any {
        // No point opening a socket for nobody to receive on -- and no JWT means the server
        // would just leave the session unauthenticated (no Principal), so nothing sent to it
        // would ever be delivered anyway.
        if (!this.authService.isLoggedIn() || this.connecting) {
            return;
        }
        this.connecting = true;
        let ws = new SockJS(`${config.webSocketUrl}`);
        this.stompClient = Stomp.over(ws);
        const _this = this;
        const connectHeaders = { Authorization: 'Bearer ' + this.authService.accessToken };
        _this.stompClient.connect(connectHeaders, function (frame) {
            _this.connecting = false;
            _this.stompClient.subscribe('/user/queue/reply', function (sdkEvent) {
                _this.onMessageReceived(sdkEvent);
            });
        }, function (error) {
            _this.connecting = false;
            _this.errorCallBack(error);
        });
    };

    public disconnect(): any {
        if (this.stompClient !== null && this.stompClient) {
            this.stompClient.disconnect();
        }
        console.log("Disconnected");
    }

    // on error, schedule a reconnection attempt -- only while still logged in, so a session
    // that logged out doesn't keep quietly retrying forever in the background.
    public errorCallBack(error: any): any {
        console.log("errorCallBack -> " + error)
        setTimeout(() => {
            if (this.authService.isLoggedIn()) {
                this.connect();
            }
        }, 5000);
    }

    public onMessageReceived(message: any): any {
        console.log("Message Recieved from Server :: " + message);
        this.websocketShare.onNewValueReceive(message.body);
    }

}
