import { Injectable } from '@angular/core';
import { IndividualConfig, ToastrService } from 'ngx-toastr';


/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class AlertService {

    constructor(private toastr: ToastrService) { }

    private formatMessage(message: any): string {
        if (message == null) {
            return '';
        }

        if (typeof message === 'string') {
            return message;
        }

        if (message instanceof Error) {
            return message.message || message.toString();
        }

        if (Array.isArray(message)) {
            return message.join('\n');
        }

        if (typeof message === 'object') {
            const objectMessage =
                typeof message.message === 'string' ? message.message :
                message.error && typeof message.error.message === 'string' ? message.error.message :
                message.response && typeof message.response.message === 'string' ? message.response.message :
                null;

            if (objectMessage) {
                return objectMessage;
            }

            try {
                return JSON.stringify(message, null, 2);
            } catch {
                return String(message);
            }
        }

        return String(message);
    }

    private buildConfig(options?: Partial<IndividualConfig>): Partial<IndividualConfig> {
        return {
            closeButton: true,
            progressBar: true,
            progressAnimation: 'decreasing',
            timeOut: 1500,
            extendedTimeOut: 800,
            tapToDismiss: true,
            ...options
        };
    }

    public showSuccess(message: any, title: string = 'Success', options?: Partial<IndividualConfig>): void {
        this.toastr.success(this.formatMessage(message), title, this.buildConfig(options));
    }

    public showError(message: any, title: string = 'Error', options?: Partial<IndividualConfig>): void {
        this.toastr.error(this.formatMessage(message), title, this.buildConfig(options));
    }

    public showInfo(message: any, title: string = 'Info', options?: Partial<IndividualConfig>): void {
        this.toastr.info(this.formatMessage(message), title, this.buildConfig(options));
    }

    public showWarning(message: any, title: string = 'Warning', options?: Partial<IndividualConfig>): void {
        this.toastr.warning(this.formatMessage(message), title, this.buildConfig(options));
    }

    public showCustom(type: 'success' | 'error' | 'info' | 'warning', message: any, title?: string, options?: Partial<IndividualConfig>): void {
        const formattedMessage = this.formatMessage(message);
        const formattedTitle = title || type.charAt(0).toUpperCase() + type.slice(1);
        const config = this.buildConfig(options);

        switch (type) {
            case 'success':
                this.toastr.success(formattedMessage, formattedTitle, config);
                break;
            case 'error':
                this.toastr.error(formattedMessage, formattedTitle, config);
                break;
            case 'info':
                this.toastr.info(formattedMessage, formattedTitle, config);
                break;
            case 'warning':
                this.toastr.warning(formattedMessage, formattedTitle, config);
                break;
        }
    }
}
