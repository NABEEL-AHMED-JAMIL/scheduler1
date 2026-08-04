import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, AiAgentService, SettingService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode, STATUS_LIST } from '@/_models';
import { AiAgent, AI_PROVIDER_LOOKUP_TYPE, AI_AGENT_FILE_TYPE_LIST, targetFileTypesList } from '@/_models/ai-agent.model';

/**
 * List/add/edit/delete AI agents -- each agent is a saved LLM configuration (provider,
 * model, API key, target file types, instructions) that Object Browser can run against a
 * file's extracted text (see ai-agent.service#processText).
 * @author Nabeel Ahmed
 */
@Component({
    selector: 'ai-agent',
    templateUrl: 'ai-agent.component.html'
})
export class AiAgentComponent implements OnInit {

    @ViewChild('closeAgentModal', {static: false})
    public closeAgentModal: any;
    @ViewChild('closeDeleteAgentModal', {static: false})
    public closeDeleteAgentModal: any;

    public ERROR: string = 'Error';
    public searchAgent: any = '';
    public loading: any = false;
    public submitted: any = false;

    public agents: AiAgent[] = [];
    public statusList: any = STATUS_LIST;
    /** Populated from Settings > Lookup (parent lookupType AI_PROVIDER, one child per selectable provider). */
    public providerList: any[] = [];
    public loadingProviders: boolean = false;
    public fileTypeList: string[] = AI_AGENT_FILE_TYPE_LIST;

    public agentForm: FormGroup;
    public editingAgent: AiAgent;
    /** Set while the Add/Edit modal is pre-filled from an existing agent via Clone -- null
     * for a normal add/edit. Only affects the modal title/hint, saveAgent() still POSTs
     * (editingAgent stays null) since a clone is a brand-new agent. */
    public cloningFrom: AiAgent;
    public selectedFileTypes: Set<string> = new Set<string>();

    public deleteAgentId: any;
    public deleteAgentIndex: any;

    constructor(
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private aiAgentService: AiAgentService,
        private settingService: SettingService) {
    }

    ngOnInit(): void {
        this.fetchAllAgents();
        this.loadProviders();
        this.resetAgentForm();
    }

    get f() {
        return this.agentForm.controls;
    }

