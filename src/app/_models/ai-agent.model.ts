
export const AI_PROVIDER_LOOKUP_TYPE = 'AI_PROVIDER';

export const AI_AGENT_FILE_TYPE_LIST: string[] = ['pdf', 'csv', 'txt', 'json', 'xlsx', 'xml'];

export interface AiAgent {
    aiAgentId?: any;
    agentName?: any;
    description?: any;

    provider?: any;

    apiEndpoint?: any;

    apiKey?: any;
    apiKeyConfigured?: boolean;
    model?: any;

    targetFileTypes?: any;
    instructions?: any;

    jsonMode?: boolean;
    status?: any;
    dateCreated?: any;

    toolUuid?: any;
}

export function targetFileTypesList(agent: AiAgent): string[] {
    return (agent.targetFileTypes || '')
        .split(',')
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => !!t);
}

export function fileExtension(fileName: string): string {
    if (!fileName || fileName.indexOf('.') === -1) {
        return '';
    }
    return fileName.split('.').pop().toLowerCase();
}

/** Whether an agent's configured target file types cover this file -- unrestricted (blank
    targetFileTypes) or an exact, case-insensitive extension match. Mirrors the backend's
    FileChatServiceImpl.acceptsFileType, the actual enforcement; this only shapes which agents
    the chat dropdown offers, it doesn't decide what's allowed. Not gzip-aware the way the
    backend check is -- worst case a ".csv.gz" file hides an agent that would actually have been
    allowed, never the other way around. */
export function agentAcceptsFile(agent: AiAgent, fileName: string): boolean {
    const types = targetFileTypesList(agent);
    if (!types.length) {
        return true;
    }
    const ext = fileExtension(fileName);
    return !!ext && types.indexOf(ext) > -1;
}

export function agentsForFile(agents: AiAgent[], fileName: string): AiAgent[] {
    return (agents || []).filter((agent: AiAgent) =>
        agent.status === 'Active' && agentAcceptsFile(agent, fileName));
}
