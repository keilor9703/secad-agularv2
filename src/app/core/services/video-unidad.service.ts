import { HttpClient, HttpEventType, HttpRequest, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, filter, map, timeout } from 'rxjs';

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
  private readonly http = inject(HttpClient);

  getCurrent(): Observable<VideoUnidadInfo> {
    return this.http.get<VideoUnidadInfo>(`${this.baseUrl}/current`);
  }

  upload(
    file: File,
    descripcion?: string,
    observaciones?: string,
  ): Observable<VideoUnidadUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);

    if (descripcion) {
      formData.append('Descripcion', descripcion);
    }

    if (observaciones) {
      formData.append('Observaciones', observaciones);
    }

    const request = new HttpRequest('POST', `${this.baseUrl}/upload`, formData, {
      reportProgress: true,
    });

    /*
     * HttpClient emite eventos intermedios cuando reportProgress está activo.
     * Solo se expone la respuesta final para que un evento de progreso no sea
     * interpretado por la interfaz como una carga fallida.
     */
    return this.http.request<VideoUnidadUploadResponse>(request).pipe(
      timeout(300000),
      filter(
        (event): event is HttpResponse<VideoUnidadUploadResponse> =>
          event.type === HttpEventType.Response,
      ),
      map(
        (event) =>
          event.body ?? {
            success: false,
            url: '',
            fileName: '',
            sizeBytes: 0,
            message: 'El servidor no devolvió una respuesta válida.',
          },
      ),
    );
  }
}
