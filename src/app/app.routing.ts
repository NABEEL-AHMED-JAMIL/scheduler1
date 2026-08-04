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
    AiChatComponent
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
        canActivate: [AuthGuard]
    },
    {
        path: 'contentCleaner',
        component: ContentCleanerComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'audioTranscriptExtractor',
        component: AudioTranscriptExtractorComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'imageTextExtractor',
        component: ImageTextExtractorComponent,
        canActivate: [AuthGuard]
    },
    {
        path: 'aiChat',
        component: AiChatComponent,
        canActivate: [AuthGuard]
    },
    {
        path: '**',
        redirectTo: 'home'
    }
];

export const AppRoutingModule = RouterModule.forRoot(routes);