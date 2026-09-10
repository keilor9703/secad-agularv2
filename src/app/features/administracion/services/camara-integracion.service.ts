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
  /**
   * Nodo que atiende el video de esta integración. Los servidores centrales no
   * alcanzan la red de cámaras del municipio (segmentación de VLAN): el driver
   * firma contra el VMS desde el edge de la sede. Vacío = lo atiende el mismo
   * backend que responde.
   */
  nodoEdgeUrl:       string | null;
  fechaCreacion:     string | null;
  fechaModificacion: string | null;
}

export interface DtoCamaraIntegracionRequest {
  nombre:       string;
  descripcion?: string;
  driver:       string;
  baseUrl?:     string;
  nodoEdgeUrl?: string;
  config:       Record<string, string>;
  secretos?:    Record<string, string>;
  activa:       boolean;
}

/** Un emparejamiento propuesto entre una cámara del VMS y una del censo. */
export interface DtoEmparejamientoCamara {
  censoId:        string;
  censoNombre:    string;
  censoNumero:    string | null;
  censoDireccion: string | null;
  vmsId:          string;
  vmsCodigo:      string;
  vmsNombre:      string;
  vmsEstado:      number;
  /** 0 a 100: cuánto se parecen los nombres, ya normalizados. */
  puntaje:        number;
  /** Por qué se propuso, en palabras, para poder juzgarlo. */
  motivo:         string;
}

export interface DtoSyncResult {
  ok:           boolean;
  mensaje:      string;
  reportadas:   number;
  nuevas:       number;
  actualizadas: number;
  sinEmparejar: number;
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
  /** El catálogo (sincronizar, emparejar) va por su propio controlador. */
  private readonly adminBase = `${environment.apiBaseUrl}/CamarasAdmin`;

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

  /**
   * Prueba la conexión real contra el VMS. Con `id` se prueba una ficha ya
   * guardada, que es el caso normal: el formulario no reenvía el secreto —no
   * se muestra una vez guardado— y el backend usa el almacenado.
   */
  // ── Catálogo: sincronizar y emparejar ──────────────────────────────────

  /** Trae el catálogo del VMS y lo guarda. */
  sincronizar(integracionId: string): Observable<DtoSyncResult> {
    return this.http.post<DtoSyncResult>(`${this.adminBase}/sync/${integracionId}`, {});
  }

  /** Emparejamientos propuestos, para que una persona los confirme. */
  emparejamientos(integracionId: string): Observable<{ success: boolean; data: DtoEmparejamientoCamara[] }> {
    return this.http.get<{ success: boolean; data: DtoEmparejamientoCamara[] }>(
      `${this.adminBase}/emparejamientos/${integracionId}`);
  }

  emparejar(censoId: string, vmsId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.adminBase}/emparejar`, { censoId, vmsId });
  }

  desemparejar(censoId: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.adminBase}/desemparejar/${censoId}`, {});
  }

  validar(req: DtoCamaraIntegracionRequest, id?: string): Observable<DtoCamaraPruebaResult> {
    const url = id ? `${this.base}/${id}/validar` : `${this.base}/validar`;
    return this.http.post<DtoCamaraPruebaResult>(url, req);
  }
}
