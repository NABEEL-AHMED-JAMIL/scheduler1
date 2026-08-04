import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ApiResponse } from '@/_models';
import { ImageRegion } from '@/_models/image-text.model';
import { Observable } from 'rxjs';

/**
 * @author Nabeel Ahmed
 */
@Injectable({
    providedIn: 'root'
})
export class ImageTextService {

    constructor(private http: HttpClient) { }

    public extractFromImage(file: File, region?: ImageRegion): Observable<ApiResponse> {
        const formData = new FormData();
        formData.append('file', file);
        if (region) {
            formData.append('x', String(region.x));
            formData.append('y', String(region.y));
            formData.append('width', String(region.width));
            formData.append('height', String(region.height));
        }
        return this.http.post<ApiResponse>(`${config.apiUrl}/imageText.json/extractFromImage`, formData);
    }

}
