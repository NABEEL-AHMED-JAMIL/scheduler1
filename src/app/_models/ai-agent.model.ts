
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

export function agentsForFile(agents: AiAgent[], fileName: string): AiAgent[] {
    let ext = fileExtension(fileName);
    if (!ext) {
        return [];
    }
    return (agents || []).filter((agent: AiAgent) =>
        agent.status === 'Active' && targetFileTypesList(agent).indexOf(ext) > -1);
}
