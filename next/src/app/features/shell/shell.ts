import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { LowerCasePipe } from '@angular/common';
import { AuthService } from '../../core/auth/auth.service';
import { ThemeService } from '../../core/theme.service';

interface NavItem {
  label: string;
  path?: string;
  children?: { label: string; path: string; adminOnly?: boolean; platformOnly?: boolean }[];
  adminOnly?: boolean;
}

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LowerCasePipe],
  templateUrl: './shell.html',
})
export class Shell {
  readonly auth = inject(AuthService);
  readonly theme = inject(ThemeService);

  readonly openMenu = signal<string | null>(null);
  readonly mobileOpen = signal(false);

  private readonly allNav: NavItem[] = [
    { label: 'Dashboard', path: '/' },
    {
      label: 'Source',
      children: [
        { label: 'Source Job', path: '/jobs' },
        { label: 'Source Task', path: '/tasks' },
      ],
    },
    { label: 'Object Browser', path: '/objects' },
    {
      label: 'Tools',
      children: [
        { label: 'Query Engine', path: '/tools/query' },
        { label: 'Document Converter', path: '/tools/converter' },
        { label: 'Audio Transcript', path: '/tools/transcript' },
        { label: 'PDF Highlighter', path: '/tools/pdf' },
        { label: 'Dynamic Forms', path: '/tools/forms' },
      ],
    },
    {
      label: 'AI Suite',
      children: [
        { label: 'AI Agents', path: '/ai/agents' },
        { label: 'Models', path: '/ai/models', adminOnly: true },
      ],
    },
    {
      label: 'Admin',
      adminOnly: true,
      children: [
        { label: 'Users', path: '/admin/users', adminOnly: true },
        { label: 'Tenants', path: '/admin/tenants', platformOnly: true },
        { label: 'Storage Connections', path: '/admin/storage', adminOnly: true },
        { label: 'Settings', path: '/admin/settings', adminOnly: true },
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
