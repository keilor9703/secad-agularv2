import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface DtoPedidoListItem {
  /** Snowflake ID serializado como string para preservar precisión en JavaScript. */
  id: string;
  sitioGraba: number;
  numeLlamada: number | null;
  horaCaso: string | null;
  numeTelefono: number | null;
  direCaso: string;
  estado: string;
  enviar: string;
  codiPedido: string;
  codiPedido2: string;
  comentario: string;
  usernameCreacion: string;
  fechaCreacion: string | null;

  // ── Campos opcionales enriquecidos por el módulo de seguimiento ───────────
  /** Prioridad normalizada: FLASH | INMEDIATA | RUTINA (o código 01/02/03). */
  prioridad?: string;
  /** Canal de origen del incidente (OrigenEvento). */
  origen?: string;
  /** Snowflake ID del registro cad_eventos (≠ id que es cad_pedidos.id). */
  numeEvento?: string | null;
  /** Descripción legible del código de caso 1 (JOIN cad_casos). */
  descPedido?: string;
  /** Descripción legible del código de caso 2. */
  descPedido2?: string;
}

export interface DtoAnotacion {
  id: number;
  idPedido: number;
  titulo: string;
  anotacion: string;
  tipoAnotacion: string;
  usuarioCreacion: number | null;
  usernameCreacion: string;
  fechaCreacion: string | null;
  maquinaCreacion: string;
}

export interface DtoPedidoDetalle extends DtoPedidoListItem {
  propTelefono: string;
  nombLlamante: string;
  barrio: string;
  ciudad: string;
  direLlamante: string;
  latitudCaso: string;
  longitudCaso: string;
  cordx: string;
  cordy: string;
  tiposhape: string;
  radio: number;
  tipoPedido: string;
  caliPedido: string;
  importancia: string;
  prioridad: string;
  dispTelefonico: string;
  celdaMarcacion: string;
  canales: string;
  canalFuerza: string;
  pedidoPadreSitio: number | null;
  pedidoPadreNum: number | null;
  /** Descripción del código de caso 1 (JOIN cad_casos.descripcion). */
  descPedido: string;
  /** Descripción del código de caso 2 (JOIN cad_casos.descripcion). */
  descPedido2: string;
  anotaciones: DtoAnotacion[];
  // ── Datos del evento de despacho ─────────────────────────────────────────
  eventoId:          string | null;
  canalCodigo:       number;
  canalDescripcion:  string;
  fuerzaDescripcion: string;
  fechaCierre:       string | null;
  observacionCierre: string;
  usuarioCierre:     string;
  codigosCierre:     DtoCodigoCierrePedido[];
  // ── Trazabilidad (cad_auditoria_acceso_evento) ───────────────────────────
  /** Username del último despachador que abrió este evento. */
  ultimoAccesoUsername: string | null;
  /** Fecha/hora del último acceso registrado. */
  ultimoAccesoFecha:    string | null;
  /** Estado propio de cad_eventos (P/D/A/C/V) — dominio distinto de `estado` (cad_pedidos, sin 'V'). */
  eventoEstado: string | null;
}

export interface DtoCodigoCierrePedido {
  orden:            number;
  codigoCierre:     string;
  tipoCodigo:       string;
  descripcionLibre: string;
}

export interface DtoPedidoRequest {
  sitioGraba: number;
  numeLlamada: number;
  horaCaso: string;
  numeTelefono: number;
  propTelefono: string;
  nombLlamante: string;
  barrio: string;
  ciudad: string;
  direLlamante: string;
  direCaso: string;
  latitudCaso: string;
  longitudCaso: string;
  cordx: string;
  cordy: string;
  tiposhape: string;
  radio: number;
  comentario: string;
  codiPedido: string;
  codiPedido2: string;
  tipoPedido: string;
  caliPedido: string;
  importancia: string;
  prioridad: string;
  dispTelefonico: string;
  celdaMarcacion: string;
  canalesSeleccionados: number[];
  canalFuerza: string;
  enviar: string;
  estado: string;
  pedidoPadreSitio: number | null;
  pedidoPadreNum: number | null;
}

