import { Component, OnInit, ViewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';
import { AlertService, AiAgentService, SettingService, AuthService } from '@/_services';
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
    // 'Delete' left out of the filter dropdown on purpose -- a deleted agent is never shown
    // (see filteredAgents), so filtering *for* Delete would always yield nothing. Still used
    // as-is (with Delete) for the Edit form's own status select below -- that's a real,
    // reachable state to set an agent to, just not something to filter a list by.
    public statusList: any = STATUS_LIST.filter((s: any) => s.value !== 'Delete');
    // Dropdown filters, applied on top of (before) the free-text search box above -- ''
    // means "no filter" for each. Provider options are derived from the agents actually on
    // this list (not providerList/Settings>Lookup below, which only feeds the Add/Edit form
    // and can drift from what's really assigned to existing agents, e.g. a since-removed
    // provider an old agent still references).
    public filterProvider: string = '';
    public filterStatus: string = '';
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
    public viewMode: 'table' | 'card' = 'table';

    constructor(
        private formBuilder: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private aiAgentService: AiAgentService,
        private settingService: SettingService,
        public authService: AuthService) {
    }

    /** Add/update/delete an agent is TENANT_ADMIN+ server-side (see AiAgentRestApi's class-level
     * @PreAuthorize -- only fetch/process* are relaxed to TENANT_USER). The Add/Edit/Delete/Clone
     * buttons below are gated on this so a Tenant User (who can otherwise use this page fine, to
     * run an existing agent from Object Browser) doesn't see management controls that always
     * 403 -- previously they were shown unconditionally and just failed silently on click. */
    public get canManageAgents(): boolean {
        const role = this.authService.currentUser?.userRole;
        return role === 'PLATFORM_ADMIN' || role === 'TENANT_ADMIN';
    }

    ngOnInit(): void {
        this.fetchAllAgents();
        // loadProviders backs the Add/Edit form's Provider dropdown only -- that form is gated
        // to canManageAgents, so a Tenant User has no use for this list. It also calls
        // SettingRestApi.appSetting, which is TENANT_ADMIN+ server-side -- calling it
        // unconditionally here meant every Tenant User visiting this page got a confusing
        // "you don't have permission" error toast on load, even though the rest of the page
        // (view/run existing agents) works fine for them.
        if (this.canManageAgents) {
            this.loadProviders();
        }
        this.resetAgentForm();
    }

    get f() {
        return this.agentForm.controls;
    }

    public get availableProviders(): string[] {
        return Array.from(new Set(this.agents
            .filter((agent) => agent.status !== 'Delete')
            .map((agent) => agent.provider)
            .filter((p) => !!p))).sort();
    }

    public get filteredAgents(): AiAgent[] {
        return this.agents.filter((agent) =>
            agent.status !== 'Delete'
            && (!this.filterProvider || agent.provider === this.filterProvider)
            && (!this.filterStatus || agent.status === this.filterStatus));
    }

    public get hasActiveFilters(): boolean {
        return !!(this.filterProvider || this.filterStatus || this.searchAgent);
    }

    public clearFilters(): void {
        this.filterProvider = '';
        this.filterStatus = '';
        this.searchAgent = '';
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
                if (response.status !== ApiCode.SUCCESS) {
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

    public setViewMode(mode: 'table' | 'card'): void {
        this.viewMode = mode;
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
                    if (response.status !== ApiCode.SUCCESS) {
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
                    if (response.status !== ApiCode.SUCCESS) {
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
                if (response.status !== ApiCode.SUCCESS) {
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
