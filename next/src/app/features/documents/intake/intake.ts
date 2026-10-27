import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { NavAccess } from '../../../core/nav/nav-access';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { INTAKE_SECTIONS } from './intake-sections';

/**
 * Documents › Intake: the header, the strip of sections the reader may open, what the open one does, and the section
 * itself (a child route: Document Intelligence's upload or email-in view, or the file drop).
 */
@Component({
  selector: 'app-documents-intake',
  imports: [RouterOutlet, RouterLink, Icon, PageHeader],
  styles: [`
    .sections { margin-top: 0.25rem; margin-bottom: 0.75rem; flex-wrap: nowrap; overflow-x: auto; }
    .sections .tab { white-space: nowrap; }
    .section-what { max-width: 72rem; margin-bottom: 1rem; }
  `],
  template: `
    <div class="page">
      <app-page-header title="Intake"
                       subtitle="Every way files reach this workspace: uploaded or mailed in to be read as documents, or dropped for pipelines." />
      @if (sections().length > 1) {
        <nav class="tabs sections" aria-label="Intake" data-test="intake-sections">
          @for (s of sections(); track s.id) {
            <a class="tab" [class.tab-active]="s === active()" [routerLink]="s.path" [attr.aria-current]="s === active() ? 'page' : null"
               [attr.data-section]="s.id"><app-icon [name]="s.icon" size="0.95em" />{{ s.label }}</a>
          }
        </nav>
      }
      @if (active(); as s) {
        <p class="section-what text-sm text-[color:var(--text-secondary)]" data-test="intake-what">{{ s.what }}</p>
      }
      <router-outlet />
    </div>
  `,
})
export class DocumentsIntake {
  private readonly router = inject(Router);
  private readonly access = inject(NavAccess);

  private readonly url = toSignal(this.router.events.pipe(filter(e => e instanceof NavigationEnd), map(() => this.router.url)),
    { initialValue: this.router.url });
  readonly sections = computed(() => INTAKE_SECTIONS.filter(s => this.access.passes(s)));
  readonly active = computed(() => {
    const path = (this.url() ?? '').split(/[?#]/)[0];
    return INTAKE_SECTIONS.find(s => path === s.path) ?? null;
  });
}
