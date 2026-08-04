/** lookupType of the parent LookupData row whose children are the selectable provider names
 * (Settings > Lookup) -- lets new providers be added without a code change. "OpenAI" and
 * "Anthropic" get a bespoke request/response shape server-side (see AiAgentServiceImpl);
 * any other provider name is called as a generic OpenAI-compatible endpoint. */
export const AI_PROVIDER_LOOKUP_TYPE = 'AI_PROVIDER';

/** File extensions an agent can be scoped to -- matched against an Object Browser file's
 * extension (lowercase, no dot) to decide which agents show up for a given file. */
export const AI_AGENT_FILE_TYPE_LIST: string[] = ['pdf', 'csv', 'txt', 'json', 'xlsx', 'xml'];

export interface AiAgent {
    aiAgentId?: any;
    agentName?: any;
    description?: any;
    /** Free-form -- one of the child lookup values under AI_PROVIDER (Settings > Lookup). */
    provider?: any;
    /** Required for any provider other than 'OpenAI'/'Anthropic' (those two have a built-in endpoint). */
    apiEndpoint?: any;
    /** Write-only -- set to save/rotate the key; never populated when reading a saved agent (see apiKeyConfigured). */
    apiKey?: any;
    apiKeyConfigured?: boolean;
    model?: any;
    /** Comma-separated lowercase extensions, e.g. "pdf,csv,txt". */
    targetFileTypes?: any;
    instructions?: any;
    /** Ollama only -- forces the model's token sampling to always emit valid JSON, instead of
     * relying on the model to obey a "respond with JSON only" instruction (smaller/weaker
     * local models are prone to ignoring that and replying with a prose/markdown summary). */
    jsonMode?: boolean;
    status?: any;
    dateCreated?: any;
    /** Read-only, server-generated -- stable public id used to build the "Copy Tool URL" link
     * (see fetchToolByUuid / processText's aiAgentUuid on the process backend). */
    toolUuid?: any;
}

/** Splits an agent's comma-separated targetFileTypes into a clean lowercase array. */
export function targetFileTypesList(agent: AiAgent): string[] {
    return (agent.targetFileTypes || '')
        .split(',')
        .map((t: string) => t.trim().toLowerCase())
        .filter((t: string) => !!t);
}

/** Lowercase file extension (no dot) from a file name, e.g. "invoice.PDF" -> "pdf". */
export function fileExtension(fileName: string): string {
    if (!fileName || fileName.indexOf('.') === -1) {
        return '';
    }
    return fileName.split('.').pop().toLowerCase();
}

/** Every active agent whose targetFileTypes includes the given file's extension. */
export function agentsForFile(agents: AiAgent[], fileName: string): AiAgent[] {
    let ext = fileExtension(fileName);
    if (!ext) {
        return [];
    }
    return (agents || []).filter((agent: AiAgent) =>
        agent.status === 'Active' && targetFileTypesList(agent).indexOf(ext) > -1);
}
