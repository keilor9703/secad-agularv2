import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoNoticia {
  idNoticia: number;
  unidad: string;
  titulo: string;
  seccion: string;
  ciudad: string;
  imagenNoticia?: string | null;
  subtitulo?: string | null;
  contenido?: string | null;
  vigente: number;
  fechaCreacion: string;
  usuarioCreacion: string;
  megusta?: number;
}

export interface DtoNoticiaApiResponse {
  success: boolean;
  message: string;
  id?: number;
}

@Injectable({ providedIn: 'root' })
export class NoticiaService {
  private readonly baseUrl = environment.noticiaApiUrl;

  constructor(private http: HttpClient) {}

  getAll(): Observable<DtoNoticia[]> {
    return this.http.get<DtoNoticia[]>(this.baseUrl);
  }

  getActivas(): Observable<DtoNoticia[]> {
    return this.http.get<DtoNoticia[]>(`${this.baseUrl}/activas`);
  }

  getById(id: number): Observable<DtoNoticia> {
    return this.http.get<DtoNoticia>(`${this.baseUrl}/${id}`);
  }

  darLike(id: number): Observable<DtoNoticiaApiResponse> {
    return this.http.post<DtoNoticiaApiResponse>(`${this.baseUrl}/${id}/like`, {});
  }
}
