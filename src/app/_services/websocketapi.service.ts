import { Injectable } from "@angular/core";
import * as Stomp from 'stompjs';
import * as SockJS from 'sockjs-client';
import { WebSocketShareService } from './websocketshare.service';


/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class WebSocketAPI {

    public stompClient: any;

    constructor(private websocketShare: WebSocketShareService) { }

    public connect(): any {
        let ws = new SockJS(`${config.webSocketUrl}`);
        this.stompClient = Stomp.over(ws);
        const _this = this;
        _this.stompClient.connect({},
            function (frame) {
                _this.stompClient.subscribe("/user/" + `${config.sessionId}` + "-" + `${config.transactionId}` + "/reply",
                    function (sdkEvent) {
                        _this.onMessageReceived(sdkEvent);
                    });
            }, this.errorCallBack);
    };

    public disconnect(): any {
        if (this.stompClient !== null) {
            this.stompClient.disconnect();
        }
        console.log("Disconnected");
    }

    // on error, schedule a reconnection attempt
    public errorCallBack(error: any): any {
        console.log("errorCallBack -> " + error)
        setTimeout(() => {
            this.connect();
        }, 5000);
    }

    public onMessageReceived(message: any): any {
        console.log("Message Recieved from Server :: " + message);
        this.websocketShare.onNewValueReceive(message.body);
    }

}