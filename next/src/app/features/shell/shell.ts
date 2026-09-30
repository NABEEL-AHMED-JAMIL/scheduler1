import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { roleLabel } from '../../core/auth/auth.models';
import { ThemeService } from '../../core/theme.service';
import { Icon } from '../../shared/ui/icon';
import { BrandMark } from '../../shared/ui/brand-mark';
import { PageKey } from '../../core/auth/page-keys';
import { NotificationBell } from './notification-bell';
import { HttpClient } from '@angular/common/http';
import { API_BASE, ApiResponse } from '../../core/api/api.config';
import { TaskCountService } from '../workflows/task-count.service';

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
  /** A Wave 4 / Wave 5 page that is not built yet: the entry opens its "coming soon" page. */
  soon?: boolean;
  /**
   * Whether routerLinkActive must match the whole URL for this entry.
   *
   * Derived in `nav()`, never written by hand: an entry needs it exactly when some OTHER entry
   * sits underneath it, because the default prefix match would then light both. Adding
   * /analytics/dashboards beneath /analytics is what surfaced this -- hardcoding "/analytics is
   * the exact one" would have fixed today's menu and left the next nested route to rediscover it.
   */
  exact?: boolean;
  /**
   * MIG-254: a workspace administrator's view of what our team did there -- offered when the workspace is
   * MANAGED, or once it is known our team has acted in it (a workspace that went back to SELF keeps its history).
   */
  teamOnly?: boolean;
  /** MIG-276: the entry shows the reader's open task count beside its label. */
  badge?: 'tasks';
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon, BrandMark, NotificationBell],
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
    this.router.events.pipe(takeUntilDestroyed()).subscribe(event => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
        // Back/forward and programmatic navigation leave the phone menu open otherwise.
        this.mobileOpen.set(false);
      }
    });
  }

  /**
   * Grouped by the job someone is doing, not by which part of the backend serves it.
   *
   * MIG-246 / MIG-218 (2026-09-28): the Wave 4 menu. Operations became Pipelines, Assistants became
   * AI, Tools and Object Browser became Documents, and Integration is new. The renames are labels
   * only: every entry keeps its access-profile page key, so a profile that granted "Source Jobs"
   * grants "Schedules" -- the same screen, under its new name. MIG-267 adds the Wave 5 modules (Data,
   * Forms, Workflows, and entries in Integration and Documents), each behind a page key of its own.
   *
   * An entry marked `soon` is a page that is not built yet: its route is a "coming soon" page that
   * calls nothing, gated by the page's key so the gate is in place before the screen is.
   */
  // Owner decision 2026-09-30: Connector Hub and Data Catalog come after the demo -- off the menu and the routes until
  // they are built (identity's catalogue leaves their keys out too). Workflows is built (MIG-276).
  private readonly allNav: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: 'chart' },
    {
      // Where data comes from and goes to. Storage Connections moved here from Configuration.
      label: 'Integration',
      children: [
        { label: 'API Collections', path: '/integration/api-collections', pageKey: 'api-collections', icon: 'code',
          hint: 'Which APIs exist, tested and versioned' },
        { label: 'Sources', path: '/integration/sources', pageKey: 'sources', icon: 'database',
          hint: 'APIs, files and databases a pipeline reads' },
        { label: 'Storage Connections', path: '/integration/storage-connections', icon: 'cloud', adminOnly: true,
          hint: 'S3, Azure, MinIO, FTP' },
      ],
    },
    {
      // The running side: what a run does (Pipelines, was Source Tasks), when it runs (Schedules, was
      // Source Jobs), what is in flight, and how the runs went (Run analytics, was Reports). A run's
      // history (Executions, was Run history) is opened from its schedule or the dashboard; there is
      // no list of every run across schedules to put on the menu yet.
      label: 'Pipelines',
      children: [
        // Deliberately not adminOnly: listSourceTask is TENANT_USER, and a schedule points at a
        // pipeline, so reading the list is part of reading the console. Only writing one is
        // TENANT_ADMIN, and those controls are gated inside the page on auth.canManageTasks --
        // the same computed this menu's adminOnly entries resolve through.
        { label: 'Pipelines', path: '/pipelines', pageKey: 'tasks', icon: 'list',
          hint: 'What a run does, and where' },
        { label: 'Schedules', path: '/pipelines/schedules', pageKey: 'jobs', icon: 'calendar',
          hint: 'When each pipeline runs, and its runs' },
        { label: 'Queue', path: '/pipelines/queue', pageKey: 'queue', icon: 'clock',
          hint: 'What is in flight right now' },
        { label: 'Run analytics', path: '/pipelines/run-analytics', pageKey: 'reports', icon: 'chart',
          hint: 'Group and measure your runs' },
      ],
    },
    {
      // Things that take a file and give one back, and the files themselves.
      label: 'Documents',
      children: [
        { label: 'Document Intelligence', path: '/documents/intelligence', pageKey: 'document-intelligence',
          icon: 'search', hint: 'Read documents into structured data' },
        { label: 'Review queue', path: '/documents/review', pageKey: 'document-review', icon: 'checkCircle',
          hint: 'Check low-confidence fields' },
        { label: 'Document Converter', path: '/documents/converter', pageKey: 'tools-converter', icon: 'file',
          hint: 'Convert between formats' },
        { label: 'Reports', path: '/documents/reports', pageKey: 'tools-converter', icon: 'layers',
          hint: 'Documents made from your data' },
        { label: 'Browse files', path: '/documents/files', pageKey: 'objects', icon: 'folder',
          hint: 'Upload, preview and share objects' },
        { label: 'Inbox', path: '/documents/inbox', pageKey: 'objects', icon: 'inbox',
          hint: 'Upload files that start jobs' },
        { label: 'Audio Transcript', path: '/documents/transcript', pageKey: 'tools-transcript', icon: 'volume',
          hint: 'Speech to text' },
      ],
    },
    {
      label: 'Data',
      children: [
        { label: 'Ask your data', path: '/data/ask', pageKey: 'ask-data', icon: 'chat',
          hint: 'Questions in plain language, with sources' },
        { label: 'Analytics Studio', path: '/data/analytics', pageKey: 'analytics', icon: 'chart',
          hint: 'Read a file as data, where it lives' },
        // The saved-analysis library had a route and no way to reach it: /analytics/dashboards
        // was reachable only by typing the address. It is a sibling rather than a child because
        // the menu has one level of nesting, and a saved analysis is a thing you go TO, not a
        // mode of the workspace.
        { label: 'Saved Analyses', path: '/data/analytics/dashboards', pageKey: 'analytics-dashboards', icon: 'save',
          hint: 'Analyses and queries you kept, re-run on open' },
      ],
    },
    {
      label: 'Forms',
      children: [
        { label: 'All forms', path: '/forms/builder', pageKey: 'forms', icon: 'edit',
          hint: 'Fill in your workspace\'s forms; admins build them' },
        { label: 'Submissions', path: '/forms/submissions', pageKey: 'form-submissions', icon: 'table',
          hint: 'Everything collected, and the runs it started' },
      ],
    },
    {
      label: 'Workflows',
      children: [
        { label: 'Task inbox', path: '/workflows/inbox', pageKey: 'task-inbox', icon: 'inbox', badge: 'tasks',
          hint: 'Approvals and tasks waiting for you or your groups' },
        { label: 'Workflow designer', path: '/workflows/designer', pageKey: 'workflow-designer', icon: 'layers',
          hint: 'Who approves what, and what runs after' },
      ],
    },
    {
      label: 'AI',
      children: [
        // Open for the same reason as Pipelines: aiPrompt.json/list is TENANT_USER and the
        // object browser's file chat depends on it, so the list is readable by everyone and
        // only New prompt, Edit, Try it and Delete are gated (auth.canManageAgents). Model
        // connections is a genuine admin screen -- every call it makes is TENANT_ADMIN.
        // MIG-252: the assistant and its tools ride the Prompts key; every call they make is TENANT_USER.
        { label: 'AI Assistant', path: '/ai/assistant', pageKey: 'ai-prompts', icon: 'chat',
          hint: 'Ask in plain language, get runs and reports' },
        { label: 'Tool Registry', path: '/ai/tools', pageKey: 'ai-prompts', icon: 'plug',
          hint: 'What the assistant is allowed to call' },
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
        // Task Registry was Configuration › Pipelines (MIG-218): every task a step can run, and the
        // existing pipelines as Legacy tasks (MIG-250).
        { label: 'Task Registry', path: '/configuration/task-registry', icon: 'template', adminOnly: true,
          hint: 'Every task a step can run, and each existing pipeline' },
        { label: 'Kafka & Topics', path: '/configuration/kafka', icon: 'server', adminOnly: true,
          hint: 'Brokers, credentials and the topics that publish through them' },
        { label: 'Configuration values', path: '/configuration/values', icon: 'key', adminOnly: true,
          hint: 'Values and secrets a task reads as ${config:KEY} and ${secret:KEY}' },
        { label: 'Home pages', path: '/configuration/home-pages', icon: 'globe', adminOnly: true,
          hint: 'The addresses a task can name as its home page' },
        { label: 'Task groups', path: '/configuration/task-groups', icon: 'layers', adminOnly: true,
          hint: 'Labels that group tasks together' },
        { label: 'Engine settings', path: '/configuration/engine', icon: 'settings', platformOnly: true,
          hint: 'The scheduler fetch limit and the crons\' watermarks' },
      ],
    },
    {
      // Money has its own menu: what a workspace used and owes is read by its admins as often
      // as anything under Administration, and is not administration of the workspace.
      label: 'Billing',
      adminOnly: true,
      children: [
        { label: 'Cost & usage', path: '/billing/usage', icon: 'chart', adminOnly: true,
          hint: 'What the workspace used this month and what it costs, line by line' },
        { label: 'Invoices', path: '/billing/invoices', icon: 'file', adminOnly: true,
          hint: 'Every month closed into a bill: status, balance, payment slips, receipts' },
        { label: 'Billing documents', path: '/billing/documents', icon: 'folder', adminOnly: true,
          hint: 'Invoices, receipts, credit notes, statements and slips in one list' },
        { label: 'Billing analytics', path: '/billing/analytics', icon: 'chart', platformOnly: true,
          hint: 'Invoiced, collected, overdue and churn across every workspace' },
        { label: 'Rate cards', path: '/billing/rates', icon: 'layers', platformOnly: true,
          hint: 'The calculation behind every bill, versioned; a workspace can have its own' },
      ],
    },
    {
      label: 'Administration',
      adminOnly: true,
      children: [
        { label: 'Users', path: '/administration/users', icon: 'users', adminOnly: true,
          hint: 'Who can sign in, and as what' },
        { label: 'Access profiles', path: '/administration/access-profiles', icon: 'shield', adminOnly: true,
          hint: 'Which pages your tenant users can open.' },
        // MIG-254: members may read it too (the route rides the Prompts key), but it is administration: they reach it
        // from the AI Assistant's Context panel, not from this menu.
        { label: 'Data policies', path: '/administration/data-policies', icon: 'lock', adminOnly: true,
          hint: 'Which models see each level of data, and for how long' },
        { label: 'Tenants', path: '/administration/tenants', icon: 'globe', platformOnly: true,
          hint: 'Isolated workspaces' },
        // Platform, not admin: listRequests, approve and reject all carry
        // @PreAuthorize("hasRole('PLATFORM_ADMIN')"), so a tenant administrator shown this link was
        // walked straight into the unauthorized page.
        { label: 'Workspace Requests', path: '/administration/tenant-requests', icon: 'inbox',
          platformOnly: true, hint: 'Asks from outside for a workspace' },
        // MIG-254: the managed service. Platform pages first, then the workspace administrator's one.
        { label: 'Managed service', path: '/administration/managed-service', icon: 'briefcase', platformOnly: true,
          hint: 'Which of our staff may work in which workspace' },
        { label: 'Staff activity', path: '/administration/staff-activity', icon: 'history', platformOnly: true,
          hint: 'Every change our staff made in a customer\'s workspace' },
        { label: 'Work in a workspace', path: '/administration/work-in-workspace', icon: 'external', platformOnly: true,
          hint: 'Open a managed session where you hold a grant' },
        { label: 'Reliability', path: '/administration/reliability', icon: 'chart', platformOnly: true,
          hint: 'Pipeline execution and billing against their 99.99% targets' },
        { label: 'Our team\'s activity', path: '/administration/team-activity', icon: 'history', adminOnly: true,
          teamOnly: true, hint: 'Every change our team made in this workspace' },
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
          && (!child.teamOnly || (!isPlatform && this.showTeamActivity()))
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

  toggleMobile(): void {
    if (!this.mobileOpen()) this.checkTeamActivity();
    this.mobileOpen.set(!this.mobileOpen());
  }

  menuId(label: string): string {
    return 'nav-menu-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  toggleMenu(label: string): void {
    if (label === 'Administration') this.checkTeamActivity();
    this.openMenu.update(current => (current === label ? null : label));
  }

  /** True while the current route is one of this section's children -- open or not. */
  isSectionActive(item: NavItem): boolean {
    const url = this.currentUrl();
    return !!item.children?.some(child => url === child.path || url.startsWith(child.path + '/'));
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
