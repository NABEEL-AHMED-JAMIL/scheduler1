import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';

@Injectable({
  providedIn: 'root'
})
export class SpinnerService {

    constructor(@Inject(DOCUMENT) private document: Document) {}

    public show() {

        const spinner = this.document.getElementsByTagName('spinner').item(0) as HTMLElement;
        if (spinner) {
            spinner.style.display = 'block';
        }
    }

    public hide() {
        const spinner = this.document.getElementsByTagName('spinner').item(0) as HTMLElement;
        if (spinner) {
            spinner.style.display = 'none';
        }
    }

}
