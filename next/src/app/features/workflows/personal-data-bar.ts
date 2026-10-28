import { Component, input, output } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { PersonalDataState } from './workflows.api';

/**
 * ZT-I34 (owner 2026-10-27, "mask for readers without access"): over a request's details, where the reader stands with its
 * personal data -- hidden (with Show for someone holding See personal data: the request's history records each showing),
 * hidden for them (and whom to ask), shown (with Hide), or their own request. Nothing when the request holds none.
 */
@Component({
  selector: 'app-personal-data-bar',
  imports: [Icon],
  styles: `
    .pdb { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem 0.75rem; margin: 0 0 0.875rem; padding: 0.45rem 0.75rem;
           border-radius: var(--radius-md); background: var(--surface-inset); font-size: 0.8125rem; color: var(--text-secondary); }
    .pdb-text { display: inline-flex; align-items: center; gap: 0.375rem; flex: 1 1 18rem; min-width: 0; }
  `,
  template: `
    @if (state(); as s) {
      @if (s.personal) {
        <div class="pdb" role="note" data-test="personal-data-bar" [attr.data-state]="s.shown ? 'shown' : s.own ? 'own' : s.canShow ? 'can-show' : 'hidden'">
          @if (s.shown) {
            <span class="pdb-text"><app-icon name="eye" size="0.95em" />Personal data is shown to you. The request's history records it.</span>
            <button type="button" class="btn btn-default btn-sm" (click)="hide.emit()" data-test="hide-personal"><app-icon name="lock" />Hide</button>
          } @else if (s.own) {
            <span class="pdb-text"><app-icon name="info" size="0.95em" />Your own request: you see its personal data.</span>
          } @else if (s.canShow) {
            <span class="pdb-text"><app-icon name="lock" size="0.95em" />Personal data is hidden. Showing it is recorded in the request's history.</span>
            <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="show.emit()" data-test="show-personal"><app-icon name="eye" />Show personal data</button>
          } @else {
            <span class="pdb-text"><app-icon name="lock" size="0.95em" />Personal data is hidden for you. A workspace administrator can give you See personal data.</span>
          }
        </div>
      }
    }
  `,
})
export class PersonalDataBar {
  readonly state = input<PersonalDataState | null | undefined>(null);
  readonly busy = input(false);
  readonly show = output<void>();
  readonly hide = output<void>();
}
