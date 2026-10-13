import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { ParameterEditor } from './parameter-editor';
import { canonical, definitionJson, sameDefinition, updateParameters } from './steps.model';
import { RunParameter } from '../../jobs/run-parameters/run-parameters';

/** MIG-347: a pipeline's run parameters on its Settings tab, and how the definition writes them (the server's order). */
function editor(parameters: RunParameter[], problems: { path: string; message: string }[] = []) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [ParameterEditor] });
  const fixture = TestBed.createComponent(ParameterEditor);
  const emitted: RunParameter[][] = [];
  fixture.componentRef.setInput('parameters', parameters);
  fixture.componentRef.setInput('problems', problems);
  fixture.componentInstance.changed.subscribe(p => emitted.push(p));
  fixture.detectChanges();
  return { fixture, emitted, el: fixture.nativeElement as HTMLElement, c: fixture.componentInstance };
}

describe('the pipeline\'s run parameters', () => {
  it('adds one with a free name, and removes one', () => {
    const { emitted, el, c } = editor([{ name: 'param_1', type: 'text' }]);
    el.querySelector<HTMLButtonElement>('[data-test="parameter-add"]')!.click();
    expect(emitted[0]).toEqual([{ name: 'param_1', type: 'text' }, { name: 'param_2', type: 'text' }]);
    c.remove(0);
    expect(emitted[1]).toEqual([]);
  });

  it('a new type drops a default and choices that were the old one\'s, and a choice starts with two', () => {
    const { emitted, c } = editor([{ name: 'n', type: 'number', default: 4 }]);
    c.setType(0, 'choice');
    expect(emitted[0]).toEqual([{ name: 'n', type: 'choice', choices: ['a', 'b'] }]);
    c.setChoices(0, 'north, south, north');
    expect(emitted[1]).toEqual([{ name: 'n', type: 'number', choices: ['north', 'south'] }]);
  });

  it('keeps a number default a number and says the server\'s problem on its row', () => {
    const { emitted, el, c } = editor([{ name: 'limit', type: 'number' }], [{ path: 'parameters[0].default', message: 'a number' }]);
    c.setDefault(0, '25');
    expect(emitted[0]).toEqual([{ name: 'limit', type: 'number', default: 25 }]);
    expect(el.querySelector('[role="alert"]')!.textContent).toContain('default: a number');
  });

  it('writes parameters after the source, in the server\'s field order, without what is blank', () => {
    const d = updateParameters({ steps: [{ key: 'read', task: 'sample' }] },
      [{ choices: ['x'], type: 'text', name: 'note', required: false, label: '' } as RunParameter]);
    expect(definitionJson(d)).toBe(JSON.stringify({ parameters: [{ name: 'note', type: 'text' }], steps: [{ key: 'read', task: 'sample' }] }, null, 2));
    expect(canonical(updateParameters(d, [])).parameters).toBeUndefined();
    expect(sameDefinition(d, { steps: [{ key: 'read', task: 'sample' }], parameters: [{ name: 'note', type: 'text' }] })).toBe(true);
  });
});
