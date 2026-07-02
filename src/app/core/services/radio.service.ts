import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoRadioEmisora {
  idEmisora: number;
  nombre: string;
  streamUrl: string;
  logoUrl?: string | null;
  orden: number;
  activo: number;
}

@Injectable({ providedIn: 'root' })
export class RadioService {
  private readonly baseUrl = environment.radioApiUrl;

  constructor(private http: HttpClient) {}

  getPublicas(): Observable<DtoRadioEmisora[]> {
    return this.http.get<DtoRadioEmisora[]>(this.baseUrl);
  }

  getById(id: number): Observable<DtoRadioEmisora> {
    return this.http.get<DtoRadioEmisora>(`${this.baseUrl}/${id}`);
  }
}
