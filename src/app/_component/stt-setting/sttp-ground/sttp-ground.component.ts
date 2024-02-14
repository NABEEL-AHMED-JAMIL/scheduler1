import { SpinnerService } from '@/_helpers';
import { ApiCode, AuthResponse, STTFormList, IControlField, IValidations, IForm } from '@/_models';
import { AlertService, AuthenticationService, CommomService, LookupService, STTService } from '@/_services';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { first } from 'rxjs/operators';

export enum ValidationsType {
    PATTERN = 0,
    REQUIRED = 1,
    MAX_LENGTH = 2,
    MINT_LENGTH = 3,
    EMAIL = 4
};


/**
 * 1) radio and check box will do latar in phase 2
 * 2) hide and show do latter in phase 2
 */
@Component({
    selector: 'sttp-ground',
    templateUrl: 'sttp-ground.component.html'
})
export class SttpGroundComponent implements OnInit {

    public selectedSTTFId: any = '';
    public currentActiveProfile: AuthResponse;

    public sstFormList: STTFormList[] = [];

    public formJson: IForm;
    public dynamicForm: FormGroup;

    constructor(
        public fb: FormBuilder,
        private sttService: STTService,
        private alertService: AlertService,
        public commomService: CommomService,
        private spinnerService: SpinnerService,
        private lookupService: LookupService,
        private authenticationService: AuthenticationService) {
            this.currentActiveProfile = authenticationService.currentUserValue;
    }

    ngOnInit() {
        this.fetchSTTF();
    }

