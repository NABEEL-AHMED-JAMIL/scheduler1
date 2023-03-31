import { Component, OnInit } from '@angular/core';
import { Breadcrumb } from '../../_models/index';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';
import { BreadcrumbService } from '@/_helpers/breadcrumb.service';


@Component({
    templateUrl: 'setting-layout.component.html'
})
export class SettingLayoutComponent implements OnInit {

    public breadcrumbs: Observable<Breadcrumb[]>;

    constructor(private readonly breadcrumbService: BreadcrumbService) {
      this.breadcrumbs = breadcrumbService.breadcrumbs$;
      console.log(this.breadcrumbs);
    }

    ngOnInit() {
    }

}