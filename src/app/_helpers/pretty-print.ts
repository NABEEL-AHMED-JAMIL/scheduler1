
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