    /** Same "parent lookup by type -> fetch its children" pattern used for PIPELINE_IDS/
     * PIPELINE_HOME_PAGES in task.component.ts -- add providers under Settings > Lookup,
     * type AI_PROVIDER, and they show up here with no code change. */
    public loadProviders(): void {
        this.loadingProviders = true;
        this.settingService.appSetting()
            .pipe(first())
            .subscribe((response) => {
                this.loadingProviders = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                let parent = (response.data.lookupDatas || [])
                    .find((lookup: any) => lookup.lookupType === AI_PROVIDER_LOOKUP_TYPE);
                if (!parent) {
                    this.providerList = [];
                    return;
                }
                this.settingService.fetchSubLookupByParentId(parent.lookupId)
                    .pipe(first())
                    .subscribe((subResponse) => {
                        if (subResponse.status === ApiCode.SUCCESS) {
                            this.providerList = (subResponse.data.lookupDatas || [])
                                .map((lookup: any) => ({ key: lookup.lookupValue, value: lookup.lookupValue }));
                        } else {
                            this.alertService.showError(subResponse.message, this.ERROR);
                        }
                    }, (error) => {
                        this.alertService.showError(error, this.ERROR);
                    });
            }, (error) => {
                this.loadingProviders = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public fetchAllAgents(): void {
        this.spinnerService.show();
        this.aiAgentService.fetchAllAgents()
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.agents = response.data;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

    private resetAgentForm(): void {
        this.submitted = false;
        this.editingAgent = null;
        this.cloningFrom = null;
        this.selectedFileTypes = new Set<string>();
        this.agentForm = this.formBuilder.group({
            agentName: ['', Validators.required],
            description: [''],
            provider: ['', Validators.required],
            apiEndpoint: [''],
            apiKey: [''],
            model: ['', Validators.required],
            instructions: ['', Validators.required],
            jsonMode: [false]
        });
    }

    public openAddAgent(): void {
        this.resetAgentForm();
    }

    public openEditAgent(agent: AiAgent): void {
        this.editingAgent = agent;
        this.cloningFrom = null;
        this.submitted = false;
        this.selectedFileTypes = new Set<string>(targetFileTypesList(agent));
        this.agentForm = this.formBuilder.group({
            agentName: [agent.agentName, Validators.required],
            description: [agent.description],
            provider: [agent.provider, Validators.required],
            apiEndpoint: [agent.apiEndpoint],
            apiKey: [''],
            model: [agent.model, Validators.required],
            instructions: [agent.instructions, Validators.required],
            jsonMode: [!!agent.jsonMode],
            status: [agent.status]
        });
    }

    /** Pre-fills the Add/Edit modal from an existing agent so you can tweak a few fields and
     * save as a new agent -- saveAgent() still creates (editingAgent stays null), so this
     * never touches the source agent. apiKey is intentionally left blank: the real key is
     * never sent to the frontend (write-only), so a non-Ollama clone needs its key re-entered. */
    public openCloneAgent(agent: AiAgent): void {
        this.editingAgent = null;
        this.cloningFrom = agent;
        this.submitted = false;
        this.selectedFileTypes = new Set<string>(targetFileTypesList(agent));
        this.agentForm = this.formBuilder.group({
            agentName: [`${agent.agentName} (Copy)`, Validators.required],
            description: [agent.description],
            provider: [agent.provider, Validators.required],
            apiEndpoint: [agent.apiEndpoint],
            apiKey: [''],
            model: [agent.model, Validators.required],
            instructions: [agent.instructions, Validators.required],
            jsonMode: [!!agent.jsonMode]
        });
    }

    /** OpenAI/Anthropic/Ollama have a built-in endpoint server-side; every other (lookup-added)
     * provider is called as a generic OpenAI-compatible endpoint and needs one configured. */
    public isBuiltInProvider(provider: any): boolean {
        return provider === 'OpenAI' || provider === 'Anthropic' || provider === 'Ollama';
    }

    /** Ollama runs locally with no auth -- every other provider needs an API key. */
    public isNoKeyProvider(provider: any): boolean {
        return provider === 'Ollama';
    }

    public apiEndpointPlaceholder(provider: any): string {
        if (provider === 'OpenAI') { return 'Uses https://api.openai.com by default -- leave blank'; }
        if (provider === 'Anthropic') { return 'Uses https://api.anthropic.com by default -- leave blank'; }
        if (provider === 'Ollama') { return 'Uses http://host.docker.internal:11434 by default -- leave blank, or set your own host:port'; }
        return 'https://.../v1/chat/completions';
    }

    public isFileTypeChecked(fileType: string): boolean {
        return this.selectedFileTypes.has(fileType);
    }

    public toggleFileType(fileType: string, checked: any): void {
        if (checked) {
            this.selectedFileTypes.add(fileType);
        } else {
            this.selectedFileTypes.delete(fileType);
        }
    }

    public saveAgent(): void {
        this.submitted = true;
        if (this.agentForm.invalid) {
            return;
        }
        if (!this.isBuiltInProvider(this.agentForm.value.provider) && !this.agentForm.value.apiEndpoint) {
            this.alertService.showError('This provider requires an API endpoint (only OpenAI/Anthropic have a built-in one).', this.ERROR);
            return;
        }
        if (this.selectedFileTypes.size === 0) {
            this.alertService.showError('Select at least one target file type.', this.ERROR);
            return;
        }
        if (!this.editingAgent && !this.agentForm.value.apiKey && !this.isNoKeyProvider(this.agentForm.value.provider)) {
            this.alertService.showError('API key is required for a new agent.', this.ERROR);
            return;
        }
        this.spinnerService.show();
        let payload: AiAgent = {
            ...this.agentForm.value,
            targetFileTypes: Array.from(this.selectedFileTypes).join(',')
        };
        if (!payload.apiKey) {
            delete payload.apiKey;
        }
        if (this.editingAgent) {
            payload.aiAgentId = this.editingAgent.aiAgentId;
            this.aiAgentService.updateAgent(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    this.fetchAllAgents();
                    this.closeAgentModal.nativeElement.click();
                }, (error) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        } else {
            this.aiAgentService.addAgent(payload)
                .pipe(first())
                .subscribe((response) => {
                    this.spinnerService.hide();
                    if (response.status === ApiCode.ERROR) {
                        this.alertService.showError(response.message, this.ERROR);
                        return;
                    }
                    this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                    this.fetchAllAgents();
                    this.closeAgentModal.nativeElement.click();
                }, (error) => {
                    this.spinnerService.hide();
                    this.alertService.showError(error, this.ERROR);
                });
        }
    }

    /** Copies the public "fetch tool config" URL for this agent -- meant to be pasted into a
     * Source Task's XML payload (e.g. a <toolUrl> tag), so an external consumer can GET it to
     * read the agent's provider/model/instructions, then call processText with the same
     * toolUuid to actually run it. Never exposes the apiKey. */
    public copyToolUrl(agent: AiAgent): void {
        if (!agent.toolUuid) {
            this.alertService.showError('This agent has no tool URL yet -- refresh the list and try again.', this.ERROR);
            return;
        }
        let url = `${config.apiUrl}/aiAgent.json/fetchToolByUuid?uuid=${agent.toolUuid}`;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                this.alertService.showSuccess('Tool URL copied to clipboard.');
            }, () => {
                this.alertService.showError('Could not copy to clipboard.', this.ERROR);
            });
            return;
        }
        let textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        this.alertService.showSuccess('Tool URL copied to clipboard.');
    }

    public confirmDeleteAgent(agent: AiAgent, index: any): void {
        this.deleteAgentId = agent.aiAgentId;
        this.deleteAgentIndex = index;
    }

    public processDeleteAgent(): void {
        this.spinnerService.show();
        this.aiAgentService.deleteAgent(this.deleteAgentId)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                // look up by id, not the stale searchFilter-view index
                const realIndex = this.agents.findIndex((agent) => agent.aiAgentId === this.deleteAgentId);
                if (realIndex > -1) {
                    this.agents.splice(realIndex, 1);
                }
                this.closeDeleteAgentModal.nativeElement.click();
                this.deleteAgentId = null;
                this.deleteAgentIndex = null;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

}
