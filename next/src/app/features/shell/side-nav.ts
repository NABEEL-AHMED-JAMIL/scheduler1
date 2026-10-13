import { Component, ViewEncapsulation, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import type { Shell } from './shell';

/**
 * UX review 2026-10-12 (N2): the menu as a left sidebar, from 1440px wide. Its own chunk, created by the shell after
 * the first paint, so the sidebar's markup does not grow the first load; the shell's <aside> holds its width from the
 * start. Everything it shows and does is the shell's: the same groups, the same one lit entry, the same open-menu
 * state (a collapsed sidebar opens a group beside its icon, closed by the shell's outside-click and Escape).
 */
@Component({
  selector: 'app-side-nav',
  imports: [RouterLink, NgTemplateOutlet, Icon],
  host: { class: 'contents' },
  // Global: the rules style the shell's <aside> (collapsed) and the links inside it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    .app-sidebar-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0.75rem 0.5rem; }
    .app-sidebar.is-collapsed .app-sidebar-scroll { overflow: visible; }
    .side-group { margin-top: 0.875rem; }
    .side-group-label {
      padding: 0 0.625rem 0.25rem; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
      color: var(--text-muted);
    }
    .side-group .nav-section { padding-top: 0.375rem; text-transform: none; letter-spacing: normal; font-weight: 500; }
    .side-link { align-items: center; padding-block: 0.375rem; }
    .side-link .nav-child-icon { margin-top: 0; }
    .side-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.25rem; }
    .app-sidebar.is-collapsed .side-link { justify-content: center; padding-inline: 0; }
    .app-sidebar.is-collapsed .side-label { display: none; }
    .side-collapse { margin: 0 0.5rem 0.5rem; border-top: 1px solid var(--border-subtle); border-radius: 0; padding-top: 0.625rem; }
    .side-flyout { left: calc(100% + 0.5rem); top: 0; margin-top: 0; }
  `,
  template: `
      <nav class="app-sidebar-scroll">
        @for (item of shell().nav(); track item.label) {
          @if (item.path) {
            <a [routerLink]="item.path" [class.nav-child-active]="shell().isActive(item)" [attr.aria-current]="shell().isActive(item) ? 'page' : null"
               class="nav-child side-link font-medium" [attr.title]="shell().collapsed() ? item.label : null">
              <app-icon [name]="item.icon || 'chart'" size="1em" class="nav-child-icon" />
              <span class="side-label text-sm">{{ item.label }}</span>
            </a>
          } @else if (shell().collapsed()) {
            <div class="relative" [attr.data-nav-menu]="'side:' + item.label"
                 (focusout)="shell().onMenuFocusOut($event, 'side:' + item.label)">
              <button type="button" class="nav-child side-link w-full" [title]="item.label"
                      [class.nav-child-active]="shell().isSectionActive(item)"
                      [attr.aria-expanded]="shell().openMenu() === 'side:' + item.label"
                      [attr.aria-controls]="shell().menuId('side ' + item.label)"
                      (click)="shell().toggleMenu('side:' + item.label)">
                <app-icon [name]="item.icon || 'list'" size="1em" class="nav-child-icon" />
                <span class="sr-only">{{ item.label }}</span>
              </button>
              @if (shell().openMenu() === 'side:' + item.label) {
                <div [id]="shell().menuId('side ' + item.label)" class="nav-panel side-flyout"
                     [class.nav-panel-columns]="item.blocks.length > 2">
                  <div class="nav-section !pt-1">{{ item.label }}</div>
                  @for (block of item.blocks; track $index) {
                    <div class="nav-block">
                      @if (block.section) { <div class="nav-section">{{ block.section }}</div> }
                      @for (child of block.children; track child.path + (child.query?.['tab'] ?? '')) {
                        <ng-container *ngTemplateOutlet="entry; context: { $implicit: child }" />
                      }
                    </div>
                  }
                </div>
              }
            </div>
          } @else {
            <div class="side-group">
              <div class="side-group-label">{{ item.label }}</div>
              @for (block of item.blocks; track $index) {
                @if (block.section) { <div class="nav-section">{{ block.section }}</div> }
                @for (child of block.children; track child.path + (child.query?.['tab'] ?? '')) {
                  <a [routerLink]="child.path" [queryParams]="child.query ?? null"
                     [class.nav-child-active]="shell().isActive(child)" [attr.aria-current]="shell().isActive(child) ? 'page' : null"
                     class="nav-child side-link" [attr.title]="child.hint || null">
                    <app-icon [name]="child.icon" size="1em" class="nav-child-icon" />
                    <span class="side-label text-sm">{{ child.label }}</span>
                    @if (child.badge === 'tasks' && shell().tasks.count()) {
                      <span class="pill ml-auto !px-1.5 !py-0 !text-[11px]" [class.pill-crit]="shell().tasks.overdue()"
                            [class.pill-neutral]="!shell().tasks.overdue()">{{ shell().tasks.count() }}</span>
                    }
                  </a>
                }
              }
            </div>
          }
        }
      </nav>
      <button type="button" class="nav-child side-link side-collapse" (click)="shell().toggleCollapsed()"
              [attr.aria-label]="shell().collapsed() ? 'Expand the menu' : 'Collapse the menu'"
              [attr.aria-pressed]="shell().collapsed()">
        <app-icon [name]="shell().collapsed() ? 'chevronRight' : 'chevronLeft'" size="1em" class="nav-child-icon" />
        <span class="side-label text-sm">Collapse</span>
      </button>
    <ng-template #entry let-child>
      <a [routerLink]="child.path" [queryParams]="child.query ?? null" (click)="shell().openMenu.set(null)"
         [class.nav-child-active]="shell().isActive(child)" [attr.aria-current]="shell().isActive(child) ? 'page' : null"
         class="nav-child">
        <app-icon [name]="child.icon" size="1em" class="nav-child-icon" />
        <span class="min-w-0">
          <span class="block text-sm leading-tight">{{ child.label }}@if (child.badge === 'tasks' && shell().tasks.count()) {&ngsp;<span class="pill ml-0.5 !px-1.5 !py-0 !text-[11px] align-[1px]" [class.pill-crit]="shell().tasks.overdue()" [class.pill-neutral]="!shell().tasks.overdue()">{{ shell().tasks.count() }}</span>}</span>
          @if (child.hint) { <span class="block text-[11px] leading-tight mt-0.5 text-[color:var(--text-muted)]">{{ child.hint }}</span> }
        </span>
      </a>
    </ng-template>
  `,
})
export class SideNav {
  readonly shell = input.required<Shell>();
}
