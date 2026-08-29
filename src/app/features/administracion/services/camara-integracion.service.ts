import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── Descriptores de driver (metadata para formulario dinámico) ────────────────

export interface DtoVmsDriverField {
  key:       string;
  nombre:    string;
  /** "text" | "password" | "number" | "select" | "textarea" */
  tipo:      string;
  requerido: boolean;
  /** true = campo secreto (write-only). */
  secreto:   boolean;
  ayuda?:    string;
  ejemplo?:  string;
  opciones?: string[];
}

export interface DtoVmsDriverDescriptor {
  driver:          string;
  nombre:          string;
  descripcion:     string;
  icono:           string;
  requiereGateway: boolean;
  campos:          DtoVmsDriverField[];
}

// ─── Integración VMS ───────────────────────────────────────────────────────────

export interface DtoCamaraIntegracion {
  id:                string;
  nombre:            string;
  descripcion:       string | null;
  driver:            string;
  driverNombre:      string;
  baseUrl:           string | null;
  /** Solo parámetros no secretos. */
  config:            Record<string, string>;
  tieneSecreto:      boolean;
  activa:            boolean;
  totalCamaras:      number;
  fechaCreacion:     string | null;
  fechaModificacion: string | null;
}

export interface DtoCamaraIntegracionRequest {
  nombre:       string;
  descripcion?: string;
  driver:       string;
  baseUrl?:     string;
  config:       Record<string, string>;
  secretos?:    Record<string, string>;
  activa:       boolean;
}

export interface DtoCamaraPruebaResult {
  ok:                boolean;
  mensaje:           string;
  camarasDetectadas?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class CamaraIntegracionService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/CamaraIntegracion`;

  getDrivers(): Observable<DtoVmsDriverDescriptor[]> {
    return this.http.get<DtoVmsDriverDescriptor[]>(`${this.base}/drivers`);
  }

  getAll(): Observable<DtoCamaraIntegracion[]> {
    return this.http.get<DtoCamaraIntegracion[]>(this.base);
  }

  crear(req: DtoCamaraIntegracionRequest): Observable<{ success: boolean; message: string; id?: string }> {
    return this.http.post<{ success: boolean; message: string; id?: string }>(this.base, req);
  }

  actualizar(id: string, req: DtoCamaraIntegracionRequest): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.base}/${id}`, req);
  }

  toggle(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(`${this.base}/${id}/toggle`, {});
  }

  eliminar(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.base}/${id}`);
  }

  validar(req: DtoCamaraIntegracionRequest): Observable<DtoCamaraPruebaResult> {
    return this.http.post<DtoCamaraPruebaResult>(`${this.base}/validar`, req);
  }
}
