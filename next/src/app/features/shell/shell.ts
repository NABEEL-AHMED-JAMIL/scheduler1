import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LowerCasePipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { PageKey } from '../../core/auth/page-keys';
import { NotificationBell } from './notification-bell';

interface NavChild {
  label: string;
  path: string;
  icon: string;
  /** One line saying what the screen is for, shown beside the label in the menu. */
  hint?: string;
  adminOnly?: boolean;
  platformOnly?: boolean;
  /** The access-profile page this entry is; absent for pages a profile cannot take away. */
  pageKey?: PageKey;
  /**
   * Whether routerLinkActive must match the whole URL for this entry.
   *
   * Derived in `nav()`, never written by hand: an entry needs it exactly when some OTHER entry
   * sits underneath it, because the default prefix match would then light both. Adding
   * /analytics/dashboards beneath /analytics is what surfaced this -- hardcoding "/analytics is
   * the exact one" would have fixed today's menu and left the next nested route to rediscover it.
   */
  exact?: boolean;
}

interface NavItem {
  label: string;
  path?: string;
  icon?: string;
  children?: NavChild[];
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LowerCasePipe, Icon, BrandMark, NotificationBell],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);
  private readonly router = inject(Router);

  readonly openMenu = signal<string | null>(null);
  readonly mobileOpen = signal(false);

  /**
   * Only `openMenu` drove a dropdown trigger's highlight, so a section with no menu open --
   * which is how the nav looks the rest of the time -- never showed which one you were in.
   * The leaf links (Dashboard) get this for free from `routerLinkActive`;
   * a dropdown trigger has no `[routerLink]` of its own to hang that off, so its own current
   * route is tracked here instead.
   */
  readonly currentUrl = signal(this.router.url);

  constructor() {
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) this.currentUrl.set(event.urlAfterRedirects);
    });
  }

  /**
   * Grouped by the job someone is doing, not by which part of the backend serves it.
   *
   * "Admin" previously held seven entries that mixed managing people with configuring
   * infrastructure -- different tasks, done by different people, at different times. Those are
   * now Administration and Configuration. "Source" named an internal concept rather than a
   * purpose; it is Pipelines, and the queue moved into it because a run belongs beside the
   * job that produced it.
   */
  private readonly allNav: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'chart' },
    {
      // "Operations", not "Pipelines": a pipeline is a definition now (Configuration ›
      // Pipelines -- id, topic, fields), and this section is the running side of it -- the
      // jobs, tasks, queue and reports. Two menus called Pipelines meant two different things.
      label: 'Operations',
      children: [
        { label: 'Source Jobs', path: '/jobs', pageKey: 'jobs', icon: 'briefcase',
          hint: 'Scheduled work and its runs' },
        // Deliberately not adminOnly: listSourceTask is TENANT_USER, and a job points at a
        // task, so reading the list is part of reading the console. Only writing one is
        // TENANT_ADMIN, and those controls are gated inside the page on auth.canManageTasks --
        // the same computed this menu's adminOnly entries resolve through.
        { label: 'Source Tasks', path: '/tasks', pageKey: 'tasks', icon: 'list',
          hint: 'What a job does, and where' },
        { label: 'Queue', path: '/queue', pageKey: 'queue', icon: 'clock',
          hint: 'What is in flight right now' },
        // Beside the runs it summarises, rather than under Tools: this reads pipeline data
        // rather than being a general-purpose instrument.
        { label: 'Reports', path: '/reports', pageKey: 'reports', icon: 'chart',
          hint: 'Group and measure your runs' },
      ],
    },
    {
      // Both screens are the same bucket, seen two ways: one browses the objects, the other
      // reads what is inside them. They share a storage service, so they share a menu.
      label: 'Object Browser',
      children: [
        { label: 'Browse files', path: '/objects', pageKey: 'objects', icon: 'folder',
          hint: 'Upload, preview and share objects' },
        { label: 'Analytics Studio', path: '/analytics', pageKey: 'analytics', icon: 'chart',
          hint: 'Read a file as data, where it lives' },
        // The saved-analysis library had a route and no way to reach it: /analytics/dashboards
        // was reachable only by typing the address. It is a sibling rather than a child because
        // the menu has one level of nesting, and a saved analysis is a thing you go TO, not a
        // mode of the workspace.
        { label: 'Saved Analyses', path: '/analytics/dashboards', pageKey: 'analytics-dashboards', icon: 'save',
          hint: 'Analyses and queries you kept, re-run on open' },
      ],
    },
    {
      label: 'Tools',
      children: [
        // The things that take a file and give one back.
        { label: 'Document Converter', path: '/tools/converter', pageKey: 'tools-converter', icon: 'file',
          hint: 'Convert between formats' },
        { label: 'Audio Transcript', path: '/tools/transcript', pageKey: 'tools-transcript', icon: 'volume',
          hint: 'Speech to text' },
      ],
    },
    {
      label: 'Assistants',
      children: [
        // Open for the same reason as Source Tasks: aiPrompt.json/list is TENANT_USER and the
        // object browser's file chat depends on it, so the list is readable by everyone and
        // only New prompt, Edit, Try it and Delete are gated (auth.canManageAgents). Model
        // connections is a genuine admin screen -- every call it makes is TENANT_ADMIN.
        { label: 'Prompts', path: '/ai/prompts', pageKey: 'ai-prompts', icon: 'sparkle',
          hint: 'What a step says to a model' },
        { label: 'Model connections', path: '/ai/connections', icon: 'server', adminOnly: true,
          hint: 'Providers, keys and caps' },
      ],
    },
    {
      label: 'Configuration',
      adminOnly: true,
      children: [
        { label: 'Kafka & Topics', path: '/settings/kafka', icon: 'server', adminOnly: true,
          hint: 'Brokers, credentials and the topics that publish through them' },
        { label: 'Pipelines', path: '/settings/pipelines', icon: 'template', adminOnly: true,
          hint: 'Each pipeline, the topic it publishes on, and its form' },
        { label: 'Lookups', path: '/settings/lookup', icon: 'list', adminOnly: true,
          hint: 'Shared key and value data' },
        { label: 'Storage Connections', path: '/settings/storage-connections', icon: 'cloud', adminOnly: true,
          hint: 'S3, Azure, MinIO, FTP' },
      ],
    },
    {
      label: 'Administration',
      adminOnly: true,
      children: [
        { label: 'Users', path: '/admin/users', icon: 'users', adminOnly: true,
          hint: 'Who can sign in, and as what' },
        { label: 'Access profiles', path: '/admin/access-profiles', icon: 'shield', adminOnly: true,
          hint: 'Which pages your tenant users can open.' },
        { label: 'Tenants', path: '/admin/tenants', icon: 'globe', platformOnly: true,
          hint: 'Isolated workspaces' },
        // Platform, not admin: listRequests, approve and reject all carry
        // @PreAuthorize("hasRole('PLATFORM_ADMIN')"), so a tenant admin shown this link was
        // walked straight into the unauthorized page.
        { label: 'Workspace Requests', path: '/admin/tenant-requests', icon: 'inbox',
          platformOnly: true, hint: 'Asks from outside for a workspace' },
      ],
    },
  ];

  /**
   * Menus the current role -- and, for a tenant user, their access profile -- can actually
   * reach, so nothing renders that would 403. A section whose every page is out of reach is
   * dropped whole rather than left as an empty heading. canOpen reads the stored session, so the
   * menu recomputes on its own when a token refresh brings a changed profile.
   */
  readonly nav = computed(() => {
    const isAdmin = this.auth.isTenantAdmin();
    const isPlatform = this.auth.isPlatformAdmin();
    return this.allNav
      .filter(item => !item.adminOnly || isAdmin)
      .map(item => ({
        ...item,
        children: this.withExactFlags(item.children?.filter(child =>
          (!child.adminOnly || isAdmin) && (!child.platformOnly || isPlatform)
          && (!child.pageKey || this.auth.canOpen(child.pageKey)))),
      }))
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

  toggleMenu(label: string): void {
    this.openMenu.update(current => (current === label ? null : label));
  }

  /** True while the current route is one of this section's children -- open or not. */
  isSectionActive(item: NavItem): boolean {
    const url = this.currentUrl();
    return !!item.children?.some(child => url === child.path || url.startsWith(child.path + '/'));
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    // Any click that isn't inside an open menu closes it -- the CDK overlay is reserved for
    // menus that need positioning; a nav dropdown anchored to its trigger doesn't.
    const target = event.target as HTMLElement;
    if (!target.closest('[data-nav-menu]')) {
      this.openMenu.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.openMenu.set(null);
    this.mobileOpen.set(false);
  }
}
