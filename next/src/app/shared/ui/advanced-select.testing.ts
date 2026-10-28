import { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AdvancedSelect } from './advanced-select';

/**
 * Unit-test helpers for screens that use the advanced select (shared/ui/advanced-select.ts), where a spec once set a
 * native select's value and dispatched `change`.
 */

/** Every advanced select on the fixture's page, in page order. */
export function advancedSelects(fixture: ComponentFixture<unknown>): AdvancedSelect[] {
  return fixture.debugElement.queryAll(By.directive(AdvancedSelect)).map(d => d.componentInstance as AdvancedSelect);
}

/** The advanced select named by its `ariaLabel`, its `id` or a CSS selector of its element (the first that matches). */
export function advancedSelect(fixture: ComponentFixture<unknown>, name: string): AdvancedSelect {
  const all = fixture.debugElement.queryAll(By.directive(AdvancedSelect));
  const hit = all.find(d => {
    const box = d.componentInstance as AdvancedSelect;
    if (box.ariaLabel() === name || box.id() === name) return true;
    try { return (d.nativeElement as HTMLElement).matches(name); } catch { return false; }
  });
  if (!hit) throw new Error(`no advanced select "${name}" (have: ${all.map(d => (d.componentInstance as AdvancedSelect).ariaLabel() || (d.componentInstance as AdvancedSelect).id()).join(', ')})`);
  return hit.componentInstance as AdvancedSelect;
}

/** Picks a value ('' for none) in the named advanced select, as the person would, and lets the page update. */
export function chooseAdvanced(fixture: ComponentFixture<unknown>, name: string, value: string | number): void {
  advancedSelect(fixture, name).choose(String(value));
  fixture.detectChanges();
}
