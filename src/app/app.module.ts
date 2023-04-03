import { NgModule } from '@angular/core';
import { NgxEchartsModule } from 'ngx-echarts';
import { NgxQrcodeStylingModule } from 'ngx-qrcode-styling';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule, FormsModule  } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { appRoutingModule } from './app.routing';
import { AppComponent } from './app.component';
import { JwtInterceptor, ErrorInterceptor } from './_helpers';
import { SearchFilterPipe } from './_helpers';
import { SpinnerComponent } from '@/_modal';
import {
    LoginComponent,
    RegisterComponent,
    ForgotPassComponent,
    ResetPassComponent,
    NotFoundComponent,
    SettingLayoutComponent,
    ProfileComponent,
    CULookupComponent,
    LookupSettingComponent,
    SubLookupListComponent,
    XmlConfigurationComponent,
    SearchEngineComponent
} from './_component/index';
import { ToastrModule } from 'ngx-toastr';

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
        appRoutingModule,
        ToastrModule.forRoot()
    ],
    declarations: [
        AppComponent,
        SpinnerComponent,
        LoginComponent,
        RegisterComponent,
        ForgotPassComponent,
        ResetPassComponent,
        NotFoundComponent,
        SettingLayoutComponent,
        ProfileComponent,
        CULookupComponent,
        LookupSettingComponent,
        SubLookupListComponent,
        XmlConfigurationComponent,
        SearchFilterPipe,
        SearchEngineComponent
    ],
    providers: [
        { 
            provide: HTTP_INTERCEPTORS,
            useClass: JwtInterceptor,
            multi: true
        },
        { 
            provide: HTTP_INTERCEPTORS,
            useClass: ErrorInterceptor,
            multi: true
        },
    ],
    bootstrap: [AppComponent]
})
export class AppModule { };