import { describe, it, expect } from 'vitest';
import { codeName, codeWords, plainHint } from './plain-words';
import { fieldsOf, optionWords } from '../../features/tasks/steps/steps.model';
import { actionLabel, changeDetail } from '../../features/admin/access-profiles/access-grants';

/** ZT-U8: what the platform writes reads, on screen, as the console names things -- no codes, no service names. */
describe('Plain words on screen (ZT-U8)', () => {
  it('drops the platform\'s part names and says old menus by their names today', () => {
    expect(plainHint('Reads objects from a bucket (storage-service).')).toBe('Reads objects from a bucket.');
    expect(plainHint('A prompt (AI > Prompts) run by the model (ai-service).')).toBe('A prompt (Build › Pipelines › Prompts) run by the model.');
    expect(plainHint('A template from Documents > Converter.')).toBe('A template from Tools › Document Converter.');
    expect(plainHint('Raise it in Report Studio › Settings.')).toBe('Raise it in Reports › Settings.');
    expect(plainHint('By its schedule (Pipelines › Schedules).')).toBe('By its schedule (Build › Pipelines › Schedules & triggers).');
    expect(plainHint('Open Build › Pipelines › Schedules & triggers.')).toBe('Open Build › Pipelines › Schedules & triggers.');
  });

  it('reads a step\'s code as words', () => {
    expect(codeName('call_api')).toBe('Call API');
    expect(codeName('read_s3')).toBe('Read S3');
    expect(codeName('generate_report')).toBe('Generate report');
    expect(codeName('Generate report')).toBe('Generate report');
  });

  it('shows an enum\'s codes as the words its hint gives them, and keeps the rest of the hint', () => {
    const w = optionWords(['FAIL_TASK', 'CONTINUE_WITH_WARNING'],
      'FAIL_TASK: the step fails. CONTINUE_WITH_WARNING: the step completes with no report and a warning on the run.');
    expect(w.labels).toEqual(['The step fails', 'The step completes with no report and a warning on the run']);
    expect(w.description).toBe('');
    expect(optionWords(['STOP', 'SKIP_FILE'], 'What a failed file does.').labels).toEqual(['Stop', 'Skip file']);
    expect(optionWords(['role', 'team', 'last_run'], '').labels).toEqual(['role', 'team', 'last_run']);
    const [f] = fieldsOf({ type: 'object', properties: { onValidationError: { type: 'string', enum: ['FAIL_TASK', 'CONTINUE_WITH_WARNING'],
      title: 'When the checks refuse it', description: 'FAIL_TASK: the step fails. CONTINUE_WITH_WARNING: the step completes with a warning.' } } });
    expect(f.optionLabels).toEqual(['The step fails', 'The step completes with a warning']);
    expect(f.options).toEqual(['FAIL_TASK', 'CONTINUE_WITH_WARNING']);
  });

  it('asks who reviews by role or team, not for a team\'s id', () => {
    const [f] = fieldsOf({ type: 'object', properties: { reviewers: { type: 'object', title: 'Who checks the pages', properties: {
      kind: { type: 'string', enum: ['role', 'team'] }, value: { type: 'string', description: 'for a team: the team\'s id.' } } } } });
    expect(f.kind).toBe('reviewers');
  });

  it('names a team\'s changes in Page access › Changes, and its roles as words', () => {
    expect(actionLabel('TEAM_CREATED')).toBe('Made a team');
    expect(actionLabel('TEAM_MEMBER_ADDED')).toBe('Added to a team');
    expect(actionLabel('SOMETHING_NEW')).toBe('Something new');
    expect(changeDetail({ action: 'TEAM_MEMBER_ADDED', key: 'Physicians', after: 'LEAD' })).toBe('Physicians · Lead');
    // Owner 2026-10-27: a page and a tab by their names, never their keys; an action Page access has no words for yet as words.
    expect(changeDetail({ action: 'PAGE_GRANTED', key: 'reports', after: null })).toBe('Run analytics');
    expect(changeDetail({ action: 'TAB_GRANTED', key: 'queue:by-date', after: null })).toBe('Runs by date › By date');
    expect(changeDetail({ action: 'PAGE_GRANTED', key: 'see-personal-data', after: null })).toBe('See personal data');
    expect(actionLabel('page.access.renamed')).toBe('Page access renamed');
  });

  it('reads any code as words (codeWords)', () => {
    expect(codeWords('report.approved.signed')).toBe('Report approved signed');
    expect(codeWords('SOME_NEW_THING')).toBe('Some new thing');
    expect(codeWords('aiPrompt')).toBe('AI prompt');
    expect(codeWords('api-call')).toBe('API call');
    expect(codeWords('Already words')).toBe('Already words');
  });
});
