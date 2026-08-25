import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LowerCasePipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';
import { Icon } from '../../shared/ui/icon';
import { NotificationBell } from './notification-bell';

interface NavChild {
  label: string;
  path: string;
  icon: string;
  /** One line saying what the screen is for, shown beside the label in the menu. */
  hint?: string;
  adminOnly?: boolean;
  platformOnly?: boolean;
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LowerCasePipe, Icon, NotificationBell],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  readonly openMenu = signal<string | null>(null);
  readonly mobileOpen = signal(false);

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
    { label: 'Dashboard', path: '/', icon: 'chart' },
    {
      label: 'Pipelines',
      children: [
        { label: 'Source Jobs', path: '/jobs', icon: 'briefcase',
          hint: 'Scheduled work and its runs' },
        { label: 'Source Tasks', path: '/tasks', icon: 'list',
          hint: 'What a job does, and where' },
        { label: 'Queue', path: '/queue', icon: 'clock',
          hint: 'What is in flight right now' },
        // Beside the runs it summarises, rather than under Tools: this reads pipeline data
        // rather than being a general-purpose instrument.
        { label: 'Reports', path: '/reports', icon: 'chart',
          hint: 'Group and measure your runs' },
      ],
    },
    { label: 'Object Browser', path: '/objects', icon: 'folder' },
    {
      label: 'Tools',
      children: [
        // Querying first and together -- saved queries, then the ad-hoc escape hatch.
        { label: 'Query Engine', path: '/tools/query', icon: 'database',
          hint: 'Saved SQL, run or scheduled' },
        { label: 'Search Engine', path: '/tools/search', icon: 'search', platformOnly: true,
          hint: 'Ad-hoc read-only SQL' },
        // Then the things that take a file and give one back.
        { label: 'Document Converter', path: '/tools/converter', icon: 'file',
          hint: 'Convert between formats' },
        { label: 'XML Configuration', path: '/settings/xml', icon: 'code', adminOnly: true,
          hint: 'Build a master-data document' },
        { label: 'Audio Transcript', path: '/tools/transcript', icon: 'volume',
          hint: 'Speech to text' },
        { label: 'Content Cleaner', path: '/tools/cleaner', icon: 'sparkle',
          hint: 'Tidy extracted text' },
      ],
    },
    {
      label: 'AI',
      children: [
        { label: 'AI Agents', path: '/ai/agents', icon: 'sparkle',
          hint: 'Provider, model and instructions' },
        { label: 'Models', path: '/ai/models', icon: 'server', adminOnly: true,
          hint: 'Local Ollama models' },
      ],
    },
    {
      label: 'Configuration',
      adminOnly: true,
      children: [
        { label: 'Source Task Types', path: '/settings/task-types', icon: 'layers', adminOnly: true,
          hint: 'Consumers and their Kafka topics' },
        { label: 'Task Forms', path: '/settings/forms', icon: 'template', adminOnly: true,
          hint: 'Fill in a payload instead of writing XML' },
        { label: 'Lookups', path: '/settings/lookup', icon: 'list', adminOnly: true,
          hint: 'Shared key and value data' },
        { label: 'Storage Connections', path: '/admin/storage', icon: 'cloud', adminOnly: true,
          hint: 'S3, Azure, MinIO, FTP' },
        { label: 'Kafka Connections', path: '/settings/kafka', icon: 'server', adminOnly: true,
          hint: 'Brokers and credentials' },
        { label: 'All settings', path: '/admin/settings', icon: 'settings', adminOnly: true,
          hint: 'Every area in one place' },
      ],
    },
    {
      label: 'Administration',
      adminOnly: true,
      children: [
        { label: 'Users', path: '/admin/users', icon: 'users', adminOnly: true,
          hint: 'Who can sign in, and as what' },
        { label: 'Tenants', path: '/admin/tenants', icon: 'globe', platformOnly: true,
          hint: 'Isolated workspaces' },
      ],
    },
  ];

  /** Menus the current role can actually reach, so nothing renders that would 403. */
  readonly nav = computed(() => {
    const isAdmin = this.auth.isTenantAdmin();
    const isPlatform = this.auth.isPlatformAdmin();
    return this.allNav
      .filter(item => !item.adminOnly || isAdmin)
      .map(item => ({
        ...item,
        children: item.children?.filter(child =>
          (!child.adminOnly || isAdmin) && (!child.platformOnly || isPlatform)),
      }))
      .filter(item => !item.children || item.children.length > 0);
  });

  toggleMenu(label: string): void {
    this.openMenu.update(current => (current === label ? null : label));
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
