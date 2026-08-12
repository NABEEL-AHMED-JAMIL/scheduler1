import { Component } from '@angular/core';

/**
 * Shown when RoleGuard blocks a route the logged-in user doesn't have the role for -- distinct
 * from AuthGuard's "not logged in at all" case (that one redirects to /login instead).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'unauthorized',
    templateUrl: 'unauthorized.component.html'
})
export class UnauthorizedComponent {
}
