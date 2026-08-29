import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  DtoAgenciaExterna,
  DtoAgenciaExternaRequest,
  DtoDespachoExternoRequest,
  DtoDespachoExternoResult
} from '../../../core/services/operacion/agencia-externa.service';

// ─── DTOs — Integraciones Entrantes ───────────────────────────────────────────

export interface DtoIntegracionEntrante {
  /** Snowflake ID como string */
  id:                string;
  nombre:            string;
  descripcion:       string | null;
  /** CHAT | SMS | API_FOTO | OTRA */
  tipoCanal:         string;
  endpointRelativo:  string;
  headersRequeridos: string | null;   // JSON string
  ejemploPayload:    string | null;   // JSON string
  sitioGrabaDefecto: number;
  activa:            boolean;
  notas:             string | null;
  fechaCreacion:     string | null;
  fechaModificacion: string | null;
}

export interface DtoIntegracionEntranteRequest {
  nombre:             string;
  descripcion?:       string;
  tipoCanal:          string;
  endpointRelativo:   string;
  headersRequeridos?: string;
  ejemploPayload?:    string;
  sitioGrabaDefecto:  number;
  activa:             boolean;
  notas?:             string;
}

// ─── DTOs — Auditoría ─────────────────────────────────────────────────────────

export interface DtoDespachoAuditoria {
  id:             string;
  pedidoId:       string;
  sitioGraba:     number;
  agenciaNombre:  string;
  agenciaTipo:    string;
  payloadEnviado: string | null;
  httpStatus:     number | null;
  respuestaApi:   string | null;
  enviadoPor:     string;
  fechaEnvio:     string;
  exitoso:        boolean;
}

export interface DtoRecepcionAuditoria {
  id:             string;
  canal:          string;
  payloadCrudo:   string;
  pedidoId:       string | null;
  procesado:      boolean;
  error:          string | null;
  ipOrigen:       string | null;
  fechaRecepcion: string;
}

// ─── Catálogos ────────────────────────────────────────────────────────────────

export const TIPOS_CANAL_ENTRANTE = [
  { value: 'CHAT',     label: 'Chat (WhatsApp, Telegram)', icon: 'fa-comments'     },
  { value: 'SMS',      label: 'SMS',                       icon: 'fa-sms'          },
  { value: 'API_FOTO', label: 'API Fotos',                 icon: 'fa-camera'       },
  { value: 'OTRA',     label: 'Otra',                      icon: 'fa-plug'         },
] as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class IntegracionesService {
  private readonly http = inject(HttpClient);
  private readonly base    = `${environment.apiBaseUrl}/Integraciones`;
  private readonly baseAg  = `${environment.apiBaseUrl}/AgenciaExterna`;

  // ── Integraciones Salientes (AgenciaExterna) ──────────────────────────────

  getSalientes(): Observable<DtoAgenciaExterna[]> {
    return this.http.get<DtoAgenciaExterna[]>(`${this.baseAg}/admin`);
  }

  crearSaliente(req: DtoAgenciaExternaRequest): Observable<{ success: boolean; message: string; id?: string }> {
    return this.http.post<{ success: boolean; message: string; id?: string }>(`${this.baseAg}/admin`, req);
  }

  actualizarSaliente(id: string, req: DtoAgenciaExternaRequest): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.baseAg}/admin/${id}`, req);
  }

  toggleSaliente(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(`${this.baseAg}/admin/${id}/toggle`, {});
  }

  probarSaliente(req: DtoDespachoExternoRequest): Observable<DtoDespachoExternoResult> {
    return this.http.post<DtoDespachoExternoResult>(`${this.baseAg}/despachar`, req);
  }

  // ── Integraciones Entrantes ───────────────────────────────────────────────

  getEntrantes(): Observable<{ success: boolean; data: DtoIntegracionEntrante[] }> {
    return this.http.get<{ success: boolean; data: DtoIntegracionEntrante[] }>(`${this.base}/entrantes`);
  }

  crearEntrante(req: DtoIntegracionEntranteRequest): Observable<{ success: boolean; message: string; id?: string }> {
    return this.http.post<{ success: boolean; message: string; id?: string }>(`${this.base}/entrantes`, req);
  }

  actualizarEntrante(id: string, req: DtoIntegracionEntranteRequest): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.base}/entrantes/${id}`, req);
  }

  toggleEntrante(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(`${this.base}/entrantes/${id}/toggle`, {});
  }

  // ── Auditoría ─────────────────────────────────────────────────────────────

  getAuditoriaSalientes(limit = 100, agenciaId?: string): Observable<{ success: boolean; data: DtoDespachoAuditoria[] }> {
    let url = `${this.base}/auditoria/salientes?limit=${limit}`;
    if (agenciaId) url += `&agenciaId=${agenciaId}`;
    return this.http.get<{ success: boolean; data: DtoDespachoAuditoria[] }>(url);
  }

  getAuditoriaEntrantes(limit = 100, canal?: string): Observable<{ success: boolean; data: DtoRecepcionAuditoria[] }> {
    let url = `${this.base}/auditoria/entrantes?limit=${limit}`;
    if (canal) url += `&canal=${canal}`;
    return this.http.get<{ success: boolean; data: DtoRecepcionAuditoria[] }>(url);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getTipoCanalLabel(tipo: string): string {
    return TIPOS_CANAL_ENTRANTE.find(t => t.value === tipo)?.label ?? tipo;
  }

  getTipoCanalIcon(tipo: string): string {
    return TIPOS_CANAL_ENTRANTE.find(t => t.value === tipo)?.icon ?? 'fa-plug';
  }

  getHttpStatusClass(status: number | null): string {
    if (!status) return 'badge-default';
    if (status >= 200 && status < 300) return 'badge-ok';
    if (status >= 400 && status < 500) return 'badge-warn';
    return 'badge-error';
  }
}
