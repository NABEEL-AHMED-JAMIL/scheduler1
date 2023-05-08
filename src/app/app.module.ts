import { NgModule } from '@angular/core';
import { NgxQrcodeStylingModule } from 'ngx-qrcode-styling';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { ReactiveFormsModule, FormsModule  } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { appRoutingModule } from './app.routing';
import { AppComponent } from './app.component';
import { JwtInterceptor, ErrorInterceptor } from '@/_helpers';
import { SearchFilterPipe } from '@/_helpers';
import { SpinnerComponent } from '@/_modal';
import {
    LoginComponent,
    RegisterComponent,
    ForgotPassComponent,
    ResetPassComponent,
    NotFoundComponent,
    BatchActionComponent,
    SettingLayoutComponent,
    ProfileComponent,
    CULookupComponent,
    LookupComponent,
    SubLookupComponent,
    XmlConfigurationComponent,
    SearchEngineComponent,
    DeleteBoxComponent,
    SttSettingComponent,
    STTListComponent,
    STTFListComponent,
    STTSListComponent,
    STTCListComponent,
    CUSTTComponent,
    CUSTTFComponent,
    CUSTTSComponent,
    CUSTTCComponent,
    STTFLinkSTTSComponent,
    STTFLinkSTTComponent,
    STTLinkUserComponent,
    STTLinkSTTFComponent,
    STTSLinkSTTFComponent,
    STTSLinkSTTCComponent,
    STTCLinkSTTSComponent,
    BatchComponent
} from '@/_component/index';
import { ToastrModule } from 'ngx-toastr';

@NgModule({
    imports: [
        BrowserModule,
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
        BatchActionComponent,
        SettingLayoutComponent,
        ProfileComponent,
        CULookupComponent,
        LookupComponent,
        SubLookupComponent,
        DeleteBoxComponent,
        SttSettingComponent,
        BatchComponent,
        STTListComponent,
        STTFListComponent,
        STTSListComponent,
        STTCListComponent,
        CUSTTComponent,
        CUSTTFComponent,
        CUSTTSComponent,
        CUSTTCComponent,
        STTFLinkSTTSComponent,
        STTFLinkSTTComponent,
        STTLinkUserComponent,
        STTLinkSTTFComponent,
        STTSLinkSTTFComponent,
        STTSLinkSTTCComponent,
        STTCLinkSTTSComponent,
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