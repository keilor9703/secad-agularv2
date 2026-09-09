import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Sitio de grabación = la unidad policial que opera dentro del CAD.
 *
 * No es lo mismo que el tenant. El tenant es el CAD físico; el sitio es la
 * unidad que trabaja en él. Un mismo CAD puede alojar varias unidades —dos
 * municipios vecinos que comparten sala porque ninguno por separado puede
 * montarla— y sus registros tienen que quedar separados. De ahí que el sitio
 * marque al usuario, a la fuerza y a todo lo que se recibe y se despacha.
 */
export interface DtoSitioGrabacion {
  /** Código del sitio. Lo define el CAD; es el que viaja en el JWT como sitio_graba. */
  consecutivo: number;
  descripcion: string;
  /** Sigla de la unidad: MEBAR, DEATA… */
  abreviatura?: string | null;
  /** DANE del municipio de la unidad. */
  codDane?: string | null;
  vigente: string;
  /** Centro del mapa de la unidad: donde abre Recepción para su gente. */
  latitud?: number | null;
  longitud?: number | null;
  /** 12-13 para un municipio, 8-9 para un departamento entero. */
  zoomMapa?: number | null;
  totalFuerzas: number;
  totalUsuarios: number;
}

export interface DtoSitioGrabacionRequest {
  /** Requerido al crear, ignorado al actualizar. */
  consecutivo: number;
  descripcion: string;
  abreviatura?: string | null;
  codDane?: string | null;
  vigente: string;
  latitud?: number | null;
  longitud?: number | null;
  zoomMapa?: number | null;
}

export interface DtoSitioResult {
  success: boolean;
  id: number;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class SitioGrabacionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/SitioGrabacion`;

  /** @param soloVigentes true para los selectores: no ofrecer unidades retiradas. */
  getSitios(soloVigentes = false): Observable<{ success: boolean; data: DtoSitioGrabacion[] }> {
    const params = new HttpParams().set('soloVigentes', soloVigentes);
    return this.http.get<{ success: boolean; data: DtoSitioGrabacion[] }>(this.base, { params });
  }

  getSitio(consecutivo: number): Observable<{ success: boolean; data: DtoSitioGrabacion }> {
    return this.http.get<{ success: boolean; data: DtoSitioGrabacion }>(`${this.base}/${consecutivo}`);
  }

  crear(request: DtoSitioGrabacionRequest): Observable<DtoSitioResult> {
    return this.http.post<DtoSitioResult>(this.base, request);
  }

  actualizar(consecutivo: number, request: DtoSitioGrabacionRequest): Observable<DtoSitioResult> {
    return this.http.put<DtoSitioResult>(`${this.base}/${consecutivo}`, request);
  }

  toggle(consecutivo: number): Observable<DtoSitioResult> {
    return this.http.put<DtoSitioResult>(`${this.base}/${consecutivo}/estado`, {});
  }

  eliminar(consecutivo: number): Observable<DtoSitioResult> {
    return this.http.delete<DtoSitioResult>(`${this.base}/${consecutivo}`);
  }

  /** «MEBAR — Metropolitana de Barranquilla», o solo el nombre si no tiene sigla. */
  etiqueta(s: DtoSitioGrabacion): string {
    return s.abreviatura ? `${s.abreviatura} — ${s.descripcion}` : s.descripcion;
  }
}
