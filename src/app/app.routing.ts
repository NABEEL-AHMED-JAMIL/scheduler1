import { Routes, RouterModule } from '@angular/router';
import { AuthGuard } from './_helpers';
import {
    HomeComponent,
    SettingComponent,
    JobComponent,
    SourceJobComponent,
    TaskComponent,
    QueueMessageComponent,
    SourceTaskComponent,
    SourceBatchActionComponent,
    XmlConfigurationComponent,
    SubLookupComponent,
    JobHistoryActionComponent,
    JobLogComponent,
    SearchEngineComponent,
    LoginComponent,
    ObjectBrowserComponent
} from './_component/index';


/**
 * @author Nabeel Ahmed
 */
const routes: Routes = [
    {
        path: 'login',
        component: LoginComponent
    },
    {
        path: 'home',
        component: HomeComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'taskList',
        component: SourceTaskComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'taskList/taskBatchAction',
        component: SourceBatchActionComponent,
        canActivate: [AuthGuard],
        data: {
            router: '/taskList',
            action: 'sourceTask'
        }
    },
    {
        path: 'addTask',
        component: TaskComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'editTask/:taskDetailId',
        component: TaskComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'jobList',
        component: SourceJobComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'jobList/jobBatchAction',
        component: SourceBatchActionComponent,
        canActivate: [AuthGuard],
        data: {
            router: '/jobList',
            action: 'sourceJob'
        }
    },
    {
        path: 'jobList/jobHistory',
        component: JobHistoryActionComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'jobList/jobLogs',
        component: JobLogComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'addJob',
        component: JobComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'editJob/:jobId',
        component: JobComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'setting',
        component: SettingComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'setting/subLookup',
        component: SubLookupComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'setting/queueMessage',
        component: QueueMessageComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'setting/lookpXml',
        component: XmlConfigurationComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'setting/searchEngine',
        component: SearchEngineComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'objectBrowser',
        component: ObjectBrowserComponent,
        canActivate: [AuthGuard]
    },
    {
        path: '**',
        redirectTo: 'home'
    }
];

export const AppRoutingModule = RouterModule.forRoot(routes);