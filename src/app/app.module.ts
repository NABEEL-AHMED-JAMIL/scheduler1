import { NgModule } from '@angular/core';
import {
    FormsModule,
    ReactiveFormsModule
} from '@angular/forms';
import { NgxEchartsModule } from 'ngx-echarts';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from '@/_helpers';
import { AppRoutingModule } from './app.routing';
import { AppComponent } from './app.component';
import { SearchFilterPipe } from '@/_helpers';
import { SpinnerComponent } from '@/_modal';
import {
    HomeComponent,
    LookupComponent,
    SourceTaskTypeComponent,
    SettingComponent,
    SettingLookupComponent,
    XmlConfigurationComponent,
    JobComponent,
    SourceJobComponent,
    SourceBatchActionComponent,
    SubLookupComponent,
    QueueMessageComponent,
    TaskComponent,
    SourceTaskComponent,
    JobHistoryActionComponent,
    JobLogComponent,
    SearchEngineComponent,
    QueryEngineComponent,
    KafkaConnectionProfileComponent,
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
    LinkedTaskPanelComponent,
    UnauthorizedComponent,
    TenantsComponent,
    UsersComponent,
    WelcomeComponent,
    DocumentConverterComponent
} from './_component/index';
import { ToastrModule } from 'ngx-toastr';

@NgModule({
    imports: [
        BrowserModule,
        NgxEchartsModule.forRoot({
            echarts: () => import('echarts'),
        }),
        FormsModule,
        ReactiveFormsModule,
        HttpClientModule,
        BrowserAnimationsModule,
        AppRoutingModule,
        ToastrModule.forRoot({
            positionClass: 'toast-top-right',
            timeOut: 1500,
            extendedTimeOut: 800,
            closeButton: true,
            progressBar: true,
            progressAnimation: 'decreasing',
            preventDuplicates: true,
            tapToDismiss: true,
            newestOnTop: true,
            easeTime: 300,
        })
    ],
    declarations: [
        AppComponent,
        SpinnerComponent,
        HomeComponent,
        SettingComponent,
        SettingLookupComponent,
        LookupComponent,
        SourceTaskTypeComponent,
        XmlConfigurationComponent,
        SourceBatchActionComponent,
        SubLookupComponent,
        QueueMessageComponent,
        JobComponent,
        SourceJobComponent,
        TaskComponent,
        SourceTaskComponent,
        SearchFilterPipe,
        JobHistoryActionComponent,
        JobLogComponent,
        SearchEngineComponent,
        QueryEngineComponent,
        KafkaConnectionProfileComponent,
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
        LinkedTaskPanelComponent,
        UnauthorizedComponent,
        TenantsComponent,
        UsersComponent,
        WelcomeComponent,
        DocumentConverterComponent
    ],
    providers: [
        { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
    ],
    bootstrap: [AppComponent]
})
export class AppModule { };