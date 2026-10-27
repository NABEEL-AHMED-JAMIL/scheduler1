import { describe, it, expect } from 'vitest';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StepFlow, collapseStages, stageNodeId } from './step-flow';
import { StepNames } from './step-names';
import { stageGroups } from './overview';
import { pipelineGraph } from '../../../shared/flow-graph/flow-adapters';
import { Definition, Step } from './steps.model';

/** Owner 2026-10-20: a long pipeline's flow folds its stage runs into one node each, like the list's stage groups. */
const step = (key: string, task: string, input?: string): Step => ({ key, name: key, task, ...(input ? { input } : {}) } as Step);
const STEPS: Step[] = [
  step('runs', 'read_runs'), step('kept', 'read_s3'),
  step('run_of', 'compute'), step('reviewed', 'join', 'run_of'), step('decided', 'compute'), step('ordered', 'sort'),
  step('save', 'save_file'),
];

describe('collapseStages', () => {
  const groups = stageGroups(STEPS, []);
  const full = pipelineGraph(STEPS, {});
  const transform = groups.find(g => g.stage.id === 'transform')!;

  it('leaves the graph as it is when nothing is folded', () => {
    expect(collapseStages(full, groups, new Set())).toEqual(full);
  });

  it('folds a stage run into one node and moves its edges to it', () => {
    const id = stageNodeId(transform);
    const g = collapseStages(full, groups, new Set([id]));
    expect(g.nodes.map(n => n.id)).toEqual(['runs', 'kept', id, 'save']);
    const node = g.nodes.find(n => n.id === id)!;
    expect(node.label).toBe('Transform · 4 steps');
    expect(node.sub).toBe('run_of … ordered');
    expect(g.edges.some(e => e.from === id && e.to === 'save')).toBe(true);
    expect(g.edges.some(e => e.from === id && e.to === id)).toBe(false);
    const keys = g.edges.map(e => `${e.from}>${e.to}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('never folds a run of one step', () => {
    const save = groups.find(g => g.stage.id === 'write')!;
    expect(collapseStages(full, groups, new Set([stageNodeId(save)])).nodes.map(n => n.id)).toContain('save');
  });
});

describe('the Flow view folds by stage', () => {
  function mount(steps: Step[]) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(),
      { provide: StepNames, useValue: { names: signal({}), lookupIn: () => () => null } }] });
    const fixture = TestBed.createComponent(StepFlow);
    fixture.componentRef.setInput('definition', { version: 1, steps } as unknown as Definition);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('opens a short pipeline unfolded, offers a chip per stage run, folds and opens again', () => {
    const flow = mount(STEPS);
    expect(flow.folded().size).toBe(0);
    expect(flow.foldable().map(f => f.label)).toEqual(['Read', 'Transform']);
    flow.foldAll();
    expect(flow.shown().nodes.length).toBe(flow.graph().nodes.length - 4);
    const transform = flow.foldable().find(f => f.label === 'Transform')!.id;
    flow.pick(transform);
    expect(flow.isFolded(transform)).toBe(false);
    flow.openAll();
    expect(flow.shown()).toEqual(flow.graph());
  });

  it('opens a long pipeline (over 12 steps) folded, and a folded step selects its run', () => {
    const many = [...STEPS, ...Array.from({ length: 8 }, (_, i) => step('t' + i, 'filter'))];
    const flow = mount(many);
    expect(flow.allFolded()).toBe(true);
  });
});
