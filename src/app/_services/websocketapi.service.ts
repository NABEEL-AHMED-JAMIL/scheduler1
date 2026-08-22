import { Injectable } from "@angular/core";
import * as Stomp from 'stompjs';
import * as SockJS from 'sockjs-client';
import { WebSocketShareService } from './websocketshare.service';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class WebSocketAPI {

    public stompClient: any;
    private connecting = false;

    constructor(private websocketShare: WebSocketShareService,
        private authService: AuthService) { }

    public connect(): any {

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
            _this.stompClient.subscribe('/user/queue/notifications', function (sdkEvent) {
                _this.websocketShare.onNewNotificationReceive(sdkEvent.body);
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
