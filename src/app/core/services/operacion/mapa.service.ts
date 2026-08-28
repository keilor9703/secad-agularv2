import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface DtoMapaIncidente {
  /** Snowflake ID de cad_pedidos (serializado como string). */
  id: string;
  sitioGraba: number;
  codiPedido: string;
  descPedido: string;
  codiPedido2: string;
  descPedido2: string;
  direCaso: string;
  barrio: string;
  ciudad: string;
  latitudCaso: string;
  longitudCaso: string;
  estado: string;
  prioridad: string;
  horaCaso: string;
  usernameCreacion: string;
  origen: string;
  totalActuaciones: number;
  codDane: string;
  // ── Trazabilidad ──────────────────────────────────────────────────────────
  /** Número de llamada PlantaTel (cad_pedidos.nume_llamada). */
  numeLlamada: number | null;
  /** Snowflake ID del evento de despacho (cad_eventos.id). */
  numeEvento: string | null;
  // ── Canal de atención ─────────────────────────────────────────────────────
  canalCodigo: number;
  fuerzaId: number;
  canalDescripcion: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class MapaService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Mapa`;

  constructor(private http: HttpClient) {}

  /**
   * Retorna los incidentes activos con coordenadas válidas para el mapa.
   * @param sitioGraba    Opcional — si se omite, el backend lo resuelve desde el JWT.
   * @param canalCodigo   Opcional — filtra por canal de atención (0 = todos).
   * @param canalFuerzaId Obligatorio cuando canalCodigo &gt; 0: cad_canales.codigo no es
   *   único por sí solo (cada fuerza numera sus canales desde 1); sin este parámetro el
   *   backend devolvería incidentes de cualquier fuerza que reutilice ese mismo código.
   */
  getIncidentesActivos(
    sitioGraba?: number, canalCodigo?: number, canalFuerzaId?: number
  ): Observable<DtoMapaIncidente[]> {
    let params = new HttpParams();
    if (sitioGraba     != null && sitioGraba     > 0) params = params.set('sitioGraba',     sitioGraba.toString());
    if (canalCodigo    != null && canalCodigo    > 0) params = params.set('canalCodigo',    canalCodigo.toString());
    if (canalFuerzaId  != null && canalFuerzaId  > 0) params = params.set('canalFuerzaId',  canalFuerzaId.toString());
    return this.http.get<DtoMapaIncidente[]>(`${this.baseUrl}/incidentes`, { params });
  }
}
