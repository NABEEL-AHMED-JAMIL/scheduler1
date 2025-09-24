import { NgModule } from '@angular/core';
import {
    FormsModule,
    ReactiveFormsModule
} from '@angular/forms';
import { NgxEchartsModule } from 'ngx-echarts';
import { NgxQrcodeStylingModule } from 'ngx-qrcode-styling';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { HttpClientModule } from '@angular/common/http';
import { AppRoutingModule } from './app.routing';
import { AppComponent } from './app.component';
import { SearchFilterPipe } from '@/_helpers';
import { SpinnerComponent } from '@/_modal';
import {
    HomeComponent,
    LookupComponent,
    SourceTaskTypeComponent,
    SettingComponent,
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
    SearchEngineComponent
} from './_component/index';
import { ToastrModule } from 'ngx-toastr';


/**
 * @author Nabeel Ahmed
 */
@NgModule({
    imports: [
        BrowserModule,
        NgxEchartsModule.forRoot({
            echarts: () => import('echarts'),
        }),
        FormsModule,
        NgxQrcodeStylingModule,
        ReactiveFormsModule,
        HttpClientModule,
        BrowserAnimationsModule,
        AppRoutingModule,
        ToastrModule.forRoot()
    ],
    declarations: [
        AppComponent,
        SpinnerComponent,
        HomeComponent,
        SettingComponent,
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
        SearchEngineComponent
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { };