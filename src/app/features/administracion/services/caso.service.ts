import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface DtoCaso {
  codigo: string;
  descripcion: string;
  vigente: boolean;
  idCategoriaAsistente?: string | null;
  categoriaDescripcion?: string | null;
  /** Código DANE del CAD específico o 'NACIONAL' / null para ámbito nacional */
  codDane?: string | null;
  nombreCad?: string | null;
  esNacional?: boolean;
}

export interface DtoCasoRequest {
  codigo: string;
  descripcion: string;
  vigente: boolean;
  idCategoriaAsistente?: string | null;
  codDane?: string | null;
}

export interface DtoCasoResult {
  success: boolean;
  message: string;
}

export interface DtoCasoImportItem {
  codigo: string;
  descripcion: string;
  codDane?: string | null;
}

export interface DtoImportarCasosResult {
  success: boolean;
  message: string;
  creados: number;
  actualizados: number;
  errores: string[];
}

@Injectable({ providedIn: 'root' })
export class CasoService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/Caso`;

  getAll(filtro?: { busqueda?: string; codDane?: string } | string): Observable<{ success: boolean; data: DtoCaso[] }> {
    let params = new HttpParams();
    if (typeof filtro === 'string') {
      if (filtro) params = params.set('busqueda', filtro);
    } else if (filtro) {
      if (filtro.busqueda) params = params.set('busqueda', filtro.busqueda);
      if (filtro.codDane)   params = params.set('codDane', filtro.codDane);
    }
    return this.http.get<{ success: boolean; data: DtoCaso[] }>(this.baseUrl, { params });
  }

  create(request: DtoCasoRequest): Observable<DtoCasoResult> {
    return this.http.post<DtoCasoResult>(this.baseUrl, request);
  }

  update(codigo: string, request: DtoCasoRequest): Observable<DtoCasoResult> {
    return this.http.put<DtoCasoResult>(`${this.baseUrl}/${encodeURIComponent(codigo)}`, request);
  }

  setEstado(codigo: string, vigente: boolean): Observable<DtoCasoResult> {
    return this.http.patch<DtoCasoResult>(`${this.baseUrl}/${encodeURIComponent(codigo)}/estado`, { vigente });
  }

  importar(items: DtoCasoImportItem[]): Observable<DtoImportarCasosResult> {
    return this.http.post<DtoImportarCasosResult>(`${this.baseUrl}/importar`, items);
  }
}
