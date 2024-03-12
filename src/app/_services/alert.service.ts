import { Injectable } from '@angular/core';
import { ToastrService } from 'ngx-toastr';


@Injectable({
    providedIn: 'root'
})
export class AlertService {

    constructor(private toastr: ToastrService) { }

    public showSuccess(message: any, title: any): any {
        this.toastr.success(message, title,
            {
                timeOut: 500
            });
    }

    public showError(message: any, title: any): any {
        this.toastr.error(message, title,
            {
                timeOut: 500
            });
    }

    public showInfo(message: any, title: any): any {
        this.toastr.info(message, title,
            {
                timeOut: 500
            });
    }

    public showWarning(message: any, title: any): any {
        this.toastr.warning(message, title,
            {
                timeOut: 500
            });
    }
}