import { describe, it, expect } from 'vitest';
import { agentAcceptsFile, fileExtension, targetFileTypesList, Agent } from './file-chat';

/**
 * The frontend half of "Target file types" enforcement -- shapes which agents the dropdown
 * offers for a given file. The backend (FileChatServiceImpl.acceptsFileType) is the actual
 * enforcement; this only has to agree with it closely enough that the agent auto-selected here
 * is one the backend will actually accept.
 */

function agent(targetFileTypes?: string): Agent {
  return { aiAgentId: 1, agentName: 'Test Agent', provider: 'Ollama', status: 'Active', targetFileTypes };
}

describe('fileExtension', () => {
  it('reads the extension after the last dot, lowercased', () => {
    expect(fileExtension('REPORT.PDF')).toBe('pdf');
    expect(fileExtension('archive.tar.gz')).toBe('gz');
  });

  it('is empty for a file with no extension, or a trailing dot', () => {
    expect(fileExtension('README')).toBe('');
    expect(fileExtension('trailing.')).toBe('');
  });
});

describe('targetFileTypesList', () => {
  it('splits, trims and lowercases', () => {
    expect(targetFileTypesList(' PDF , csv ,TXT')).toEqual(['pdf', 'csv', 'txt']);
  });

  it('is empty for blank or unset', () => {
    expect(targetFileTypesList('')).toEqual([]);
    expect(targetFileTypesList(undefined)).toEqual([]);
  });
});

describe('agentAcceptsFile', () => {
  it('accepts a file whose extension is in the list', () => {
    expect(agentAcceptsFile(agent('csv,pdf,txt'), 'report.pdf')).toBe(true);
  });

  it('rejects a file whose extension is not in the list', () => {
    expect(agentAcceptsFile(agent('csv,json'), 'report.pdf')).toBe(false);
  });

  it('is case- and whitespace-insensitive', () => {
    expect(agentAcceptsFile(agent(' PDF , Csv '), 'REPORT.PDF')).toBe(true);
  });

  it('treats a blank targetFileTypes as unrestricted', () => {
    expect(agentAcceptsFile(agent(''), 'anything.xyz')).toBe(true);
    expect(agentAcceptsFile(agent(undefined), 'anything.xyz')).toBe(true);
  });

  it('rejects a file with no extension against a restricted agent', () => {
    expect(agentAcceptsFile(agent('csv,pdf'), 'README')).toBe(false);
  });
});
