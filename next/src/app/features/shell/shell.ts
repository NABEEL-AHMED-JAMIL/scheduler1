import { Component, DestroyRef, HostListener, Type, ViewContainerRef, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { roleLabel } from '../../core/auth/auth.models';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { NAV, NavChild, NavItem, placeOf } from '../../core/nav/nav-tree';
import { NavAccess } from '../../core/nav/nav-access';
import { NotificationBell } from './notification-bell';
import { TaskCountService } from '../workflows/task-count.service';

/** A run of entries under one sub-heading of a group ("Workspace", "Billing", "Tools"); the first run may have none. */
export interface NavBlock { section?: string; children: NavChild[] }
export type ShownNavItem = NavItem & { blocks: NavBlock[] };

/** Where the sidebar's collapsed state is remembered. */
const COLLAPSED_KEY = 'etl_nav_collapsed';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, NgTemplateOutlet, Icon, BrandMark, NotificationBell],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  /** The theme menu's placeholder shows the family's icon until the menu's chunk is in. */
  readonly theme = inject(ThemeService);
  readonly tasks = inject(TaskCountService);
  private readonly access = inject(NavAccess);
  private readonly router = inject(Router);

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

  /** The signed-in person's avatar (shell-avatar.ts), once its chunk has loaded; where it goes in the bar and the menu. */
  readonly avatarType = signal<Type<unknown> | null>(null);
  private readonly topAvatar = viewChild('topAvatar', { read: ViewContainerRef });
  private readonly menuAvatar = viewChild('menuAvatar', { read: ViewContainerRef });
  /** The theme menu (theme-menu.ts), once its chunk has loaded; the placeholder button stands in until then. */
  private readonly themeMenuHost = viewChild('themeMenu', { read: ViewContainerRef });
  readonly themeMenuLoaded = signal(false);

  /** Where the sidebar's links go once their chunk has loaded (side-nav.ts). */
  private readonly sideNavHost = viewChild('sideNav', { read: ViewContainerRef });

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
      void import('./shell-avatar').then(m => { if (!destroyed) this.avatarType.set(m.ShellAvatar); });
      void import('./theme-menu').then(m => {
        const slot = this.themeMenuHost();
        if (destroyed || !slot || slot.length) return;
        slot.createComponent(m.ThemeMenu);
        this.themeMenuLoaded.set(true);
      });
      // The sidebar (≥1440px): its own chunk, so the first load carries only the bar.
      void import('./side-nav').then(m => {
        const side = this.sideNavHost();
        if (destroyed || !side || side.length) return;
        side.createComponent(m.SideNav).setInput('shell', this);
      });
    });
    inject(DestroyRef).onDestroy(() => { destroyed = true; host.clear(); });
    // ZT-M18: the managed-session banner names its workspace; a session held without the name asks Identity for it.
    effect(() => {
      if (this.auth.isManagedSession() && !this.auth.user()?.tenantName) untracked(() => this.auth.nameManagedWorkspace());
    });
    // The avatar into the bar once loaded, and into the menu's header each time the menu opens (its slot comes and goes).
    effect(() => {
      const type = this.avatarType();
      const top = this.topAvatar();
      const menu = this.menuAvatar();
      untracked(() => {
        if (type && top && !top.length) top.createComponent(type);
        if (type && menu && !menu.length) {
          const avatar = menu.createComponent(type);
          avatar.setInput('size', 2.25);
          avatar.setInput('link', true);
        }
      });
    });
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
        this.canvasPage.set(wantsCanvas(this.router.routerState.snapshot.root));
        this.unfolded.set(false);
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

  /** The reader's choice: the sidebar shows the groups' icons only (≥1440px). Remembered per browser. */
  private readonly preferCollapsed = signal(readCollapsed());
  /**
   * A page that needs the whole width -- the report designer (MIG-404) -- says so in its route's data (`canvas: true`):
   * the sidebar folds to its icons while it is open and the page loses the shell's padding. The reader may still unfold
   * the sidebar there; that is not remembered, and the next page has their own choice again.
   */
  readonly canvasPage = signal(false);
  private readonly unfolded = signal(false);
  readonly collapsed = computed(() => (this.canvasPage() ? !this.unfolded() : this.preferCollapsed()));

  /**
   * Menus the current role -- and, for a tenant user, their access profile -- can actually
   * reach, so nothing renders that would 403. A hub shows when at least one of its tabs does (its link opens the
   * first of them), and a section whose every page is out of reach is dropped whole rather than left as an empty
   * heading. The rules are NavAccess's, the same ones a hub's tab strip and its address use. canOpen reads the stored
   * session, so the menu recomputes on its own when a token refresh brings a changed profile.
   */
  readonly nav = computed<ShownNavItem[]>(() => {
    this.access.viewer();
    return this.allNav
      .filter(item => !item.tabs || this.access.visible(item))
      .map(item => {
        const children = this.withExactFlags(item.children?.filter(child => this.access.visible(child)));
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

  /** MIG-254: our team's activity is offered in this workspace (NavAccess asks once, when a menu first opens). */
  readonly showTeamActivity = computed(() => this.access.showTeamActivity());

  private checkTeamActivity(): void {
    this.access.checkTeamActivity();
  }

  toggleCollapsed(): void {
    this.openMenu.set(null);
    if (this.canvasPage()) {
      this.unfolded.update(open => !open);
      return;
    }
    const next = !this.preferCollapsed();
    this.preferCollapsed.set(next);
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

  /**
   * Where the current address sits in the menu: the group, and the one entry whose address is the longest prefix of it
   * -- the same answer the breadcrumb gives. A prefix match per link lit two entries at once once the groups mixed
   * sections (Pipelines under Build, Runs at /runs/latest under Run & review).
   */
  private readonly place = computed(() => placeOf(this.currentUrl()));

  /** True while the current route is one of this section's children -- open or not. */
  isSectionActive(item: NavItem): boolean {
    return this.place().group?.label === item.label;
  }

  /** True for the one entry the current address belongs to. */
  isActive(child: NavChild | NavItem): boolean {
    const at = this.place().entry;
    if (!at) return false;
    const query = (c: NavChild | NavItem) => ('query' in c ? JSON.stringify(c.query ?? null) : 'null');
    return at.path === child.path && query(at) === query(child);
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

/** True when the page open (any route on the way down to it) asks for the whole width: `data: { canvas: true }`. */
export function wantsCanvas(root: ActivatedRouteSnapshot): boolean {
  for (let at: ActivatedRouteSnapshot | null = root; at; at = at.firstChild) {
    if (at.data?.['canvas'] === true) return true;
  }
  return false;
}

function readCollapsed(): boolean {
  try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; }
}
