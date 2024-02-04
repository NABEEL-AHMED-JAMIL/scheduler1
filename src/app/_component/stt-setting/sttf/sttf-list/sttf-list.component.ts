import { Component, OnInit } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { first } from 'rxjs/operators';
import { saveAs } from 'file-saver';
import {
    AuthenticationService, AlertService,
    STTService, CommomService
} from '@/_services';
import { SpinnerService } from '@/_helpers';
import { AuthResponse, ApiCode, STTFormList } from '@/_models/index';
import { FormArray, FormBuilder, FormControl, FormGroup } from '@angular/forms';


@Component({
    selector: 'sttf-list',
    templateUrl: 'sttf-list.component.html'
})
export class STTFListComponent implements OnInit {

    public title: any = 'Delete STTF';
    public subTitle: any = 'Note :- Delete opertaion may case problem for job';

    public searchSTTF: any = '';
    public sstForm: STTFormList;
    public sstFormList: STTFormList[] = [];
    public pageOfSSTs: Array<STTFormList>;
    public sttfJsonDetail: any;

    public addButton: any;
    public refreshButton: any;
    public dropdownButton: any;
    public topHeader: any = [];
    public actionMenu: any = [];
    public currentActiveProfile: AuthResponse;
    public sttcInteractonForm: FormGroup;

