import { Component, inject, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Avatar } from '../../shared/ui/avatar';

/**
 * The signed-in person's app-avatar, for the top bar and its menu. Its own chunk, loaded by the shell after the first
 * paint (as the sidebar and the idle guard are), so the picture code does not grow the initial bundle; until then the
 * shell shows an empty circle of the same size. In the menu's header it is also the way to Your profile (not for a
 * managed-service session, which has no profile).
 */
@Component({
  selector: 'app-shell-avatar',
  imports: [Avatar, RouterLink, NgTemplateOutlet],
  template: `
    <ng-template #portrait><app-avatar [appUserId]="auth.user()?.appUserId" [version]="auth.user()?.avatarVersion ?? null"
                                   [name]="auth.displayName()" [size]="size()" [decorative]="true" /></ng-template>
    @if (link() && !auth.isManagedSession()) {
      <a routerLink="/profile" class="block rounded-full" aria-label="Your profile" title="Your profile">
        <ng-container [ngTemplateOutlet]="portrait" />
      </a>
    } @else {
      <ng-container [ngTemplateOutlet]="portrait" />
    }
  `,
  host: { class: 'contents' },
})
export class ShellAvatar {
  readonly auth = inject(AuthService);
  readonly size = input(1.75);
  /** In the menu: a link to Your profile. */
  readonly link = input(false);
}
