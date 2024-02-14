import { Injectable } from "@angular/core";
import * as Stomp from 'stompjs';
import * as SockJS from 'sockjs-client';
import { WebSocketShareService } from './websocketshare.service';


@Injectable({
    providedIn: 'root'
})
export class WebSocketAPI {

    public sessionId: string = '0hw0dz34';
    public transactionId: string = '40ef-dd1d-bd9f-1d7f';

    public webSocketEndPoint: string = 'http://localhost:9098/api/v1/ws';
    public stompClient: any;

    constructor(private websocketShare: WebSocketShareService) { }

    public connect(): any {
        let ws = new SockJS(this.webSocketEndPoint);
        this.stompClient = Stomp.over(ws);
        const _this = this;
        _this.stompClient.connect({}, function (frame) {
            _this.stompClient.subscribe("/user/"+_this.sessionId+"-"+_this.transactionId+"/reply", 
            function (sdkEvent) {
                _this.onMessageReceived(sdkEvent);
            });
            _this.register(_this.sessionId, _this.transactionId);
        }, this.errorCallBack);
    };

    public disconnect(): any {
        if (this.stompClient !== null) {
            this.unregister(this.sessionId, this.transactionId);
            this.stompClient.disconnect();
        }
    }

    // on error, schedule a reconnection attempt
    public errorCallBack(error: any): any {
        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    /**
     * Send message to sever via web socket
     * @param {*} message 
     */
    public register(sessionId: any, transactionId: any): any {
        var message = {
            "sessionId" : sessionId,
            "transactionId" : transactionId
        };
        this.stompClient.send("/api/v1/register", {}, JSON.stringify(message));
    }

    public unregister(sessionId: any, transactionId: any): any {
        var message = {
            "sessionId" : sessionId,
            "transactionId" : transactionId
        };
        this.stompClient.send("/api/v1/unregister", {}, JSON.stringify(message));
    }

    public onMessageReceived(message: any): any {
        this.websocketShare.onNewValueReceive(message.body);
    }


    public guid(): string {
        return this.s4() + '-' + this.s4() + '-' + this.s4();
    }
    

    public s4(): any {
        return Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    }

}