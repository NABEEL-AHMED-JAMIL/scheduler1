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
    STTCListComponent
} from '@/_component/index';
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
        children: [
            { 
                path: '',
                component: ProfileComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'Profile',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN', 'ROLE_USER' ]
                }
            },
            {
                path: 'lookup',
                component: LookupComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'Lookup',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'lookupBatch',
                component: BatchActionComponent,
                data: {
                    action: 'Lookup',
                    breadcrumb: 'Lookup Batch',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'sublookup',
                component: SubLookupComponent,
                canActivate: [AuthGuard],
                data: {
                    action: 'SubLookup',
                    breadcrumb: 'Sub Lookup',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'sublookupBatch',
                component: BatchActionComponent,
                data: {
                    action: 'SubLookup',
                    breadcrumb: 'Sub Lookup Batch',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            { 
                path: 'sourcetask',
                component: SttSettingComponent,
                canActivate: [AuthGuard],
                data:  {
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                },
                children: [
                    {
                        path: 'sstList',
                        component: STTListComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Stt List',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'sstfList',
                        component: STTFListComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Sttf List',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'sstsList',
                        component: STTSListComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Stts List',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'sstcList',
                        component: STTCListComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Sttc List',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'addStt',
                        component: CUSTTComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Add Stt',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'editStt',
                        component: CUSTTComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Edit Stt',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'addSttf',
                        component: CUSTTFComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Add Sttf',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'editSttf',
                        component: CUSTTFComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Edit Sttf',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'addStts',
                        component: CUSTTSComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Add Stts',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'editStts',
                        component: CUSTTSComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Edit Stts',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'addSttc',
                        component: CUSTTCComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Add Sttc',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'editSttc',
                        component: CUSTTCComponent,
                        canActivate: [AuthGuard],
                        data:  {
                            breadcrumb: 'Edit Sttc',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                    {
                        path: 'batch',
                        component: BatchComponent,
                        canActivate: [AuthGuard],
                        data: {
                            action: 'batch',
                            breadcrumb: 'Batch',
                            role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                        }
                    },
                ]
            },
            { 
                path: 'searchengine',
                component: SearchEngineComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'Search Engine',
                    role: [ 'ROLE_MASTER_ADMIN', 'ROLE_ADMIN' ]
                }
            },
            // { 
            //     path: 'queuemessage',
            //     component: QueueMessageComponent,
            //     canActivate: [AuthGuard],
            //     data:  {
            //         breadcrumb: 'Queue Message',
            //         role: [
            //             'ROLE_MASTER_ADMIN',
            //             'ROLE_ADMIN',
            //             'ROLE_USER'
            //         ]
            //     }
            // },
            { 
                path: 'xml-config',
                component: XmlConfigurationComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'XML Config',
                    role: [
                        'ROLE_MASTER_ADMIN',
                        'ROLE_ADMIN',
                        'ROLE_USER'
                    ]
                }
            }
        ]
    },
    // { 
    //     path: 'home',
    //     component: HomeComponent,
    //     canActivate: [AuthGuard]
    // },
    // { 
    //     path: 'taskList',
    //     component: SourceTaskComponent,
    //     canActivate: [AuthGuard],
    //     children: [
    //         { 
    //             path: 'taskBatchAction',
    //             component: SourceBatchActionComponent,
    //             canActivate: [AuthGuard],
    //             data: {
    //                 router:  '/taskList',
    //                 action: 'sourceTask'
    //             }
    //         }
    //     ]
    // },
    // { 
    //     path: 'addTask',
    //     component: TaskComponent,
    //     canActivate: [AuthGuard],
    // },
    // { 
    //     path: 'editTask/:taskDetailId',
    //     component: TaskComponent,
    //     canActivate: [AuthGuard],
    // },
    // {
    //     path: 'jobList',
    //     component: SourceJobComponent,
    //     children: [
    //         { 
    //             path: 'jobBatchAction',
    //             component: SourceBatchActionComponent,
    //             canActivate: [AuthGuard],
    //             data: {
    //                 router:  '/jobList',
    //                 action: 'sourceJob'
    //             }
    //         }
    //     ]
    // },
    // { 
    //     path: 'jobList/jobHistory',
    //     component: JobHistoryActionComponent,
    //     canActivate: [AuthGuard],
    // },
    // { 
    //     path: 'jobList/jobLogs',
    //     component: JobLogComponent,
    //     canActivate: [AuthGuard],
    // },
    // {
    //     path: 'addJob',
    //     component: JobComponent,
    //     canActivate: [AuthGuard],
    // },
    // {
    //     path: 'editJob/:jobId',
    //     component: JobComponent,
    //     canActivate: [AuthGuard],
    // },
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