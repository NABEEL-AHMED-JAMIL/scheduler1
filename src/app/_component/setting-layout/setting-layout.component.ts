import { Component, OnInit } from '@angular/core';
import { Breadcrumb } from '@/_models/index';
import { Location } from '@angular/common';
import { Observable } from 'rxjs';
import { BreadcrumbService } from '@/_helpers';


@Component({
  selector: 'setting-layout',
  templateUrl: 'setting-layout.component.html'
})
export class SettingLayoutComponent implements OnInit {

    public breadcrumbs: Observable<Breadcrumb[]>;

    constructor(private readonly breadcrumbService: BreadcrumbService,
      private location: Location) {
      this.breadcrumbs = breadcrumbService.breadcrumbs$;
    }

    ngOnInit() {
    }

    public back() {
      this.location.back();
    }

}