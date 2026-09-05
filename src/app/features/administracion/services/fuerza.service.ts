import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ── DTOs ──────────────────────────────────────────────────────────────────────

export interface DtoFuerza {
  id: number;
  sitioGraba: number;
  descripcion: string;
  abreviatura?: string;
  vigente: string;
  totalCanales: number;
  totalUsuarios: number;
}

export interface DtoFuerzaRequest {
  /** Código definido por el usuario — requerido en creación, ignorado en update */
  id: number;
  descripcion: string;
  abreviatura?: string;
  vigente: string;
  /**
   * Sitio de grabación (unidad policial) al que pertenece la fuerza.
   * 0 = no se indica y el backend conserva el que ya tenía.
   */
  sitioGraba?: number;
}

export interface DtoCanalFuerza {
  codigo: number;
  fuerzaId: number;
  descripcion: string;
  vigente: string;
}

export interface DtoCanalRequest {
  descripcion: string;
  vigente: string;
}

export interface DtoFuerzaResult {
  success: boolean;
  id: number;
  message: string;
}

export interface DtoUsuarioEnFuerza {
  idUsuario: string;       // Snowflake → string
  username: string;
  nombreCompleto: string;
  canalCodigo: number;
  canalDescripcion?: string;
  acd: number;
}

export interface DtoUsuarioOperacion {
  cadcanaFuerzaId: number;
  cadcanaCodigo: number;
  acd: number;
  sitioGrabacion: number;
  sitioDescripcion?: string;
  fuerzaDescripcion?: string;
  fuerzaAbreviatura?: string;
  canalDescripcion?: string;
}

export interface DtoUsuarioOperacionRequest {
  /** Unidad policial del usuario dentro del CAD. Es la marca que separa sus registros. */
  sitioGrabacion: number;
  cadcanaFuerzaId: number;
  cadcanaCodigo: number;
  acd: number;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class FuerzaService {
  private readonly base = `${environment.apiBaseUrl}/Fuerza`;

  constructor(private http: HttpClient) {}

  // ── Fuerzas ────────────────────────────────────────────────────────────────

  /**
   * @param sitio Sitio de grabación por el que filtrar. 0 = todas las del CAD.
   *   Solo lo atiende el backend para administradores: administrar es cosa del
   *   CAD entero, así que quien administra tiene que ver las fuerzas de todas
   *   sus unidades, no solo las de la suya. Sin el parámetro se filtra por el
   *   sitio de quien consulta, que es lo que necesita la operación.
   */
  getFuerzas(sitio?: number): Observable<{ success: boolean; data: DtoFuerza[] }> {
    const options = sitio === undefined
      ? {}
      : { params: new HttpParams().set('sitio', sitio) };
    return this.http.get<{ success: boolean; data: DtoFuerza[] }>(this.base, options);
  }

  getFuerza(id: number): Observable<{ success: boolean; data: DtoFuerza }> {
    return this.http.get<{ success: boolean; data: DtoFuerza }>(`${this.base}/${id}`);
  }

  createFuerza(request: DtoFuerzaRequest): Observable<DtoFuerzaResult> {
    return this.http.post<DtoFuerzaResult>(this.base, request);
  }

  updateFuerza(id: number, request: DtoFuerzaRequest): Observable<DtoFuerzaResult> {
    return this.http.put<DtoFuerzaResult>(`${this.base}/${id}`, request);
  }

  toggleFuerza(id: number): Observable<DtoFuerzaResult> {
    return this.http.put<DtoFuerzaResult>(`${this.base}/${id}/estado`, {});
  }

  // ── Canales ────────────────────────────────────────────────────────────────

  getCanales(fuerzaId: number): Observable<{ success: boolean; data: DtoCanalFuerza[] }> {
    return this.http.get<{ success: boolean; data: DtoCanalFuerza[] }>(`${this.base}/${fuerzaId}/canales`);
  }

  createCanal(fuerzaId: number, request: DtoCanalRequest): Observable<DtoFuerzaResult> {
    return this.http.post<DtoFuerzaResult>(`${this.base}/${fuerzaId}/canales`, request);
  }

  updateCanal(fuerzaId: number, codigo: number, request: DtoCanalRequest): Observable<DtoFuerzaResult> {
    return this.http.put<DtoFuerzaResult>(`${this.base}/${fuerzaId}/canales/${codigo}`, request);
  }

  toggleCanal(fuerzaId: number, codigo: number): Observable<DtoFuerzaResult> {
    return this.http.put<DtoFuerzaResult>(`${this.base}/${fuerzaId}/canales/${codigo}/estado`, {});
  }

  // ── Usuarios en fuerza ─────────────────────────────────────────────────────

  getUsuariosByFuerza(fuerzaId: number): Observable<{ success: boolean; data: DtoUsuarioEnFuerza[] }> {
    return this.http.get<{ success: boolean; data: DtoUsuarioEnFuerza[] }>(`${this.base}/${fuerzaId}/usuarios`);
  }

  // ── Datos operacionales de usuario ────────────────────────────────────────

  getUsuarioOperacion(idUsuario: string): Observable<{ success: boolean; data: DtoUsuarioOperacion }> {
    return this.http.get<{ success: boolean; data: DtoUsuarioOperacion }>(`${this.base}/usuario/${idUsuario}/operacion`);
  }

  saveUsuarioOperacion(idUsuario: string, request: DtoUsuarioOperacionRequest): Observable<DtoFuerzaResult> {
    return this.http.put<DtoFuerzaResult>(`${this.base}/usuario/${idUsuario}/operacion`, request);
  }
}
