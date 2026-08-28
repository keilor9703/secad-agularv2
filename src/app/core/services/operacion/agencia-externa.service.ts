import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface DtoAgenciaExterna {
  id:                string;
  nombre:            string;
  descripcion:       string | null;
  tipoAgencia:       string;
  apiUrl:            string | null;
  apiMetodo:         string;
  // Auth
  tipoAuth:          string;        // NONE | BEARER | BASIC | OAUTH2 | API_KEY | CREDS_BODY
  tieneCredencial:   boolean;       // hay token o password configurado
  tieneToken:        boolean;       // alias legacy
  apiUsuario:        string | null; // usuario (BASIC / OAUTH2 / CREDS_BODY)
  authExtra:         string | null; // JSON: tokenUrl, keyHeader, bodyUserField, bodyPassField
  apiCabeceras:      string | null;
  campoMapeo:        string | null;
  /** 'PLANO' (default) = body simple con campos mapeados | 'ESTRUCTURADO' = body jerárquico completo */
  formatoPayload:    string;
  activa:            boolean;
  fechaCreacion:     string | null;
  fechaModificacion: string | null;
}

export interface DtoAgenciaExternaRequest {
  nombre:        string;
  descripcion?:  string;
  tipoAgencia:   string;
  apiUrl?:       string;
  apiMetodo:     string;
  // Auth
  tipoAuth:      string;    // NONE | BEARER | BASIC | OAUTH2 | API_KEY | CREDS_BODY
  apiToken?:     string;    // BEARER / API_KEY — vacío = mantener existente
  apiUsuario?:   string;    // BASIC / OAUTH2 / CREDS_BODY
  apiPassword?:  string;    // vacío = mantener existente
  authExtra?:      string;    // JSON con config por modo
  apiCabeceras?:   string;
  campoMapeo?:     string;
  /** 'PLANO' (default) = body simple | 'ESTRUCTURADO' = body jerárquico completo */
  formatoPayload?: string;
  activa:          boolean;
}

export interface DtoDespachoExternoRequest {
  pedidoId:   string;   // Snowflake string
  sitioGraba: number;
  agenciaId:  string;   // Snowflake string
}

export interface DtoDespachoExternoResult {
  success:     boolean;
  message:     string;
  httpStatus?: number;
  response?:   string;
}

// ─── Tipos de agencia (para el selector) ─────────────────────────────────────
export const TIPOS_AGENCIA = [
  { value: 'BOMBEROS',    label: 'Bomberos'             },
  { value: 'CRUZ_ROJA',  label: 'Cruz Roja'             },
  { value: 'TRANSITO',   label: 'Tránsito'              },
  { value: 'EJERCITO',   label: 'Ejército Nacional'     },
  { value: 'PSICOSOCIAL',label: 'Apoyo Psicosocial'     },
  { value: 'AMBULANCIA', label: 'Ambulancia / Salud'    },
  { value: 'OTRA',       label: 'Otra'                  },
] as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class AgenciaExternaService {
  private readonly base      = `${environment.apiBaseUrl}/AgenciaExterna`;
  private readonly baseAdmin = `${environment.apiBaseUrl}/AgenciaExterna/admin`;

  constructor(private http: HttpClient) {}

  // ── Operacional (todos los roles) ──────────────────────────────────────────

  /** Lista las agencias activas para el selector del operador. */
  getActivas(): Observable<DtoAgenciaExterna[]> {
    return this.http.get<DtoAgenciaExterna[]>(this.base);
  }

  /**
   * Envía un caso a una agencia externa por API REST.
   * El backend llama a la API de la agencia, registra la respuesta y
   * retorna el resultado al frontend.
   */
  despachar(req: DtoDespachoExternoRequest): Observable<DtoDespachoExternoResult> {
    return this.http.post<DtoDespachoExternoResult>(`${this.base}/despachar`, req);
  }

  // ── Administración ─────────────────────────────────────────────────────────

  /** Lista todas las agencias (activas e inactivas) para el admin. */
  getAll(): Observable<DtoAgenciaExterna[]> {
    return this.http.get<DtoAgenciaExterna[]>(this.baseAdmin);
  }

  crear(req: DtoAgenciaExternaRequest): Observable<{ success: boolean; message: string; id?: string }> {
    return this.http.post<{ success: boolean; message: string; id?: string }>(this.baseAdmin, req);
  }

  actualizar(id: string, req: DtoAgenciaExternaRequest): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(`${this.baseAdmin}/${id}`, req);
  }

  toggle(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.patch<{ success: boolean; message: string }>(
      `${this.baseAdmin}/${id}/toggle`, {});
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  getTipoLabel(tipo: string): string {
    return TIPOS_AGENCIA.find(t => t.value === tipo)?.label ?? tipo;
  }

  getTipoIcon(tipo: string): string {
    const map: Record<string, string> = {
      BOMBEROS:    'fa-fire',
      CRUZ_ROJA:   'fa-kit-medical',
      TRANSITO:    'fa-traffic-light',
      EJERCITO:    'fa-shield',
      PSICOSOCIAL: 'fa-brain',
      AMBULANCIA:  'fa-truck-medical',
      OTRA:        'fa-building-shield',
    };
    return map[tipo] ?? 'fa-building-shield';
  }
}
