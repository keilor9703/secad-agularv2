import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoVideoInstitucional {
  idVideoInst: number;
  titulo: string;
  descripcion?: string | null;
  urlYoutube: string;
  embedUrl: string;
  vigente: number;
}

export interface VideoInstitucionalCurrentResponse {
  hasVideo: boolean;
  data?: DtoVideoInstitucional;
}

@Injectable({ providedIn: 'root' })
export class VideoInstitucionalService {
  private readonly baseUrl = environment.videoInstitucionalApiUrl;

  constructor(private http: HttpClient) {}

  getCurrent(): Observable<VideoInstitucionalCurrentResponse> {
    return this.http.get<VideoInstitucionalCurrentResponse>(`${this.baseUrl}/current`);
  }
}
