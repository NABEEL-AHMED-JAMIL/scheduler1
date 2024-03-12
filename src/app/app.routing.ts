import { Routes, RouterModule } from '@angular/router';
import {
    LoginComponent,
    RegisterComponent,
    ForgotPassComponent,
    ResetPassComponent,
    HomeComponent,
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
    JobReportComponent,
    JobQueueComponent,
    SearchEngineComponent,
    SubLookupComponent,
    BatchComponent,
    STTListComponent,
    STTFListComponent,
    STTSListComponent,
    STTCListComponent,
    STTLinkUserComponent,
    STTFLinkSTTComponent,
    STTSLinkSTTFComponent,
    STTSLinkSTTCComponent,
    STTCLinkSTTSComponent,
    CuCredentialComponent,
    CredentialListComponent,
    ManageUserComponent,
    STTFLinkSTTSComponent,
    STTLinkSTTFComponent,
    NotifactionComponent,
    SttpGroundComponent,
    ListSourceTaskComponent,
    CuSourceTaskComponent,
    CuSourceJobComponent,
    ListSourceJobComponent,
    EnvUsersComponent,
} from '@/_component/index';
import { Action } from '@/_models';
import { AuthGuard } from '@/_helpers';

const routes: Routes = [

    {
        path: '',
        pathMatch: 'full',
        redirectTo: 'home'
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
        path: 'home',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: '',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
        },
        children: [
            {
                path: '',
                component: HomeComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'profile',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Profile',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
        },
        children: [
            {
                path: '',
                component: ProfileComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            },
            {
                path: 'batch',
                component: BatchActionComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'AppUser',
                    breadcrumb: 'Batch',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'manageUser',
                component: ManageUserComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'ManageUser',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'New Account',
                            active: true
                        },
                        {
                            type: 'menus',
                            title: 'Batch Operation',
                            active: true,
                            menus: [
                                {
                                    title: 'Upload File',
                                    router: '/profile/batch',
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
                    ],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'notifaction',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Notifaction',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER'],
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                }
            ]
        },
        children: [
            {
                path: '',
                component: NotifactionComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'lookup',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Lookup',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'batch',
                component: BatchActionComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'Lookup',
                    breadcrumb: 'Batch',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'sublookup',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Sub Lookup',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'batch',
                component: BatchActionComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'SubLookup',
                    breadcrumb: 'Batch',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
        ]
    },
    {
        path: 'envUsers',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Env Users',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
            ]
        },
        children: [
            {
                path: '',
                component: EnvUsersComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'stt',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Stt List',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
                data: {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'Linked Users',
                            icon: 'glyphicon glyphicon-user',
                            router: '/stt/sttLinkUser',
                            active: true
                        },
                        {
                            title: 'Linked Form',
                            icon: 'glyphicon glyphicon-link',
                            router: '/stt/sttLinkForm',
                            active: true
                        }
                    ],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'addStt',
                component: CUSTTComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Stt',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'editStt',
                component: CUSTTComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Stt',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttLinkUser',
                component: STTLinkUserComponent,
                canActivate: [AuthGuard],
                data: {
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttLinkForm',
                component: STTLinkSTTFComponent,
                canActivate: [AuthGuard],
                data: {
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'sttf',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Sttf List',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
                data: {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'Linked STT',
                            icon: 'glyphicon glyphicon-link',
                            router: '/sttf/sttfLinkStt',
                            active: true
                        },
                        {
                            title: 'Linked Section',
                            icon: 'glyphicon glyphicon-link',
                            router: '/sttf/sttfLinkStts',
                            active: true
                        }
                    ],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'addSttf',
                component: CUSTTFComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Sttf',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'editSttf',
                component: CUSTTFComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Sttf',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttfLinkStt',
                component: STTFLinkSTTComponent,
                canActivate: [AuthGuard],
                data: {
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttfLinkStts',
                component: STTFLinkSTTSComponent,
                canActivate: [AuthGuard],
                data: {
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'stts',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Sttf List',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
                data: {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'Linked STTF',
                            icon: 'glyphicon glyphicon-link',
                            router: '/stts/sttsLinkSttf',
                            active: true
                        },
                        {
                            title: 'Linked Control',
                            icon: 'glyphicon glyphicon-link',
                            router: '/stts/sttLinkControl',
                            active: true
                        }

                    ],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'addStts',
                component: CUSTTSComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Stts',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'editStts',
                component: CUSTTSComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Stts',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttsLinkSttf',
                component: STTSLinkSTTFComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'STTS Link STTF',
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttLinkControl',
                component: STTSLinkSTTCComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'STTS Link STTC',
                    topHeader: [
                        {
                            type: 'refresh',
                            title: 'Refresh',
                            active: true
                        },
                        {
                            type: 'add',
                            title: 'Link STTC',
                            active: true
                        }
                    ],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'sttc',
        component: SttSettingComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Sttc List',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
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
                data: {
                    breadcrumb: '',
                    action: [
                        {
                            title: 'Linked STTS',
                            icon: 'glyphicon glyphicon-link',
                            router: '/sttc/sttcLinkStts',
                            active: true
                        }
                    ],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'addSttc',
                component: CUSTTCComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add Sttc',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'editSttc',
                component: CUSTTCComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Sttc',
                    topHeader: [],
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'sttcLinkStts',
                component: STTCLinkSTTSComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'STTC Link STTS',
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
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
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'sttp',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'PlayGround',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
        },
        children: [
            {
                path: '',
                component: SttpGroundComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'sourceJob',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Source Job',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER'],
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add Source Job',
                    router: '/sourceJob/addSourceJob',
                    active: true
                }
            ]
        },
        children: [
            {
                path: '',
                component: ListSourceJobComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            },
            {
                path: 'addSourceJob',
                component: CuSourceJobComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add SourceJob',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            },
            {
                path: 'editSourceJob',
                component: CuSourceJobComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit SourceJob',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'sourceTask',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Source Task',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER'],
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add Source Task',
                    router: '/sourceTask/addSourceTask',
                    active: true
                }
            ]
        },
        children: [
            {
                path: '',
                component: ListSourceTaskComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            },
            {
                path: 'addSourceTask',
                component: CuSourceTaskComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add',
                    action: Action.ADD,
                    breadcrumb: 'Add SourceTask',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            },
            {
                path: 'editSourceTask',
                component: CuSourceTaskComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit',
                    action: Action.EDIT,
                    breadcrumb: 'Edit SourceTask',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'credential',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            breadcrumb: 'Credential',
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN'],
            topHeader: [
                {
                    type: 'refresh',
                    title: 'Refresh',
                    active: true
                },
                {
                    type: 'add',
                    title: 'Add Credential',
                    router: '/credential/addCred',
                    active: true
                }
            ]
        },
        children: [
            {
                path: '',
                component: CredentialListComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: '',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'addCred',
                component: CuCredentialComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Add Credential',
                    action: Action.ADD,
                    breadcrumb: 'Add Credential',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            },
            {
                path: 'editCred',
                component: CuCredentialComponent,
                canActivate: [AuthGuard],
                data: {
                    title: 'Edit Credential',
                    action: Action.EDIT,
                    breadcrumb: 'Edit Credential',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN']
                }
            }
        ]
    },
    {
        path: 'searchengine',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            role: ['ROLE_MASTER_ADMIN']
        },
        children: [
            {
                path: '',
                component: SearchEngineComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'Search Engine',
                    role: ['ROLE_MASTER_ADMIN']
                }
            }
        ]
    },
    {
        path: 'xmlconfig',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
        },
        children: [
            {
                path: '',
                component: XmlConfigurationComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'XML Config',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'jobReport',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
        },
        children: [
            {
                path: '',
                component: JobReportComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'Job Report',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
                }
            }
        ]
    },
    {
        path: 'jobQueue',
        component: SettingLayoutComponent,
        canActivate: [AuthGuard],
        data: {
            role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
        },
        children: [
            {
                path: '',
                component: JobQueueComponent,
                canActivate: [AuthGuard],
                data: {
                    breadcrumb: 'View Queue',
                    role: ['ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER']
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