    constructor(
        public fb: FormBuilder,
        private router: Router,
        private route: ActivatedRoute,
        private alertService: AlertService,
        private commomService: CommomService,
        private spinnerService: SpinnerService,
        private authenticationService: AuthenticationService,
        private sttService: STTService) {
        this.currentActiveProfile = authenticationService.currentUserValue;
        this.route.data.subscribe((data: any) => {
            this.topHeader = data.topHeader;
            this.actionMenu = data.action;
            if (this.topHeader) {
                this.topHeader.forEach(header => {
                    if (header.type === 'add') {
                        this.addButton = header;
                    } else if (header.type === 'refresh') {
                        this.refreshButton = header;
                    } else if (header.type === 'menus') {
                        this.dropdownButton = header;
                        this.dropdownButton.menus = this.dropdownButton.menus
                            .filter((menu: any) => {
                                return menu.active;
                            });
                    }
                });
            }
        });
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

    public menuAction(menu: any, payload: any): any {
        if (menu.router) {
            if (payload) {
                this.router.navigate(
                    [menu.router],
                    {
                        queryParams: {
                            sttfId: payload.sttfId
                        }
                    });
            } else {
                this.router.navigate([menu.router]);
            }
        } else if (menu.targetEvent) {
            if (menu.targetEvent === 'downloadData') {
                this.downloadData();
            } else if (menu.targetEvent === 'downloadTemplate') {
                this.downloadTemplate();
            }
        }
    }

    public addAction(): void {
        this.router.navigate([this.addButton.router]);
    }

    public editAction(payload: any): void {
        this.router.navigate(
            ['/sttf/editSttf'],
            {
                queryParams: {
                    sttfId: payload.sttfId
                }
            });
    }

    public viewAction(payload: any ): void {
        this.spinnerService.show();
        this.sttService.fetchSTTFormDetail(payload.sttfId)
            .pipe(first())
            .subscribe((response: any) => {
                this.sttfJsonDetail = response.data;
                this.sttcInteractonForm = this.fb.group({
                    sttfId: new FormControl(this.sttfJsonDetail.formDetail.sttfId),
                    groups: this.fb.array([])
                });
                this.sttfJsonDetail.formSection.forEach((sectionPayload: any) => {
                    const groupForm = this.fb.group({
                        auSttsId: sectionPayload.auSttsId,
                        groupName: sectionPayload.section.sttsName,
                        filedItem: this.fb.array([])
                    });
                    if (sectionPayload?.controlFiled) {
                        const filedItemFormArray = groupForm.get('filedItem') as FormArray;
                        sectionPayload?.controlFiled.forEach(filedControl => {
                            filedItemFormArray.push(this.buildItem(filedControl));
                        });
                    }
                    (this.sttcInteractonForm.get('groups') as FormArray).push(groupForm);
                });
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }
    
    public buildItem(filedControl: any): any {
        return new FormGroup({
            sttcId: new FormControl(filedControl?.sttcId),
            sttcName: new FormControl(filedControl?.sttcName),
            filedTitle: new FormControl(filedControl?.filedTitle),
            filedType: new FormControl(filedControl?.filedType?.description),
            interactionsId: new FormControl(filedControl?.interaction?.interactionsId),
            visiblePattern: new FormControl(filedControl?.interaction?.visiblePattern),
            disabledPattern: new FormControl(filedControl?.interaction?.disabledPattern)
        });
    }

    public get filedItemFormArray() {
        return (this.sttcInteractonForm.get('groups') as FormArray)
            .controls.map(group => group.get('filedItem') as FormArray);
    }

    public refreshAction(): void {
        this.fetchSTTF();
    }

    public deleteAction(payload: any): void {
        this.sstForm = payload;
    }

    public deleteActionTriger(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            sttfId: this.sstForm.sttfId
        }
        this.sttService.deleteSTTF(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.spinnerService.hide();
                if (response.status === ApiCode.ERROR) {
                    this.alertService.showError(response.message, ApiCode.ERROR);
                    return;
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.refreshAction();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error.message, ApiCode.ERROR);
            });
    }

    public downloadData(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            downloadType: 'SourceTaskTypeForm'
        }
        this.sttService.downloadSTTCommon(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.commomService.downLoadFile(response);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public downloadTemplate(): void {
        this.spinnerService.show();
        let payload = {
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
            downloadType: 'SourceTaskTypeForm'
        }
        this.sttService.downloadSTTCommonTemplateFile(payload)
            .pipe(first())
            .subscribe((response: any) => {
                this.commomService.downLoadFile(response);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public downloadJson(): void {
        const file = new Blob([JSON.stringify(this.sttfJsonDetail)], { type: 'text/json' });
        saveAs(file, 'Form-Json-Config ' + this.uuid() + '.json');
    }

    public onChangePage(pageOfSSTs: Array<any>) {
        // update current page of items
        this.pageOfSSTs = pageOfSSTs;
    }

    public uuid(): string {
        return 'xxxxx-xxxxxx'.replace(/[xy]/g, (char) => {
          let random = Math.random() * 16 | 0;
          let value = char === "x" ? random : (random % 4 + 8);
          return value.toString(16);
        });
    }

    public addSTTCInteractions(auSttsId: any, interactions: any): any {
        this.spinnerService.show();
        let payload = {
            auSttsId: auSttsId,
            ...interactions,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
        };
        this.sttService.addSTTCInteractions(payload)
            .pipe(first())
            .subscribe((response: any) => {
                let payload = {
                    sttfId: this.sttfJsonDetail.formDetail.sttfId
                }
                debugger
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.viewAction(payload);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

    public deleteSTTCInteractions(auSttsId: any, interactions: any): any {
        this.spinnerService.show();
        let payload = {
            auSttsId: auSttsId,
            ...interactions,
            accessUserDetail: {
                appUserId: this.currentActiveProfile.appUserId,
                username: this.currentActiveProfile.username
            },
        };
        this.sttService.deleteSTTCInteractions(payload)
            .pipe(first())
            .subscribe((response: any) => {
                let payload = {
                    sttfId: this.sttfJsonDetail.formDetail.sttfId
                }
                this.alertService.showSuccess(response.message, ApiCode.SUCCESS);
                this.viewAction(payload);
                this.spinnerService.hide();
            }, (error: any) => {
                this.spinnerService.hide();
                this.alertService.showError(error, ApiCode.ERROR);
            });
    }

}