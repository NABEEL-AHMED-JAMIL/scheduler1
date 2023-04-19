import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, FormArray, Validators } from '@angular/forms';
import { ConfigurationMakerService, AlertService } from '@/_services';
import { SpinnerService } from '@/_helpers';
import { saveAs } from 'file-saver';
import { ApiCode } from '@/_models';

@Component({
    selector: 'xml-configuration',
    templateUrl: 'xml-configuration.component.html'
})
export class XmlConfigurationComponent implements OnInit {	

    public xmlForm: FormGroup;
    public xmlString: string = '';
    public xmlInfo: any;
    public file: File;

    constructor(public fb: FormBuilder,
        private alertService: AlertService,
        private spinnerService: SpinnerService,
        private xmlService: ConfigurationMakerService) {
    }

    ngOnInit() {
        this.xmlForm = this.fb.group({
            tagsInfo: this.fb.array([
                this.buildItem(), this.buildItem(), this.buildItem(),
                this.buildItem(), this.buildItem(), this.buildItem(),
                this.buildItem(), this.buildItem()
            ]),
        });
    }

    public buildItem(): any {
        return new FormGroup({
            tagKey: new FormControl('', Validators.required),
            tagParent: new FormControl(''),
            tagValue: new FormControl(''),
        });
    }

    public createFile(): any {
        const file = new Blob([this.xmlString], { type: 'application/xml' });
        saveAs(file, 'ETL-XML-Config ' + this.uuid() + '.xml');
    }

    public uuid(): string {
        return 'xxxxxxxx-xxxxxx'.replace(/[xy]/g, (char) => {
          let random = Math.random() * 16 | 0;
          let value = char === "x" ? random : (random % 4 + 8);
          return value.toString(16);
        });
    }

    public get tageForms(): FormArray {
        return this.xmlForm.get('tagsInfo') as FormArray;
    }
    
    public tageFormsAddItem(): void {
        this.tageForms.push(this.buildItem());
    }
    
    public tageFormAddItem(index: number): void {
        this.tageForms.insert(index, this.buildItem());
    }

    public tageFormRemoveItem(index: number): void {
        this.tageForms.removeAt(index);
    }

    public submintTageForms(xmlInfo: any): any {
        this.spinnerService.show();
        this.xmlInfo = {
            xmlTagsInfo: xmlInfo?.tagsInfo
        }
        this.xmlService.getXmlData(this.xmlInfo)
        .subscribe((response: any) => {
            if(response.status === ApiCode.SUCCESS) {
                this.xmlString = response.message;
                this.spinnerService.hide();
            } else {
                this.spinnerService.hide();
                this.alertService.showError(response.message, 'Error');
            }
        }, error => {
            this.spinnerService.hide();
            this.alertService.showError(error, 'Error');
        });
    }

    public addFile(file: File): void {
        this.file = file;
    }
    
}