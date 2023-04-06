import { Routes, RouterModule } from '@angular/router';
import {
    HomeComponent, SettingComponent, JobComponent,
    SourceJobComponent, TaskComponent, QueueMessageComponent,
    SourceTaskComponent, SourceBatchActionComponent,
    XmlConfigurationComponent, SubLookupComponent,
    JobHistoryActionComponent, JobLogComponent,
    SearchEngineComponent
} from './_component/index';

const routes: Routes = [
    { 
        path: 'home',
        component: HomeComponent
    },
    { 
        path: 'taskList',
        component: SourceTaskComponent,
        children: [
            { 
                path: 'taskBatchAction',
                component: SourceBatchActionComponent,
                data: {
                    router:  '/taskList',
                    action: 'sourceTask'
                }
            }
        ]
    },
    { 
        path: 'addTask',
        component: TaskComponent
    },
    { 
        path: 'editTask/:taskDetailId',
        component: TaskComponent
    },
    {
        path: 'jobList',
        component: SourceJobComponent,
        children: [
            { 
                path: 'jobBatchAction',
                component: SourceBatchActionComponent,
                data: {
                    router:  '/jobList',
                    action: 'sourceJob'
                }
            }
        ]
    },
    { 
        path: 'jobList/jobHistory',
        component: JobHistoryActionComponent
    },
    { 
        path: 'jobList/jobLogs',
        component: JobLogComponent
    },
    {
        path: 'addJob',
        component: JobComponent
    },
    {
        path: 'editJob/:jobId',
        component: JobComponent
    },
    { 
        path: 'setting',
        component: SettingComponent
    },
    { 
        path: 'setting/subLookup',
        component: SubLookupComponent
    },
    { 
        path: 'setting/queueMessage',
        component: QueueMessageComponent
    },
    { 
        path: 'setting/lookpXml',
        component: XmlConfigurationComponent
    },
    { 
        path: 'setting/searchEngine',
        component: SearchEngineComponent
    },
    { 
        path: '**',
        redirectTo: 'home'
    }
];

export const appRoutingModule = RouterModule.forRoot(routes);