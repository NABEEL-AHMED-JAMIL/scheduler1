import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';


@Injectable({
    providedIn: 'root'
})
export class DataShareService {

    private topHeader$ = new BehaviorSubject<any>({});
    public selectedTopHeader$ = this.topHeader$.asObservable();

    constructor() { }

    public setTopHeader(topHeader: any) {
        this.topHeader$.next(topHeader);
    }

}