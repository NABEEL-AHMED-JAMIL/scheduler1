import {
    Injectable,
    Pipe,
    PipeTransform
} from '@angular/core';

interface SearchToken {
    field?: string;
    term: string;
    negated: boolean;
}

@Injectable({
    providedIn: 'root'
})
@Pipe({
  name: 'searchFilter'
})
export class SearchFilterPipe implements PipeTransform {

    public transform(value: any, args?: any): any {
        if (!value) {
            return null;
        }

        if (!args && args !== 0) {
            return value;
        }

        const searchText = String(args).trim();
        if (!searchText) {
            return value;
        }

        const tokens = this.tokenize(searchText);

        return value.filter((data: any) => this.matchesAllTokens(data, tokens));
    }

    private tokenize(input: string): SearchToken[] {
        const tokens: SearchToken[] = [];
        const tokenRegex = /(-)?((?:[\w$]+(?:\.[\w$]+)*)\:)?(?:"([^"]+)"|'([^']+)'|(\S+))/g;
        let match: RegExpExecArray | null;

        while ((match = tokenRegex.exec(input)) !== null) {
            const negated = !!match[1];
            const field = match[2] ? match[2].slice(0, -1) : undefined;
            const term = (match[3] || match[4] || match[5] || '').toLowerCase();
            if (term) {
                tokens.push({ field, term, negated });
            }
        }

        return tokens;
    }

    private matchesAllTokens(item: any, tokens: SearchToken[]): boolean {
        return tokens.every(token => this.matchesToken(item, token));
    }

    private matchesToken(item: any, token: SearchToken): boolean {
        const matchFound = token.field
            ? this.matchesFieldPath(item, token.field, token.term)
            : this.matchesAnyValue(item, token.term);

        return token.negated ? !matchFound : matchFound;
    }

    private matchesFieldPath(item: any, fieldPath: string, term: string): boolean {
        const pathParts = fieldPath.split('.');
        let current = item;

        for (const part of pathParts) {
            if (current == null || typeof current !== 'object') {
                return false;
            }
            current = current[part];
        }

        return this.matchesAnyValue(current, term);
    }

    private matchesAnyValue(item: any, term: string): boolean {
        if (item == null) {
            return false;
        }

        const valueType = typeof item;
        if (valueType === 'string' || valueType === 'number' || valueType === 'boolean') {
            return String(item).toLowerCase().includes(term);
        }

        if (Array.isArray(item)) {
            return item.some(value => this.matchesAnyValue(value, term));
        }

        if (valueType === 'object') {
            return Object.values(item).some(value => this.matchesAnyValue(value, term));
        }

        return false;
    }

}