export interface DtoCerrarRapidoRequest {
  comentario: string;
  codiPedido: string;
  enviar: string;
}

export interface DtoAnotacionRequest {
  titulo: string;
  anotacion: string;
  tipoAnotacion: string;
}

export interface DtoPedidoResult {
  success: boolean;
  /** Snowflake ID como string. */
  id: string;
  message: string;
  /**
   * Nuevo estado del pedido si esta operación lo promovió automáticamente a
   * 'E' (En proceso); ausente/null si no cambió.
   */
  estadoActual?: string | null;
}

export interface DtoPedidoAsociar {
  id: number;
  numeLlamada: number | null;
  horaCaso: string;
  numeTelefono: number | null;
  caliPedido: string;
  ciudad: string;
  nombLlamante: string;
  direCaso: string;
  codiPedido: string;
  estado: string;
  sitioGraba: number;
}

/** Página de resultados de getList() — ver DtoPedidoListPagedResult en el backend. */
export interface DtoPedidoListPagedResult {
  items: DtoPedidoListItem[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class PedidoService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Pedido`;

  constructor(private http: HttpClient) {}

  /**
   * Lista paginada de pedidos. cad_pedidos puede crecer a millones de filas —
   * ya no trae "todo" de una vez, sino una página con fechaDesde/fechaHasta
   * (fecha local de Colombia, formato YYYY-MM-DD) opcionales.
   */
  getList(
    estado?: string, sitioGraba?: number,
    fechaDesde?: string, fechaHasta?: string,
    page = 1, pageSize = 100
  ): Observable<DtoPedidoListPagedResult> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('pageSize', pageSize.toString());
    if (estado)      params = params.set('estado', estado);
    if (sitioGraba != null) params = params.set('sitioGraba', sitioGraba.toString());
    if (fechaDesde)  params = params.set('fechaDesde', fechaDesde);
    if (fechaHasta)  params = params.set('fechaHasta', fechaHasta);
    return this.http.get<DtoPedidoListPagedResult>(this.baseUrl, { params });
  }

  getById(id: string): Observable<DtoPedidoDetalle> {
    return this.http.get<DtoPedidoDetalle>(`${this.baseUrl}/${id}`);
  }

  create(request: DtoPedidoRequest): Observable<DtoPedidoResult> {
    return this.http.post<DtoPedidoResult>(this.baseUrl, request);
  }

  update(id: string, request: DtoPedidoRequest): Observable<DtoPedidoResult> {
    return this.http.put<DtoPedidoResult>(`${this.baseUrl}/${id}`, request);
  }

  cerrarRapido(id: string, request: DtoCerrarRapidoRequest): Observable<DtoPedidoResult> {
    return this.http.post<DtoPedidoResult>(`${this.baseUrl}/${id}/cerrar-rapido`, request);
  }

  setEstado(id: string, estado: string): Observable<DtoPedidoResult> {
    return this.http.put<DtoPedidoResult>(`${this.baseUrl}/${id}/estado`, { estado });
  }

  getAnotaciones(id: string): Observable<DtoAnotacion[]> {
    return this.http.get<DtoAnotacion[]>(`${this.baseUrl}/${id}/anotaciones`);
  }

  createAnotacion(id: string, request: DtoAnotacionRequest): Observable<DtoPedidoResult> {
    return this.http.post<DtoPedidoResult>(`${this.baseUrl}/${id}/anotaciones`, request);
  }

  buscarAsociar(sitioGraba: number): Observable<DtoPedidoAsociar[]> {
    const params = new HttpParams().set('sitioGraba', sitioGraba.toString());
    return this.http.get<DtoPedidoAsociar[]>(`${this.baseUrl}/buscar-asociar`, { params });
  }
}
