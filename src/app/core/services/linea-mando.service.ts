import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DtoLineaMando {
  idLineaMando: number;
  identificacion: string;
  nombre: string;
  apellidos: string;
  grado: string;
  cargo: string;
  peso: string;
  unidad: string;
  fotoBase64: string | null;
  orden: number;
  vigente: number;
}

export interface DtoLineaMandoRequest {
  identificacion: string;
  nombre: string;
  apellidos: string;
  grado: string;
  cargo: string;
  peso: string;
  unidad: string;
  fotoBase64: string | null;
  orden: number;
}

export interface DtoLineaMandoResult {
  success: boolean;
  id: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class LineaMandoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/LineaMando`;

  getAll(): Observable<DtoLineaMando[]> {
    return this.http.get<DtoLineaMando[]>(this.baseUrl);
  }

  getById(id: number): Observable<DtoLineaMando> {
    return this.http.get<DtoLineaMando>(`${this.baseUrl}/${id}`);
  }

  getByIdentificacion(identificacion: string): Observable<DtoLineaMando> {
    return this.http.get<DtoLineaMando>(`${this.baseUrl}/por-identificacion/${identificacion}`);
  }

  create(request: DtoLineaMandoRequest): Observable<DtoLineaMandoResult> {
    return this.http.post<DtoLineaMandoResult>(this.baseUrl, request);
  }

  update(id: number, request: DtoLineaMandoRequest): Observable<DtoLineaMandoResult> {
    return this.http.put<DtoLineaMandoResult>(`${this.baseUrl}/${id}`, request);
  }

  delete(id: number): Observable<DtoLineaMandoResult> {
    return this.http.delete<DtoLineaMandoResult>(`${this.baseUrl}/${id}`);
  }

  setVigente(id: number, vigente: number): Observable<DtoLineaMandoResult> {
    return this.http.put<DtoLineaMandoResult>(`${this.baseUrl}/${id}/vigente`, { vigente });
  }
}
