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
    TaskTypeSettingComponent,
    XmlConfigurationComponent,
    SearchEngineComponent,
    SubLookupComponent
} from './_component/index';
import { AuthGuard } from './_helpers';

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
                component: TaskTypeSettingComponent,
                canActivate: [AuthGuard],
                data:  {
                    breadcrumb: 'Sourcetask',
                    role: [
                        'ROLE_MASTER_ADMIN',
                        'ROLE_ADMIN'
                    ]
                }
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