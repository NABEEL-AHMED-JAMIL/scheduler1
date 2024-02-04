import { SpinnerService } from '@/_helpers';
import { ApiCode, AuthResponse, 
    STTFormList, ISection, IControlFiled } from '@/_models';
import { AlertService, AuthenticationService, 
    CommomService, STTService } from '@/_services';
import { Component, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { first } from 'rxjs/operators';

@Component({
    selector: 'sttp-ground',
    templateUrl: 'sttp-ground.component.html'
})
export class SttpGroundComponent implements OnInit {

    public selectedSTTFId: any = '';
    public sttfJsonDetail: any;
    public formDetail: any;
    public currentActiveProfile: AuthResponse;
    public sstFormList: STTFormList[] = [];
    public sectionList: ISection[] = [];
    public dynamicForm: FormGroup;

    constructor(
        private sttService: STTService,
        private alertService: AlertService,
        private commomService: CommomService,
        private spinnerService: SpinnerService,
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
        this.spinnerService.show();
        this.sttService.fetchSTTFormDetail(this.selectedSTTFId)
            .pipe(first())
            .subscribe((response: any) => {
                this.sttfJsonDetail = response.data;
                this.formDetail = this.sttfJsonDetail.formDetail;
                this.sttfJsonDetail.formSection;
                // map the form section into form control
                this.sttfJsonDetail.formSection
                .forEach((sectionPayload: any) => {
                    this.sectionList.push(this.parseRawSection(sectionPayload));
                });
                console.log(this.sectionList);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public parseRawSection(formSection: any): ISection {
        let section: ISection = {
            sectionOder: formSection.sectionOder,
            sttsId: formSection.section.sttsId,
            sttsName: formSection.section.sttsName
        };
        let items: IControlFiled[] = [];
        formSection.controlFiled.forEach((controlFiled: any) => {
            items.push(this.parseRawControl(controlFiled));
        });
        section.fileds = items;
        return section;
    }

    public parseRawControl(filed: any): IControlFiled {
        let filedItem: IControlFiled = {
            controlId: filed.sttcId,
            controlOrder: filed.controlOrder,
            filedType: filed.filedType.lookupValue,
            filedTitle: filed.filedTitle,
            filedName: filed.filedName,
            placeHolder: filed.placeHolder,
            filedWidth: filed.filedWidth,
            defaultValue: filed.sttcDefault.lookupValue ? filed.sttcDefault.lookupValue : null,
            visible: filed?.interaction?.visiblePattern ? filed?.interaction?.visiblePattern : true,
            filedDisabled: filed?.interaction?.visiblePattern ? filed?.interaction?.visiblePattern : filed?.sttcDisabled.lookupValue,
            validations: []
        };
        return filedItem;
    }

    public onSubmit(): any {
        console.log(this.dynamicForm.value);
    }

}