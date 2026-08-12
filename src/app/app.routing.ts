import { Routes, RouterModule } from '@angular/router';
import { AuthGuard, RoleGuard } from './_helpers';
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
    ImageTextExtractorComponent,
    AiChatComponent,
    CvTailorComponent,
    UnauthorizedComponent,
    TenantsComponent,
    UsersComponent,
    WelcomeComponent
} from './_component/index';


/**
 * @author Nabeel Ahmed
 */
const routes: Routes = [
    {
        // Public landing page -- no AuthGuard on purpose, this is the app's marketing/overview
        // page for a visitor who isn't logged in yet. WelcomeComponent itself bounces an
        // already-logged-in visitor straight to /home (see its ngOnInit) rather than needing a
        // second guard here.
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
        // TENANT_ADMIN+ -- backs SettingRestApi (appSetting/addSourceTaskType/lookups/etc.),
        // which is TENANT_ADMIN-gated server-side. Was AuthGuard-only (any logged-in user could
        // reach it and its API calls would just 403) until that server-side gating existed.
        path: 'setting',
        component: SettingComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {
        // TENANT_ADMIN+ -- backs SettingRestApi.deleteLookupData/fetchSubLookupByParentId
        path: 'setting/subLookup',
        component: SubLookupComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {
        // TENANT_USER+ -- backs MessageQRestApi (operational, not admin config)
        path: 'setting/queueMessage',
        component: QueueMessageComponent,
        canActivate: [AuthGuard]
    },
    {
        // TENANT_ADMIN+ -- backs SettingRestApi.xmlCreateChecker (used from the Task
        // add/edit form's XML tag builder, itself TENANT_ADMIN-gated)
        path: 'setting/lookpXml',
        component: XmlConfigurationComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN', 'TENANT_ADMIN'] }
    },
    {
        // PLATFORM_ADMIN only -- backs SettingRestApi.dynamicQueryResponse, which runs the
        // request body's query string as arbitrary SQL (bypasses tenant scoping entirely) --
        // see that method's own javadoc. Stricter than the rest of /setting/** on purpose.
        // NOTE: unrelated to Query Engine below -- this is a separate, pre-existing admin-only
        // debug console against the app's own database, not touched by that redesign.
        path: 'setting/searchEngine',
        component: SearchEngineComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN'] }
    },
    {
        // TENANT_USER+ -- backs QueryEngineRestApi. Same split as /aiAgent: reachable by any
        // authenticated tenant user, individual write actions (add/edit/delete a connection or
        // query) are TENANT_ADMIN-gated server-side, not at the route level.
        path: 'setting/queryEngine',
        component: QueryEngineComponent,
        canActivate: [AuthGuard]
    },
    {
        // PLATFORM_ADMIN only -- provisioning/renaming/suspending tenants
        path: 'tenants',
        component: TenantsComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { roles: ['PLATFORM_ADMIN'] }
    },
    {
        // TENANT_ADMIN+ -- a Tenant Admin only sees/manages their own tenant's users
        // (enforced server-side, see AppUserServiceImpl)
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
        // TENANT_ADMIN+ -- backs OllamaRestApi (infra/model management, not a per-use AI tool)
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
        // Restricted to this one account specifically, not PLATFORM_ADMIN generally -- see
        // RoleGuard's own javadoc for exactUsernames. Frontend-only (nav link hidden + this route
        // guard) -- AudioTranscriptRestApi's own authorization is unchanged, so the underlying
        // API is still reachable by any TENANT_USER+ account that calls it directly; this only
        // gates the curated UI entry point, same as aiChat/cvTailor below.
        path: 'audioTranscriptExtractor',
        component: AudioTranscriptExtractorComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { exactUsernames: ['admin@platform.local'] }
    },
    {
        // Same as above -- frontend-only gate, ImageTextRestApi's own authorization is unchanged.
        path: 'imageTextExtractor',
        component: ImageTextExtractorComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { exactUsernames: ['admin@platform.local'] }
    },
    {
        // AI Chat has no backend endpoint of its own -- it calls AiAgentService/StorageService,
        // shared with the AI Agents page and Object Browser, which stay open to everyone else
        // regardless. This route guard (+ the nav link being hidden) is the only enforcement
        // layer for this specific curated flow; the underlying AI Agent capability itself is
        // still reachable by anyone through the AI Agents page directly.
        path: 'aiChat',
        component: AiChatComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { exactUsernames: ['admin@platform.local'] }
    },
    {
        // Same caveat as aiChat above -- CV Tailor composes AiAgentService/StorageService/
        // TextCleanerService, all shared with other pages that stay open to everyone else.
        path: 'cvTailor',
        component: CvTailorComponent,
        canActivate: [AuthGuard, RoleGuard],
        data: { exactUsernames: ['admin@platform.local'] }
    },
    {
        path: '**',
        redirectTo: 'home'
    }
];

export const AppRoutingModule = RouterModule.forRoot(routes);