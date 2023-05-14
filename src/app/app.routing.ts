import { Routes, RouterModule } from '@angular/router';
import {
    LoginComponent,
    RegisterComponent,
    ForgotPassComponent,
    ResetPassComponent,
    NotFoundComponent,
    BatchActionComponent,
    SettingLayoutComponent,
    LookupComponent,
    ProfileComponent,
    SttSettingComponent,
    CUSTTComponent,
    CUSTTFComponent,
    CUSTTSComponent,
    CUSTTCComponent,
    XmlConfigurationComponent,
    SearchEngineComponent,
    SubLookupComponent,
    BatchComponent,
    STTListComponent,
    STTFListComponent,
    STTSListComponent,
    STTCListComponent,
    STTLinkUserComponent,
    STTLinkSTTFComponent,
    STTFLinkSTTComponent,
    STTFLinkSTTSComponent,
    STTSLinkSTTFComponent,
    STTSLinkSTTCComponent,
    STTCLinkSTTSComponent,
} from '@/_component/index';
import { Action } from '@/_models';
import { AuthGuard } from '@/_helpers';

const routes: Routes = [

    { 
        path: '',
        pathMatch: 'full',
        redirectTo: 'profile'
    },
    {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'register',
        component: RegisterComponent
    },
    {
        path: 'forgotpass',
        component: ForgotPassComponent
    },
    {
        path: 'resetpass',
        component: ResetPassComponent
    },
    {
        path: 'profile',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data:  {
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER' ]
        },
        children: [
            { 
                path: '',
                component: ProfileComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'Profile',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER' ]
                }
            }
        ]
    },
    {
        path: 'lookup',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data:  {
            breadcrumb: 'Lookup',
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ],
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add Lookup',
                    active: true
                },
                {
                    type: 'menus',
                    title: 'Batch Operation',
                    active: true,
                    menus: [
                        {
                            title: 'Upload File',
                            router: '/lookup/batch',
                            active: true
                        },
                        {
                            title: 'Downalod File',
                            targetEvent: 'downloadData',
                            active: true
                        },
                        {
                            title: 'Downalod Template',
                            targetEvent: 'downloadTemplate',
                            active: true
                        }
                    ]
                }
            ]
        },
        children: [
            {
                path: '',
                component: LookupComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: '',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'batch',
                component: BatchActionComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'Lookup',
                    breadcrumb: 'Batch',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            }
        ]
    },
    {
        path: 'sublookup',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data:  {
            breadcrumb: 'Sub Lookup',
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ],
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add Lookup',
                    active: true
                },
                {
                    type: 'menus',
                    title: 'Batch Operation',
                    active: true,
                    menus: [
                        {
                            title: 'Upload File',
                            router: '/sublookup/batch',
                            active: true
                        },
                        {
                            title: 'Downalod File',
                            targetEvent: 'downloadData',
                            active: true
                        },
                        {
                            title: 'Downalod Template',
                            targetEvent: 'downloadTemplate',
                            active: true
                        }
                    ]
                }
            ]
        },
        children: [
            { 
                path: '',
                component: SubLookupComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'batch',
                component: BatchActionComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'SubLookup',
                    breadcrumb: 'Batch',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
        ]
    },
    {
        path: 'stt',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data:  {
            breadcrumb: 'Stt List',
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ],
            selectedMenu: {
                type: 1,
                title: 'STT',
                router: '/stt',
                active: true
            },
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add STT',
                    router: '/stt/addStt',
                    active: true
                },
                {
                    type: 'menus',
                    title: 'Batch Operation',
                    active: true,
                    menus: [
                        {
                            title: 'Upload File',
                            router: '/stt/batch',
                            active: true
                        },
                        {
                            title: 'Downalod File',
                            targetEvent: 'downloadData',
                            active: true
                        },
                        {
                            title: 'Downalod Template',
                            targetEvent: 'downloadTemplate',
                            active: true
                        }
                    ]
                }
            ]
        },
        children: [
            {
                path: '',
                component: STTListComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'View Linked Users',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/stt/sttLinkUser',
                            active: true
                        },
                        {
                            title: 'View Linked Forms',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/stt/sttLinkSttf',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'addStt',
                component: CUSTTComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Stt',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'editStt',
                component: CUSTTComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Stt',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttLinkUser',
                component: STTLinkUserComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STT Link User',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link User',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttLinkSttf',
                component: STTLinkSTTFComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STT Link STTF',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STTF',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'batch',
                component: BatchComponent,
                data: {
                    title: 'Batch',
                    action: 'SourceTaskType',
                    breadcrumb: 'Batch Stt',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            }
        ]
    },
    {
        path: 'sttf',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data:  {
            breadcrumb: 'Sttf List',
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ],
            selectedMenu: {
                type: 2,
                title: 'STT Form',
                router: '/sttf',
                active: true
            },
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add STTF',
                    router: '/sttf/addSttf',
                    active: true
                },
                {
                    type: 'menus',
                    title: 'Batch Operation',
                    active: true,
                    menus: [
                        {
                            title: 'Upload File',
                            router: '/sttf/batch',
                            active: true
                        },
                        {
                            title: 'Downalod File',
                            targetEvent: 'downloadData',
                            active: true
                        },
                        {
                            title: 'Downalod Template',
                            targetEvent: 'downloadTemplate',
                            active: true
                        }
                    ]
                }
            ]
        },
        children: [
            {
                path: '',
                component: STTFListComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'View Linked STT',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/sttf/sttfLinkStt',
                            active: true
                        },
                        {
                            title: 'View Linked STTS',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/sttf/sttfLinkStts',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'addSttf',
                component: CUSTTFComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Sttf',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'editSttf',
                component: CUSTTFComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Sttf',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttfLinkStt',
                component: STTFLinkSTTComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STTF Link STT',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STT',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttfLinkStts',
                component: STTFLinkSTTSComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STTF Link STTS',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STTS',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'batch',
                component: BatchComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'SourceTaskTypeForm',
                    breadcrumb: 'Batch Sttf',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            }
        ]
    },
    {
        path: 'stts',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data:  {
		    breadcrumb: 'Sttf List',
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ],
            selectedMenu: {
                type: 3,
                title: 'STT Section',
                router: '/stts',
                active: true
            },
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add STTS',
                    router: '/stts/addStts',
                    active: true
                },
                {
                    type: 'menus',
                    title: 'Batch Operation',
                    active: true,
                    menus: [
                        {
                            title: 'Upload File',
                            router: '/stts/batch',
                            active: true
                        },
                        {
                            title: 'Downalod File',
                            targetEvent: 'downloadData',
                            active: true
                        },
                        {
                            title: 'Downalod Template',
                            targetEvent: 'downloadTemplate',
                            active: true
                        }
                    ]
                }
            ]
        },
        children: [
            {
                path: '',
                component: STTSListComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'View Linked STTF',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/stts/sttsLinkSttf',
                            active: true
                        },
                        {
                            title: 'View Linked STTC',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/stts/sttsLinkSttc',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
			{
                path: 'addStts',
                component: CUSTTSComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Stts',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'editStts',
                component: CUSTTSComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Stts',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttsLinkSttf',
                component: STTSLinkSTTFComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STTS Link STTF',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STTS To STTF',
                            router: '/stt/addStt',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttsLinkSttc',
                component: STTSLinkSTTCComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STTS Link STTC',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STTS To STTC',
                            router: '/stt/addStt',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'batch',
                component: BatchComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'SourceTaskTypeSection',
                    breadcrumb: 'Batch Stts',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            }
        ]
    },
    { 
        path: 'sttc',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data:  {
		    breadcrumb: 'Sttc List',
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ],
            selectedMenu: {
                type: 4,
                router: '/sttc',
                title: 'STT Control',
                active: true
            },
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add STTC',
                    router: '/sttc/addSttc',
                    active: true
                },
                {
                    type: 'menus',
                    title: 'Batch Operation',
                    active: true,
                    menus: [
                        {
                            title: 'Upload File',
                            router: '/sttc/batch',
                            active: true
                        },
                        {
                            title: 'Downalod File',
                            targetEvent: 'downloadData',
                            active: true
                        },
                        {
                            title: 'Downalod Template',
                            targetEvent: 'downloadTemplate',
                            active: true
                        }
                    ]
                }
            ]
        },
        children: [
            {
                path: '',
                component: STTCListComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'View Linked STTS',
                            icon: 'glyphicon glyphicon-tasks',
                            router: '/sttc/sttcLinkStts',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'addSttc',
                component: CUSTTCComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Sttc',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'editSttc',
                component: CUSTTCComponent,
                canActivate: [AuthGuard],
                data:  {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Sttc',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            {
                path: 'sttcLinkStts',
                component: STTCLinkSTTSComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'STTC Link STTS',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STTC To STTS',
                            router: '/stt/addStt',
                            active: true
                        }
                    ],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'batch',
                component: BatchComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'SourceTaskTypeControl',
                    breadcrumb: 'Batch Sttc',
                    topHeader: [],
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            }
        ]
    },
    { 
        path: 'searchengine',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data:  {
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
        },
        children: [
            { 
                path: '',
                component: SearchEngineComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'Search Engine',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            }
        ]
    },
    { 
        path: 'xmlconfig',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data:  {
            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER' ]
        },
        children: [
            { 
                path: '',
                component: XmlConfigurationComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'XML Config',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER' ]
                }
            }
        ]
    },
    {
        path: '404',
        component: NotFoundComponent
    },
    {
        path: '**',
        redirectTo: '/404'
    }
];

export const appRoutingModule = RouterModule.forRoot(routes);