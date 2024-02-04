import { Injectable, OnDestroy } from "@angular/core";
import { Observable, BehaviorSubject } from "rxjs";


@Injectable({
    providedIn: 'root'
})
export class WebSocketShareService implements OnDestroy {

    private notifactionDataSubject = new BehaviorSubject<any>(undefined);

    constructor() { }
    
    public onNewValueReceive(msg: any) {        
        this.notifactionDataSubject.next(msg);
    }

    public getNewValue(): Observable<any> {
        return this.notifactionDataSubject.asObservable();
    }

    public ngOnDestroy(): void {
        this.notifactionDataSubject.unsubscribe();
    }
}