import { Component, DestroyRef, HostListener, ViewContainerRef, afterNextRender, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleLabel } from '../../core/auth/auth.models';
import { ThemeService } from '../../core/theme.service';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { NAV, NavChild, NavItem } from '../../core/nav/nav-tree';
import { NotificationBell } from './notification-bell';
import { HttpClient } from '@angular/common/http';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { TaskCountService } from '../workflows/task-count.service';

/** A run of entries under one sub-heading of a group ("Workspace", "Billing", "Tools"); the first run may have none. */
export interface NavBlock { section?: string; children: NavChild[] }
export type ShownNavItem = NavItem & { blocks: NavBlock[] };

/** Where the sidebar's collapsed state is remembered. */
const COLLAPSED_KEY = 'etl_nav_collapsed';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, NgTemplateOutlet, Icon, BrandMark, NotificationBell],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  readonly tasks = inject(TaskCountService);
  private readonly router = inject(Router);
  // HttpClient rather than ManagedServiceApi: the shell is in the initial bundle, the admin pages' client is not.
  private readonly http = inject(HttpClient);

  readonly openMenu = signal<string | null>(null);
  readonly mobileOpen = signal(false);

  /** The role as the profile and user screens name it, not the enum lowercased. */
  readonly roleText = computed(() => roleLabel(this.auth.role()));

  /**
   * Only `openMenu` drove a dropdown trigger's highlight, so a section with no menu open --
   * which is how the nav looks the rest of the time -- never showed which one you were in.
   * The leaf links (Dashboard) get this for free from `routerLinkActive`;
   * a dropdown trigger has no `[routerLink]` of its own to hang that off, so its own current
   * route is tracked here instead.
   */
  readonly currentUrl = signal(this.router.url);

  constructor() {
    // MIG-353: idle sign-out -- the warning a minute before, and the sign-out. Its own lazy chunk, fetched after the
    // shell's first paint; a dynamic import rather than @defer, which would pull the defer runtime into the initial bundle.
    const host = inject(ViewContainerRef);
    let destroyed = false;
    afterNextRender(() => {
      // The sidebar (≥1440px) shows Administration & billing without a menu being opened: ask about our team's
      // activity once, as opening that menu would.
      if (!this.collapsed() && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 90rem)').matches) {
        this.checkTeamActivity();
      }
      void import('../../core/auth/idle-guard').then(m => { if (!destroyed && !host.length) host.createComponent(m.IdleGuard); });
    });
    inject(DestroyRef).onDestroy(() => { destroyed = true; host.clear(); });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
        // Back/forward and programmatic navigation leave the phone menu open otherwise.
        this.mobileOpen.set(false);
      }
    });
  }

  /**
   * UX review 2026-10-12 (A10): the menu by the job someone is doing -- Home, Get data in, Build, Run & review, See
   * results, Administration & billing, Platform -- from core/nav/nav-tree.ts, which the breadcrumbs read too. From
   * 1440px wide it is a sidebar on the left (collapsible, remembered); from 1180px the same groups are the top bar's
   * menus; below that, the ☰ panel.
   */
  private readonly allNav: NavItem[] = NAV;

  /** The sidebar shows the groups' icons only (≥1440px). Remembered per browser. */
  readonly collapsed = signal(readCollapsed());

  /**
   * Menus the current role -- and, for a tenant user, their access profile -- can actually
   * reach, so nothing renders that would 403. A section whose every page is out of reach is
   * dropped whole rather than left as an empty heading. canOpen reads the stored session, so the
   * menu recomputes on its own when a token refresh brings a changed profile.
   */
  readonly nav = computed<ShownNavItem[]>(() => {
    const isAdmin = this.auth.isTenantAdmin();
    const isPlatform = this.auth.isPlatformAdmin();
    return this.allNav
      .map(item => {
        const children = this.withExactFlags(item.children?.filter(child =>
          !child.crumbOnly
          && (!child.adminOnly || isAdmin) && (!child.platformOnly || isPlatform)
          && (!child.teamOnly || (!isPlatform && this.showTeamActivity()))
          && (!child.pageKey || this.auth.canOpen(child.pageKey))));
        return { ...item, children, blocks: blocksOf(children ?? []) };
      })
      .filter(item => !item.children || item.children.length > 0);
  });

  /**
   * Marks every entry that another entry is nested under.
   *
   * Runs over the ROLE-FILTERED list rather than the whole menu: if the only route beneath
   * /analytics were admin-only, a reader who cannot see it should get the ordinary prefix match
   * on the parent, not an exact one that stops highlighting on a child page they can reach.
   */
  private withExactFlags(children?: NavChild[]): NavChild[] | undefined {
    if (!children) return children;
    return children.map(child => ({
      ...child,
      exact: children.some(other => other.path.startsWith(child.path + '/')),
    }));
  }

  /** An id for a nav panel, so its trigger can say which panel it controls. Labels have spaces. */
  /** MIG-254: our team has acted in this SELF workspace (asked once, when the menu is first opened). */
  private readonly teamActivitySeen = signal(false);
  private teamActivityAsked = false;
  readonly showTeamActivity = computed(() => this.auth.managementMode() === 'MANAGED' || this.teamActivitySeen());

  /**
   * Whether a SELF workspace has any of our team's changes, asked when a menu first opens rather than on every
   * page: one small read, and only for the one person it can change the menu for.
   */
  private checkTeamActivity(): void {
    if (this.teamActivityAsked || !this.auth.isTenantAdmin() || this.auth.isPlatformAdmin() || this.showTeamActivity()) return;
    this.teamActivityAsked = true;
    this.http.get<ApiResponse<unknown[]>>(`${API_BASE}/managedService.json/actions`, { params: { limit: 1 } }).subscribe({
      next: r => this.teamActivitySeen.set(!!r.data?.length),
      error: () => { /* the menu stays as it is */ },
    });
  }

  toggleCollapsed(): void {
    const next = !this.collapsed();
    this.collapsed.set(next);
    this.openMenu.set(null);
    try { localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0'); } catch { /* not remembered */ }
  }

  toggleMobile(): void {
    if (!this.mobileOpen()) this.checkTeamActivity();
    this.mobileOpen.set(!this.mobileOpen());
  }

  menuId(label: string): string {
    return 'nav-menu-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  toggleMenu(label: string): void {
    if (label.endsWith('Administration & billing')) this.checkTeamActivity();
    this.openMenu.update(current => (current === label ? null : label));
  }

  /** True while the current route is one of this section's children -- open or not. */
  isSectionActive(item: NavItem): boolean {
    const url = this.currentUrl();
    const path = url.split(/[?#]/)[0];
    return !!item.children?.some(child => path === child.path || path.startsWith(child.path + '/'));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Any click that isn't inside the open menu closes it -- the CDK overlay is reserved for
    // menus that need positioning; a nav dropdown anchored to its trigger doesn't. Each wrapper
    // names its menu, so a click on the bell (or another trigger) is not "inside" this one: the
    // bell's panel used to open on top of the account menu instead of replacing it. A click on
    // another trigger still works, because its toggleMenu ran first and made it the open one.
    const menu = (event.target as HTMLElement).closest('[data-nav-menu]');
    if (menu?.getAttribute('data-nav-menu') !== this.openMenu()) {
      this.openMenu.set(null);
    }
  }

  /**
   * Tabbing out of a panel closes it, rather than leaving it open over the page behind the
   * focus. A null relatedTarget (a click on something unfocusable, the window losing focus) is
   * left to the click handler, which knows whether the click was inside.
   */
  onMenuFocusOut(event: FocusEvent, key: string): void {
    const next = event.relatedTarget as Node | null;
    if (next && this.openMenu() === key && !(event.currentTarget as HTMLElement).contains(next)) {
      this.openMenu.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    // Closing the panel removes the link that had focus, which drops focus to the page body and
    // sends the next Tab back to the top. Hand it to the trigger instead -- but only when focus
    // was in this menu, so an Escape meant for a dialog does not pull focus into the header.
    const open = this.openMenu();
    const wrapper = document.activeElement?.closest('[data-nav-menu]');
    const inOpenMenu = open !== null && wrapper?.getAttribute('data-nav-menu') === open;
    this.openMenu.set(null);
    this.mobileOpen.set(false);
    if (inOpenMenu) wrapper!.querySelector<HTMLElement>(':scope > button')?.focus();
  }
}

/** Splits a group's entries into runs under their sub-headings, in order. */
function blocksOf(children: NavChild[]): NavBlock[] {
  const blocks: NavBlock[] = [];
  for (const child of children) {
    const last = blocks[blocks.length - 1];
    if (last && last.section === child.section) last.children.push(child);
    else blocks.push({ section: child.section, children: [child] });
  }
  return blocks;
}

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}
