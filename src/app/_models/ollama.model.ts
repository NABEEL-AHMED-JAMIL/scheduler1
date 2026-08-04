/** One model currently pulled into the local Ollama container (see OllamaModelDto backend-side). */
export interface OllamaModel {
    name?: any;
    size?: any;
    modifiedAt?: any;
    digest?: any;
    family?: any;
    parameterSize?: any;
    quantizationLevel?: any;
}

/** Curated shortlist of well-known Ollama library model tags -- Ollama has no API to list its
 * full catalog (that's a static website at ollama.com/library), so this is hand-picked to
 * cover common general-purpose/coding sizes. Users can still type any other tag by hand. */
export interface OllamaCatalogEntry {
    tag: string;
    label: string;
    approxSize: string;
}

export const OLLAMA_POPULAR_MODELS: OllamaCatalogEntry[] = [
    { tag: 'llama3.2:1b', label: 'Llama 3.2 1B -- fastest, lowest memory', approxSize: '~1.3 GB' },
    { tag: 'llama3.2:3b', label: 'Llama 3.2 3B -- good general default', approxSize: '~2 GB' },
    { tag: 'llama3.1:8b', label: 'Llama 3.1 8B -- stronger general purpose', approxSize: '~4.7 GB' },
    { tag: 'mistral:latest', label: 'Mistral 7B -- solid general purpose', approxSize: '~4.4 GB' },
    { tag: 'phi3:mini', label: 'Phi-3 Mini -- small, fast, capable', approxSize: '~2.3 GB' },
    { tag: 'qwen2.5:1.5b', label: 'Qwen 2.5 1.5B -- very lightweight', approxSize: '~1 GB' },
    { tag: 'qwen2.5:7b', label: 'Qwen 2.5 7B -- strong general purpose', approxSize: '~4.7 GB' },
    { tag: 'gemma2:2b', label: 'Gemma 2 2B -- lightweight, low memory', approxSize: '~1.6 GB' },
    { tag: 'codellama:7b', label: 'Code Llama 7B -- code-focused', approxSize: '~3.8 GB' },
    { tag: 'nomic-embed-text', label: 'Nomic Embed Text -- embeddings only', approxSize: '~275 MB' },
    // Math & logic (transparent chain-of-thought)
    { tag: 'deepseek-r1:8b', label: 'DeepSeek R1 8B (distilled) -- math/logic reasoning', approxSize: '~4.5 GB' },
    { tag: 'deepseek-r1:14b', label: 'DeepSeek R1 14B (distilled) -- math/logic reasoning', approxSize: '~8 GB' },
    // Tool calling / agentic tasks (smaller end -- see note below for why nothing bigger is listed)
    { tag: 'qwen3:4b', label: 'Qwen3 4B -- tool calling, small/fast', approxSize: '~2.3 GB' },
    { tag: 'qwen3:14b', label: 'Qwen3 14B -- tool calling, best balance for this machine', approxSize: '~8 GB' }
];
// Anything ~12GB+ (qwen3-coder:30b, devstral:24b, gpt-oss:20b, deepseek-r1:32b, llama3.3:70b,
// qwen3.6:27b) is deliberately left out of this list. qwen3.6:27b (~16GB) actually hung the
// host machine when pulled/run -- with Docker (postgres/kafka/opensearch/etc.) and macOS
// itself already using several GB, a model needs real headroom below 24GB total unified
// memory, not just "technically fits". ~8GB is the practical ceiling here.

/** Human-readable byte size, e.g. 4372824384 -> "4.07 GB". */
export function formatBytes(bytes: any): string {
    let n = Number(bytes);
    if (!n || n <= 0) {
        return '-';
    }
    let units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (n >= 1024 && i < units.length - 1) {
        n = n / 1024;
        i++;
    }
    return `${n.toFixed(2)} ${units[i]}`;
}
