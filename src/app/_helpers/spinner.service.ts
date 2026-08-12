import { Injectable, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';


/**
 * @author Nabeel Ahmed
 */
@Injectable({
  providedIn: 'root'
})
export class SpinnerService {

    constructor(@Inject(DOCUMENT) private document: Document) {}

    public show() {
        // Guarded -- <spinner> lives in AppComponent's template, so it's absent for any call
        // that can run before that template mounts (or in a context that never bootstraps it,
        // e.g. a future unit test). Every component calls spinnerService.show() as effectively
        // the first line of most HTTP-triggering methods, so an unguarded null deref here would
        // crash the triggering flow entirely instead of just skipping the visual indicator.
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
