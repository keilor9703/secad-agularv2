import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DtoRadioEmisora } from '../models/radio.model';

@Injectable({ providedIn: 'root' })
export class RadioService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.radioApiUrl;

  getPublicas(): Observable<DtoRadioEmisora[]> {
    return this.http.get<DtoRadioEmisora[]>(this.baseUrl);
  }

  getById(id: number): Observable<DtoRadioEmisora> {
    return this.http.get<DtoRadioEmisora>(`${this.baseUrl}/${id}`);
  }
}
