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
    XmlConfigurationComponent,
    SubLookupComponent,
    JobHistoryActionComponent,
    JobLogComponent,
    SearchEngineComponent,
    QueryEngineComponent,
    LoginComponent,
    ObjectBrowserComponent,
    PdfHighlighterComponent,
    PdfHighlighterDetailComponent,
    DynamicFormListComponent,
    CUDynamicFormComponent,
    FillDynamicFormComponent,
    DynamicFormSubmissionsComponent,
    ViewDynamicFormSubmissionComponent,
    AiAgentComponent,
    OllamaModelsComponent,
    ContentCleanerComponent,
    AudioTranscriptExtractorComponent,
    UnauthorizedComponent,
    TenantsComponent,
    UsersComponent,
    WelcomeComponent,
    DocumentConverterComponent
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

        path: 'setting/lookpXml',
        component: XmlConfigurationComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {

        path: 'setting/searchEngine',
        component: SearchEngineComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN'] }
    },
    {

        path: 'setting/queryEngine',
        component: QueryEngineComponent,
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
        path: 'dynamicForm',
        component: DynamicFormListComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'dynamicForm/new',
        component: CUDynamicFormComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'dynamicForm/edit/:dynamicFormId',
        component: CUDynamicFormComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'dynamicForm/fill/:dynamicFormId',
        component: FillDynamicFormComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'dynamicForm/fill/:dynamicFormId/edit/:submissionId',
        component: FillDynamicFormComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'dynamicForm/submissions/:dynamicFormId',
        component: DynamicFormSubmissionsComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'dynamicForm/submissions/:dynamicFormId/:submissionId',
        component: ViewDynamicFormSubmissionComponent,
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