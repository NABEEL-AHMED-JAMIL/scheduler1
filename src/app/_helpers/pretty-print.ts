/** Formats a value (object, JSON string, or plain string) as indented JSON for display --
 * falls back to the raw string if it isn't valid JSON. Was previously duplicated identically
 * in queue-message.component.ts and job-history-action.component.ts. */
export function prettyPrint(message: any): string {
    if (message === null || message === undefined || message === '') {
        return '';
    }
    if (typeof message === 'object') {
        return JSON.stringify(message, null, 2);
    }
    try {
        return JSON.stringify(JSON.parse(message), null, 2);
    } catch {
        return String(message);
    }
}
