import { Injectable } from '@angular/core';
import { HttpClient, HttpEventType, HttpRequest } from '@angular/common/http';
import { Observable, timeout, map } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface VideoUnidadInfo {
  hasVideo: boolean;
  url: string;
  fileName: string;
  sizeBytes: number;
  lastModifiedUtc?: string | null;
  idVideo?: number | null;
  descripcion?: string | null;
  observaciones?: string | null;
}

export interface VideoUnidadUploadResponse {
  success: boolean;
  url: string;
  fileName: string;
  sizeBytes: number;
  message: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class VideoUnidadService {
  private readonly baseUrl = `${environment.apiBaseUrl}/VideoUnidad`;

  constructor(private http: HttpClient) {}

  getCurrent(): Observable<VideoUnidadInfo> {
    return this.http.get<VideoUnidadInfo>(`${this.baseUrl}/current`);
  }

  upload(file: File, descripcion?: string, observaciones?: string): Observable<VideoUnidadUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);
    if (descripcion) formData.append('Descripcion', descripcion);
    if (observaciones) formData.append('Observaciones', observaciones);
    const req = new HttpRequest('POST', `${this.baseUrl}/upload`, formData, {
      reportProgress: true
    });
    return this.http.request(req).pipe(
      timeout(300000),
      map((event) => {
        if (event.type === HttpEventType.Response) {
          return event.body as VideoUnidadUploadResponse;
        }
        return { success: false, url: '', fileName: '', sizeBytes: 0, message: 'Cargando...', detail: '' } as VideoUnidadUploadResponse;
      })
    );
  }
}

