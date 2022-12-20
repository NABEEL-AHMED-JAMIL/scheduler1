import { NgModule } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { NgxQrcodeStylingModule } from 'ngx-qrcode-styling';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule, FormsModule  } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { appRoutingModule } from './app.routing';
import { AppComponent } from './app.component';
import { SearchFilterPipe } from './_helpers';
import { SpinnerComponent } from '@/_modal';
import { GoogleMapsModule } from '@angular/google-maps'
import { HomeComponent, LookupComponent, SourceTaskTypeComponent,
    SettingComponent, XmlConfigurationComponent, JobComponent,
    SourceJobComponent, SourceBatchActionComponent, SubLookupComponent,
    QueueMessageComponent, TaskComponent, ViewLinkTaskComponent,
    ViewLinkJobsComponent, SourceTaskComponent, JobHistoryActionComponent,
    JobLogComponent, SearchEngineComponent, SegmentFolderComponent, SegmentFileComponent
} from './_component/index';
import {
    BarAnalyticComponent, CalendarAnalyticComponent,
    GeoAnalyticComponent, HeatmapAnalyticComponent,
    LineAnalyticComponent, MapAnalyticComponent,
    PieAnalyticComponent, RadarAnalyticsComponent
} from './gen-analytics/index'
import { ToastrModule } from 'ngx-toastr';

@NgModule({
    imports: [
        BrowserModule,
        GoogleMapsModule,
        NgxEchartsModule.forRoot({
            echarts: () => import('echarts'),
        }),
        FormsModule,
        NgxQrcodeStylingModule,
        ReactiveFormsModule,
        HttpClientModule,
        BrowserAnimationsModule,
        appRoutingModule,
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
        ViewLinkTaskComponent,
        ViewLinkJobsComponent,
        SourceTaskComponent,
        SearchFilterPipe,
        JobHistoryActionComponent,
        JobLogComponent,
        SearchEngineComponent,
        SegmentFolderComponent,
        SegmentFileComponent,
        BarAnalyticComponent,
        CalendarAnalyticComponent,
        GeoAnalyticComponent,
        HeatmapAnalyticComponent,
        LineAnalyticComponent,
        MapAnalyticComponent,
        PieAnalyticComponent,
        RadarAnalyticsComponent
    ],
    providers: [
    ],
    bootstrap: [AppComponent]
})
export class AppModule { };