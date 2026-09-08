import { Routes, RouterModule } from '@angular/router';
import { AuthGuard, RoleGuard } from './_helpers';
import {
    HomeComponent,
    SettingComponent,
    SettingLookupComponent,
    JobComponent,
    SourceJobComponent,
    TaskComponent,
    QueueMessageComponent,
    SourceTaskComponent,
    SourceBatchActionComponent,
    SubLookupComponent,
    JobHistoryActionComponent,
    JobLogComponent,
    LoginComponent,
    ObjectBrowserComponent,
    PdfHighlighterComponent,
    PdfHighlighterDetailComponent,
    AiAgentComponent,
    OllamaModelsComponent,
    ContentCleanerComponent,
    AudioTranscriptExtractorComponent,
    UnauthorizedComponent,
    TenantsComponent,
    UsersComponent,
    WelcomeComponent,
    DocumentConverterComponent,
    NotificationCenterComponent,
    StorageConnectionComponent
} from './_component/index';

const routes: Routes = [
    {

        path: '',
        pathMatch: 'full',
        component: WelcomeComponent
    },
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
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {

        path: 'setting/storageConnection',
        component: StorageConnectionComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {

        path: 'setting/lookup',
        component: SettingLookupComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {

        path: 'setting/subLookup',
        component: SubLookupComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {

        path: 'setting/queueMessage',
        component: QueueMessageComponent,
        canActivate: [AuthGuard]
    },
    {

        path: 'tenants',
        component: TenantsComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN'] }
    },
    {

        path: 'users',
        component: UsersComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {
        path: 'unauthorized',
        component: UnauthorizedComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'objectBrowser',
        component: ObjectBrowserComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'notifications',
        component: NotificationCenterComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'pdfHighlighter',
        component: PdfHighlighterComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'pdfHighlighter/new',
        component: PdfHighlighterDetailComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'pdfHighlighter/:pdfHighlighterTaskId',
        component: PdfHighlighterDetailComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'aiAgent',
        component: AiAgentComponent,
        canActivate: [AuthGuard]
    },
    {

        path: 'ollamaModels',
        component: OllamaModelsComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {
        path: 'contentCleaner',
        component: ContentCleanerComponent,
        canActivate: [AuthGuard]
    },
    {

        path: 'documentConverter',
        component: DocumentConverterComponent,
        canActivate: [AuthGuard]
    },
    {

        path: 'audioTranscriptExtractor',
        component: AudioTranscriptExtractorComponent,
        canActivate: [AuthGuard]
    },
    {
        path: '**',
        redirectTo: 'home'
    }
];

export const AppRoutingModule = RouterModule.forRoot(routes);