    public fetchSTTF(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.sttService.fetchSTTF(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.sstFormList = response.data;
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public onChange(): any {
        if (this.selectedSTTFId === '') {
            this.formJson = undefined;
            this.dynamicForm = undefined;
            return;
        }
        this.spinnerService.show();
        this.sttService.fetchSTTFormDetail(this.selectedSTTFId)
            .pipe(first())
            .subscribe((response: any) => {
                let formDetail = response.data.formDetail;
                let formSection = response.data.formSection;
                this.formJson = {
                    sttfId: formDetail.sttfId,
                    sttfName: formDetail.sttfName,
                    description: {
                        controlId: this.commomService.uuid(),
                        controlOrder: 1,
                        fieldType: 'text',
                        fieldTitle: 'Description',
                        fieldName: 'description',
                        defaultValue: formDetail.description,
                        placeHolder: 'Enter Description Detail',
                        fieldWidth: 4,
                        fieldDisabled: true
                    },
                    homePage: {
                        controlId: this.commomService.uuid(),
                        controlOrder: 2,
                        fieldType: 'text',
                        fieldTitle: 'Home Page',
                        fieldName: 'homePage',
                        defaultValue: formDetail?.homePage?.description,
                        placeHolder: 'Enter Home Page Detail',
                        fieldWidth: 4,
                        fieldDisabled: true
                    },
                    serviceId: {
                        controlId: this.commomService.uuid(),
                        controlOrder: 3,
                        fieldType: 'text',
                        fieldTitle: 'ServiceId',
                        fieldName: 'serviceId',
                        defaultValue: formDetail?.serviceId,
                        placeHolder: 'Enter Service Id',
                        fieldWidth: 4,
                        fieldDisabled: true
                    },
                    sections: formSection.map((sectionPayload: any) => {
                        return {
                            auSttsId: sectionPayload.auSttsId,
                            sectionOder: sectionPayload.sectionOder,
                            sttsId: sectionPayload.section.sttsId,
                            sttsName: sectionPayload.section.sttsName,
                            fields: (!sectionPayload?.controlField ? [] : 
                                sectionPayload?.controlField
                                .map((field: any) => {
                                    return this.parseRawControl(field);
                                }))
                        };
                    })
                };
                this.initailZForm();
                console.log(this.dynamicForm.value);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    private parseRawControl(field: any): IControlField {
        if (field?.interaction) {
            if (field.interaction.disabledPattern) {
                field.interaction.disabledPattern = JSON.parse(field?.interaction.disabledPattern);
            }
            if (field.interaction.visiblePattern) {
                field.interaction.visiblePattern = JSON.parse(field?.interaction.visiblePattern);
            }
        }
        let fieldItem: IControlField = {
            controlId: field.sttcId,
            controlOrder: field.controlOrder,
            fieldType: field.fieldType.lookupValue,
            fieldTitle: field.fieldTitle,
            fieldName: field.fieldName,
            placeHolder: field.placeHolder,
            fieldWidth: field.fieldWidth,
            fieldLookUp: field?.fieldLookUp,
            defaultValue: field.sttcDefault.lookupValue ? field.defaultValue : '',
            fieldDisabled: field?.sttcDisabled.lookupValue ? field?.sttcDisabled.lookupValue : false,
            interaction: field?.interaction,
            validations: [],
        };
        // pattern use only for input,email,password
        if (field.pattern != '') {
            fieldItem.validations.push(
                this.addValidation(ValidationsType.PATTERN, field));
        }
        if (field.mandatory.lookupValue) {
            fieldItem.validations.push(
                this.addValidation(ValidationsType.REQUIRED, field));
        }
        if (field.minLength) {
            fieldItem.validations.push(
                this.addValidation(ValidationsType.MINT_LENGTH, field));
        }
        if (field.maxLength) {
            fieldItem.validations.push(
                this.addValidation(ValidationsType.MAX_LENGTH, field));
        }
        return fieldItem;
    }

    private addValidation(validationType: ValidationsType, field: any): IValidations {
        if (validationType === ValidationsType.PATTERN && field?.pattern) {
            return {
                name: this.commomService.uuid(),
                message: 'Field not match with pattern',
                validator: 'pattern',
                value: field?.pattern
            }
        } else if (validationType === ValidationsType.REQUIRED && field?.mandatory) {
            return {
                name: this.commomService.uuid(),
                message: 'Field is required',
                validator: 'required',
            }
        } else if (validationType === ValidationsType.MINT_LENGTH && field?.minLength) {
            return {
                name: this.commomService.uuid(),
                message: 'Field maximum length required ' + field?.minLength,
                validator: 'minlength',
                value: field?.minLength
            }
        } else if (validationType === ValidationsType.MAX_LENGTH && field?.maxLength) {
            return {
                name: this.commomService.uuid(),
                message: 'Field minimum length execed ' + field?.maxLength,
                validator: 'maxlength',
                value: field?.maxLength
            }
        } else if (validationType === ValidationsType.EMAIL && field) {
            return {
                name: this.commomService.uuid(),
                message: 'Email not valid',
                validator: 'email'
            }
        }
    }

    private initailZForm(): void {
        this.dynamicForm = this.fb.group({
            description: new FormControl(this.formJson.description.defaultValue),
            homePage: new FormControl(this.formJson.homePage.defaultValue),
            serviceId: new FormControl(this.formJson.serviceId.defaultValue)
        });
        // Loop through sections
        this.formJson.sections.forEach((section: any) => {
            let sectionGroup: FormGroup = this.fb.group({
                auSttsId: new FormControl(section.auSttsId),
                sectionId: new FormControl(section.sttsId),
                sectionName: new FormControl(section.sttsName),
            });
            // Loop through fields in the section
            let fieldsControls: FormGroup = this.fb.group({});
            section.fields.forEach((field: any) => {
                if (field.fieldLookUp && (field.fieldType === 'radio' || field.fieldType === 'checkbox')) {
                    this.fetchLookupTypeDetail(field);
                    for (let i=0; i<field.options.length; i++) {
                        if (field.defaultValue ===  field.options[i].lookupValue) {
                            fieldsControls.addControl(field.fieldName+"-"+i, new FormControl(field.defaultValue));
                        } else {
                            fieldsControls.addControl(field.fieldName+"-"+i, new FormControl());
                        }
                    }
                } else if (field.fieldLookUp && (field.fieldType === 'multi-select' || field.fieldType === 'select')) {
                    // call the api and fetch the data and assign to option
                    let controlValidators = this.controlValidators(field);
                    this.fetchLookupTypeDetail(field);
                    fieldsControls.addControl(field.fieldName, new FormControl(field.defaultValue, controlValidators));
                } else {
                    let controlValidators = this.controlValidators(field);
                    fieldsControls.addControl(field.fieldName, new FormControl(field.defaultValue, controlValidators));
                }
            });
            sectionGroup.addControl("fields", fieldsControls);
            this.dynamicForm.addControl("section-"+section.auSttsId, sectionGroup);
        });
    }

    private controlValidators(field: IControlField): any {
        let controlValidators = [];
        if (field.validations) {
            field.validations.forEach((validation: any) => {
                switch (validation.validator) {
                    case 'required':
                        controlValidators.push(Validators.required);
                        break;
                    case 'email':
                        controlValidators.push(Validators.email);
                        break;
                    case 'pattern':
                        controlValidators.push(Validators.pattern(validation.value));
                        break;
                    case 'minlength':
                        controlValidators.push(Validators.minLength(validation.value));
                        break;
                    case 'maxlength':
                        controlValidators.push(Validators.maxLength(validation.value));
                        break;
                }
            });
        }
        return controlValidators;
    }

    public fetchLookupTypeDetail(field: any): any {
        this.spinnerService.show();
        let payload = {
            lookupType: field.fieldLookUp,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            }
        }
        this.lookupService.fetchLookupByLookupType(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                field.options = response.data.subLookupData;
            }, (error: any) => {
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public getFormSection(sectionId: any): FormGroup {
        return this.dynamicForm.get(sectionId) as FormGroup;
    }

    public getFormSectionFiledGroup(sectionId: any): FormGroup {
        return this.getFormSection(sectionId).get('fields') as FormGroup;
    }

    public getSectionFiled(sectionId: any, field: any): FormControl {
        debugger
        return this.getFormSectionFiledGroup(sectionId).get(field.fieldName) as FormControl;
    }

    public getErrorMessage(sectionId: any, field: any): any {
        for (let validation of field.validations) {
          if (this.getSectionFiled(sectionId, field).hasError(validation.validator)) {
            return validation.message;
          }
        }
        return '';
    }

    public onSubmit(): any {
        console.log(this.dynamicForm.value);
    }

}