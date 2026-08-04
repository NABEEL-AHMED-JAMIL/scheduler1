import { Component, OnInit } from '@angular/core';
import { first } from 'rxjs/operators';
import { AlertService, AiAgentService, StorageService } from '@/_services';
import { ApiCode, BucketSummary, ObjectSummary } from '@/_models';
import { AiAgent, fileExtension } from '@/_models/ai-agent.model';

const PAGE_SIZE = 100;

interface Breadcrumb {
    name: string;
    prefix: string;
}

interface ChatMessage {
    role: 'user' | 'assistant';
    text: string;
}

/**
 * A simple general-purpose chat -- pick a saved AI Agent, optionally paste some reference
 * content (e.g. your CV) into the Content box, then chat. Each turn embeds the running
 * conversation (and the Content box, if filled) into AiAgentService#processText's `text` param
 * with no instructions override, so the agent's own saved instructions act as a stable system
 * persona across the whole conversation instead of changing every message -- normal chat
 * semantics, unlike the per-call prompt override the extractor screens use. Each assistant
 * reply has a "Use as Content" button so you can iterate on a CV (or anything else) turn by
 * turn: paste it in, ask for a revision, adopt the reply, ask for another pass, etc.
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'ai-chat',
    templateUrl: 'ai-chat.component.html'
})
export class AiChatComponent implements OnInit {

    public ERROR = 'Error';
    public SUCCESS = 'Success';

    public mode: 'chat' | 'browse' = 'chat';

    // Ask AI / chat
    public agents: AiAgent[] = [];
    public loadingAgents = false;
    public selectedAgentId: any = '';
    public content = '';
    public messages: ChatMessage[] = [];
    public prompt = '';
    public sending = false;
    public sendError = '';

    // Browse mode -- load an existing .txt into the Content box (e.g. a saved CV)
    public buckets: BucketSummary[] = [];
    public loadingBuckets = false;
    public selectedBucket = '';
    public objects: ObjectSummary[] = [];
    public loadingObjects = false;
    public currentPrefix = '';
    public breadcrumbs: Breadcrumb[] = [];
    public loadingContent = false;

    // Save-to-bucket panel
    public saveBucket = '';
    public saveFolderName = '';
    public saveFolderExists = false;
    public savingContent = false;
    public contentSavedPath = '';
    public saveContentError = '';
    public savingChat = false;
    public chatSavedPath = '';
    public saveChatError = '';

    constructor(
        private alertService: AlertService,
        private storageService: StorageService,
        private aiAgentService: AiAgentService) {
    }

    ngOnInit(): void {
        this.loadAgents();
        this.loadBuckets();
    }

    public setMode(mode: 'chat' | 'browse'): void {
        this.mode = mode;
    }

    // --- Chat ---

    public loadAgents(): void {
        this.loadingAgents = true;
        this.aiAgentService.fetchAllAgents()
            .pipe(first())
            .subscribe((response) => {
                this.loadingAgents = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.agents = (response.data || []).filter((agent: AiAgent) => agent.status === 'Active');
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingAgents = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public sendMessage(): void {
        if (!this.selectedAgentId) {
            this.alertService.showError('Select an AI Agent.', this.ERROR);
            return;
        }
        if (!this.prompt || !this.prompt.trim()) {
            this.alertService.showError('Type a message first.', this.ERROR);
            return;
        }
        let currentPrompt = this.prompt;
        let context = this.buildContext(currentPrompt);
        this.sending = true;
        this.sendError = '';
        this.aiAgentService.processText(this.selectedAgentId, 'Chat Conversation', context)
            .pipe(first())
            .subscribe((response) => {
                this.sending = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.messages = [...this.messages, { role: 'user', text: currentPrompt }, { role: 'assistant', text: response.data }];
                    this.prompt = '';
                    if (!this.saveFolderName) {
                        this.saveFolderName = this.suggestFolderName();
                    }
                } else {
                    this.sendError = response.message;
                }
            }, (error) => {
                this.sending = false;
                this.sendError = 'Chat failed: ' + (error && error.message ? error.message : error);
            });
    }

    /** Embeds the Content box (if filled) and the running conversation into one block, with
     * the new message last -- no instructions override, so the agent's own saved instructions
     * stay the system persona for the whole chat instead of changing every turn. */
    private buildContext(currentPrompt: string): string {
        let parts: string[] = [];
        if (this.content && this.content.trim()) {
            parts.push(`Content:\n${this.content.trim()}`);
        }
        if (this.messages.length) {
            let history = this.messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n');
            parts.push(`Conversation so far:\n${history}`);
        }
        parts.push(`User: ${currentPrompt}`);
        return parts.join('\n\n---\n\n');
    }

    public useAsContent(text: string): void {
        this.content = text;
        this.alertService.showSuccess('Applied to Content box.', this.SUCCESS);
    }

    public clearChat(): void {
        this.messages = [];
        this.sendError = '';
    }

    public clearAll(): void {
        this.content = '';
        this.messages = [];
        this.prompt = '';
        this.sendError = '';
        this.saveBucket = '';
        this.saveFolderName = '';
        this.saveFolderExists = false;
        this.contentSavedPath = '';
        this.saveContentError = '';
        this.chatSavedPath = '';
        this.saveChatError = '';
    }

    // --- Browse mode (load an existing .txt into the Content box) ---

    public loadBuckets(): void {
        this.loadingBuckets = true;
        this.storageService.buckets()
            .pipe(first())
            .subscribe((response) => {
                this.loadingBuckets = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.buckets = response.data || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingBuckets = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public onBucketChange(): void {
        this.currentPrefix = '';
        this.breadcrumbs = [];
        this.objects = [];
        if (this.selectedBucket) {
            this.loadObjects();
        }
    }

    public loadObjects(): void {
        this.loadingObjects = true;
        this.storageService.listObjects(this.selectedBucket, this.currentPrefix, null, PAGE_SIZE)
            .pipe(first())
            .subscribe((response) => {
                this.loadingObjects = false;
                if (response.status === ApiCode.SUCCESS) {
                    this.objects = (response.data && response.data.objects) || [];
                } else {
                    this.alertService.showError(response.message, this.ERROR);
                }
            }, (error) => {
                this.loadingObjects = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public openEntry(entry: ObjectSummary): void {
        if (entry.folder) {
            this.currentPrefix = entry.key;
            this.breadcrumbs = [...this.breadcrumbs, { name: entry.name, prefix: entry.key }];
            this.loadObjects();
            return;
        }
        if (fileExtension(entry.name) !== 'txt') {
            this.alertService.showError(`"${entry.name}" isn't a .txt file.`, this.ERROR);
            return;
        }
        this.loadingContent = true;
        this.storageService.previewObjectText(this.selectedBucket, entry.key)
            .pipe(first())
            .subscribe((text) => {
                this.loadingContent = false;
                this.content = text || '';
                this.saveBucket = this.selectedBucket;
                this.saveFolderName = entry.key.indexOf('/') > -1 ? entry.key.substring(0, entry.key.lastIndexOf('/')) : '';
                this.saveFolderExists = true;
                this.mode = 'chat';
                this.alertService.showSuccess(`Loaded ${entry.name} into the Content box.`, this.SUCCESS);
            }, (error) => {
                this.loadingContent = false;
                this.alertService.showError(error && error.message ? error.message : error, this.ERROR);
            });
    }

    public goToBreadcrumb(index: number): void {
        if (index < 0) {
            this.currentPrefix = '';
            this.breadcrumbs = [];
        } else {
            this.currentPrefix = this.breadcrumbs[index].prefix;
            this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        }
        this.loadObjects();
    }

    // --- Copy to clipboard ---

    public copyText(text: string): void {
        if (!text) {
            return;
        }
        this.copyToClipboard(text, 'Copied to clipboard.');
    }

    private copyToClipboard(text: string, successMessage: string): void {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                this.alertService.showSuccess(successMessage, this.SUCCESS);
            }, () => {
                this.alertService.showError('Could not copy to clipboard.', this.ERROR);
            });
            return;
        }
        let textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.alertService.showSuccess(successMessage, this.SUCCESS);
    }

    // --- Save to Bucket ---

    private suggestFolderName(): string {
        let stamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        return `chat_${stamp}`;
    }

    public saveContentToBucket(): void {
        if (!this.content || !this.validateSaveTarget()) {
            return;
        }
        this.savingContent = true;
        this.saveContentError = '';
        this.contentSavedPath = '';
        this.saveTextToBucketFolder(this.saveBucket, this.saveFolderName.trim(), 'content.txt', this.content, this.saveFolderExists,
            (path) => {
                this.savingContent = false;
                this.contentSavedPath = path;
            },
            (message) => {
                this.savingContent = false;
                this.saveContentError = message;
            });
    }

    public saveChatToBucket(): void {
        if (!this.messages.length || !this.validateSaveTarget()) {
            return;
        }
        let chatText = this.messages.map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.text}`).join('\n\n');
        this.savingChat = true;
        this.saveChatError = '';
        this.chatSavedPath = '';
        this.saveTextToBucketFolder(this.saveBucket, this.saveFolderName.trim(), 'chat_history.txt', chatText, this.saveFolderExists,
            (path) => {
                this.savingChat = false;
                this.chatSavedPath = path;
            },
            (message) => {
                this.savingChat = false;
                this.saveChatError = message;
            });
    }

    private validateSaveTarget(): boolean {
        if (!this.saveBucket) {
            this.alertService.showError('Select a bucket.', this.ERROR);
            return false;
        }
        if (!this.saveFolderExists && (!this.saveFolderName || !this.saveFolderName.trim())) {
            this.alertService.showError('Enter a folder name.', this.ERROR);
            return false;
        }
        return true;
    }

    private saveTextToBucketFolder(bucket: string, folderPrefix: string, fileName: string, content: string, folderExists: boolean,
        onSuccess: (path: string) => void, onError: (message: string) => void): void {
        let doUpload = () => {
            let file = new File([content], fileName, { type: 'text/plain' });
            let prefix = folderPrefix ? folderPrefix + '/' : '';
            this.storageService.uploadObject(bucket, prefix, file)
                .pipe(first())
                .subscribe((uploadResponse) => {
                    if (uploadResponse.status === ApiCode.SUCCESS) {
                        onSuccess(`${bucket}/${prefix}${fileName}`);
                    } else {
                        onError(uploadResponse.message);
                    }
                }, (error) => onError(error && error.message ? error.message : error));
        };
        if (folderExists) {
            doUpload();
            return;
        }
        this.storageService.createFolder(bucket, '', folderPrefix)
            .pipe(first())
            .subscribe((folderResponse) => {
                if (folderResponse.status !== ApiCode.SUCCESS) {
                    onError(folderResponse.message);
                    return;
                }
                doUpload();
            }, (error) => onError(error && error.message ? error.message : error));
    }

}
