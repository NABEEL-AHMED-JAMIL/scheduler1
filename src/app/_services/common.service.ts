import { Injectable } from '@angular/core';
import { saveAs } from 'file-saver';

@Injectable({
    providedIn: 'root'
})
export class CommomService {
    
    constructor() {
    }

    private uuid(): string {
        return 'xxxxxxxx-xxxxxxxx'.replace(/[xy]/g, (char) => {
          let random = Math.random() * 16 | 0;
          let value = char === "x" ? random : (random % 4 + 8);
          return value.toString(16);
        });
    }
    
    public createFile(payload: any): any {
        const file = new Blob([JSON.stringify(payload, null, 4)], { type: 'application/json' });
        saveAs(file, 'ETL ' + this.uuid() + '.json');
    }
}