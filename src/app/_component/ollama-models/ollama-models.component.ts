import { Component, OnInit, ViewChild } from '@angular/core';
import { first } from 'rxjs/operators';
import { AlertService, OllamaService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { ApiCode } from '@/_models';
import { OllamaModel, OLLAMA_POPULAR_MODELS, OllamaCatalogEntry, formatBytes } from '@/_models/ollama.model';

@Component({
    selector: 'ollama-models',
    templateUrl: 'ollama-models.component.html'
})
export class OllamaModelsComponent implements OnInit {

    @ViewChild('closeDeleteModelModal', {static: false})
    public closeDeleteModelModal: any;

    public ERROR: string = 'Error';
    public loadingModels: boolean = false;
    public pulling: boolean = false;

    public models: OllamaModel[] = [];
    public popularModels: OllamaCatalogEntry[] = OLLAMA_POPULAR_MODELS;
    public selectedPopularTag: any = '';
    public customTag: any = '';

    public deleteModelName: any;

    public formatBytes = formatBytes;

    constructor(
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private ollamaService: OllamaService) {
    }

    ngOnInit(): void {
        this.fetchModels();
    }

    public fetchModels(): void {
        this.loadingModels = true;
        this.ollamaService.listModels()
            .pipe(first())
            .subscribe((response) => {
                this.loadingModels = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.models = response.data;
            }, (error) => {
                this.loadingModels = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public get tagToPull(): string {
        return (this.customTag || '').trim() || this.selectedPopularTag;
    }

    public pullModel(): void {
        let tag = this.tagToPull;
        if (!tag) {
            this.alertService.showError('Pick a model from the list or type a tag to pull.', this.ERROR);
            return;
        }
        this.pulling = true;
        this.ollamaService.pullModel(tag)
            .pipe(first())
            .subscribe((response) => {
                this.pulling = false;
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.selectedPopularTag = '';
                this.customTag = '';
                this.fetchModels();
            }, (error) => {
                this.pulling = false;
                this.alertService.showError(error, this.ERROR);
            });
    }

    public confirmDeleteModel(model: OllamaModel): void {
        this.deleteModelName = model.name;
    }

    public processDeleteModel(): void {
        this.spinnerService.show();
        this.ollamaService.deleteModel(this.deleteModelName)
            .pipe(first())
            .subscribe((response) => {
                this.spinnerService.hide();
                if (response.status !== ApiCode.SUCCESS) {
                    this.alertService.showError(response.message, this.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.models = this.models.filter((model) => model.name !== this.deleteModelName);
                this.closeDeleteModelModal.nativeElement.click();
                this.deleteModelName = null;
            }, (error) => {
                this.spinnerService.hide();
                this.alertService.showError(error, this.ERROR);
            });
    }

}
