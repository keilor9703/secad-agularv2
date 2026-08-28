import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { DtoAnotacion, DtoAnotacionRequest, DtoPedidoDetalle, DtoPedidoResult } from './pedido.service';

// ─── Eventos-specific DTOs ─────────────────────────────────────────────────────

export interface DtoEventoListItem {
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
  prioridad: string;
  caliPedido: string;
  ciudad: string;
  usernameCreacion: string;
  fechaCreacion: string | null;
  /** Descripción del código de caso principal (JOIN cad_casos). */
  descPedido: string;
  /** Número de actuaciones en estado activo (P/D/A) para este evento. */
  totalActuacionesActivas: number;
  /**
   * Timestamp del primer acceso por un despachador.
   * NULL = nadie ha abierto el evento todavía.
   * Usado para la semaforización SLA (Épica 5).
   */
  fechaPrimerAcceso: string | null;
  /**
   * Canal de origen del evento (PLANTATEL, RECEPCION, APP_MOVIL, INTEGRACION, SIEDCO, INTERNO, MANUAL).
   * Proviene de cad_eventos.origen. Valor por defecto "MANUAL" cuando es NULL en BD.
   */
  origen?: string;
  /**
   * Snowflake ID del registro en cad_eventos (≠ id que es cad_pedidos.id).
   * Este es el número oficial del evento para el despachador.
   * Serializado como string para preservar precisión en JavaScript.
   */
  numeEvento?: string | null;
  /**
   * Nombre de la persona que realizó la llamada o del afectado reportado.
   * Proviene de cad_pedidos.nomb_llamante. Permite búsqueda en lista sin cargar detalle.
   */
  nombLlamante?: string;
}

/** Contadores por estado para los badges de los filtros del canal. */
export interface DtoEventoConteos {
  total:          number;   // activos (cualquier estado != C)
  activos:        number;   // estado = 'A'
  pendientes:     number;   // estado = 'P'
  enProceso:      number;   // estado = 'E'
  seguimiento:    number;   // estado = 'T'
  revision:       number;   // estado = 'R'
  cerradosTurno:  number;   // estado = 'C' solo del turno vigente
  turnoActual:    string;   // "1ro" | "2do" | "3ro"
  turnoDesde:     string;   // ISO-8601 inicio del turno
}

/** Un umbral SLA de la tabla cad_config_sla. */
export interface DtoSlaConfig {
  id: number;
  nombre: string;
  umbralMinutos: number;
  colorHex: string;
  descripcion: string;
  orden: number;
}

export interface DtoCanalItem {
  codigo: number;
  fuerzaId: number;
  descripcion: string;
  fuerzaDesc: string;
}

export interface DtoEstadoRequest {
  estado: string;
  /** Motivo del cambio — obligatorio desde Eventos, queda en cad_pedidos_estado_historial. */
  motivo?: string;
}

/** Una fila del historial de cambios de estado de un caso. */
export interface DtoEstadoHistorialItem {
  estadoAnterior: string | null;
  estadoNuevo:    string;
  motivo:         string | null;
  username:       string | null;
  fecha:          string;
}

/** Caso posiblemente duplicado o con contexto histórico relevante (misma zona/ventana de tiempo). */
export interface DtoPedidoCercano {
  id:              string;
  sitioGraba:      number;
  codiPedido:      string | null;
  codiPedido2:     string | null;
  direCaso:        string | null;
  ciudad:          string | null;
  barrio:          string | null;
  estado:          string | null;
  prioridad:       string | null;
  nombLlamante:    string | null;
  horaCaso:        string | null;
  distanciaMetros: number;
  minutosAtras:    number;
}

/** Código de cierre individual para el módulo Despachador. */
export interface DtoCodigoCierreDespacho {
  orden:             number;
  codigoCierre:      string;
  tipoCodigo?:       string;   // default 'CIERRE'
  descripcionLibre?: string;
}

/**
 * Request para cerrar un evento desde el módulo Despachador.
 * IMPORTANTE: NO incluye comentario ni codiPedido del pedido —
 * esos datos son inmutables en cad_pedidos una vez registrados en Recepción.
 * Solo actualiza cad_eventos (observacion, códigos, estado) y cad_pedidos.estado='C'.
 */
export interface DtoCerrarRequest {
  /** Estado final: 'C' = Cerrado (default), 'V' = Anulado. */
  estado?:             string;
  clasifCierre?:       string;
  observacionCierre?:  string;
  codigosCierre:       DtoCodigoCierreDespacho[];
}

/** Visibilidad multi-canal: un canal SECAD asignado al evento. */
export interface DtoCanalAsignadoEvento {
  codigo:              number;
  fuerzaId:            number;
  fuerzaDescripcion:   string;
  canalDescripcion:    string;
  /** 'A' = activo en la cola de ese canal. 'C' = ese canal ya cerró su participación. */
  estado:              string;
  actuacionesActivas:  number;
  fechaModificacion:   string | null;
  usuarioModifica:     string | null;
}

/** Visibilidad multi-canal: una agencia externa a la que se despachó el caso. */
export interface DtoAgenciaDespachadaEvento {
  agenciaId:   string;
  nombre:      string;
  tipoAgencia: string;
  fechaEnvio:  string;
  exitoso:     boolean;
  enviadoPor:  string | null;
}

export interface DtoCanalesAsignadosResult {
  canales:          DtoCanalAsignadoEvento[];
  agenciasExternas: DtoAgenciaDespachadaEvento[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class EventoService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Evento`;

  constructor(private http: HttpClient) {}

  /**
   * Returns the dispatcher's event queue filtered by canal.
   * If canalId is 0 or omitted the backend reads it from the JWT.
   */
  getEventos(canalId?: number, fuerzaId?: number, estado?: string): Observable<DtoEventoListItem[]> {
    let params = new HttpParams();
    if (canalId  != null && canalId  > 0) params = params.set('canalId',  canalId.toString());
    if (fuerzaId != null && fuerzaId > 0) params = params.set('fuerzaId', fuerzaId.toString());
    if (estado) params = params.set('estado', estado);
    return this.http.get<unknown>(this.baseUrl, { params }).pipe(
      // Blindaje de contrato: quien llama recorre esto con for..of, así que aquí
      // se garantiza que SIEMPRE salga un arreglo. El backend llegó a devolver
      // un objeto { items, warning } cuando el usuario no tenía canal (caso del
      // jefe de turno) y eso reventaba el módulo de Pedido con "is not iterable",
      // dejándolo cargando indefinidamente. Ya se corrigió en el backend, pero un
      // consumidor de una lista no debería poder romperse por la forma del payload.
      map(resp => Array.isArray(resp)
        ? resp as DtoEventoListItem[]
        : ((resp as { items?: DtoEventoListItem[] })?.items ?? []))
    );
  }

  /** Full detail for one event including annotations. */
  getById(id: string): Observable<DtoPedidoDetalle> {
    return this.http.get<DtoPedidoDetalle>(`${this.baseUrl}/${id}`);
  }

  /**
   * Change management state (P=Pendiente, E=En proceso, T=Seguimiento, R=Revisión).
   * motivo es obligatorio — el backend rechaza la solicitud si viene vacío.
   */
  setEstado(id: string, estado: string, motivo: string): Observable<DtoPedidoResult> {
    return this.http.put<DtoPedidoResult>(`${this.baseUrl}/${id}/estado`, { estado, motivo });
  }

  /** Historial de cambios de estado del caso — quién, cuándo, desde/hacia dónde y por qué. */
  getEstadoHistorial(id: string): Observable<DtoEstadoHistorialItem[]> {
    return this.http.get<DtoEstadoHistorialItem[]>(`${this.baseUrl}/${id}/estado-historial`);
  }

  /** Vincula este caso a otro (padre) — mismo incidente real reportado por llamadas distintas. */
  vincular(id: string, sitioGraba: number, numeLlamada: number): Observable<DtoPedidoResult> {
    return this.http.put<DtoPedidoResult>(`${this.baseUrl}/${id}/vincular`, { sitioGraba, numeLlamada });
  }

  /** Quita el vínculo de este caso con su caso padre. */
  desvincular(id: string): Observable<DtoPedidoResult> {
    return this.http.put<DtoPedidoResult>(`${this.baseUrl}/${id}/desvincular`, {});
  }

  /**
   * Casos posiblemente duplicados o con contexto histórico relevante — mismo
   * radio geográfico dentro de una ventana de tiempo (por defecto 7 días).
   */
  getDuplicados(id: string, lat: number, lng: number, radioMetros = 300, diasAtras = 7): Observable<DtoPedidoCercano[]> {
    const params = new HttpParams()
      .set('lat', lat.toString()).set('lng', lng.toString())
      .set('radioMetros', radioMetros.toString()).set('diasAtras', diasAtras.toString());
    return this.http.get<DtoPedidoCercano[]>(`${this.baseUrl}/${id}/duplicados`, { params });
  }

  /** Usernames que vieron este caso en los últimos 5 minutos (excluyendo al usuario actual). */
  getPresencia(id: string): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/${id}/presencia`);
  }

  /**
   * Búsqueda server-side por dirección, código, llamante, teléfono o número de
   * evento/llamada — sin el límite de 300 de la cola en vivo, incluye cerrados.
   * Requiere al menos 3 caracteres.
   */
  buscar(texto: string, fuerzaId?: number, sitioGraba?: number): Observable<DtoEventoListItem[]> {
    let params = new HttpParams().set('texto', texto);
    if (fuerzaId  != null && fuerzaId  > 0) params = params.set('fuerzaId', fuerzaId.toString());
    if (sitioGraba != null && sitioGraba > 0) params = params.set('sitioGraba', sitioGraba.toString());
    return this.http.get<DtoEventoListItem[]>(`${this.baseUrl}/buscar`, { params });
  }

  /** Add an annotation / note to an event. */
  createAnotacion(id: string, request: DtoAnotacionRequest): Observable<DtoPedidoResult> {
    return this.http.post<DtoPedidoResult>(`${this.baseUrl}/${id}/anotaciones`, request);
  }

  /** Retrieve all annotations for an event. */
  getAnotaciones(id: string): Observable<DtoAnotacion[]> {
    return this.http.get<DtoAnotacion[]>(`${this.baseUrl}/${id}/anotaciones`);
  }

  /**
   * Cierra el evento — o, si tiene varios canales asignados (multi-agencia),
   * solo la participación del canal indicado (canalId/fuerzaId). El cierre
   * global ocurre automáticamente cuando todos los canales asignados ya
   * cerraron su parte y no quedan actuaciones abiertas en ninguno.
   */
  cerrar(id: string, request: DtoCerrarRequest, canalId?: number, fuerzaId?: number): Observable<DtoPedidoResult> {
    let params = new HttpParams();
    if (canalId  != null && canalId  > 0) params = params.set('canalId', canalId.toString());
    if (fuerzaId != null && fuerzaId > 0) params = params.set('fuerzaId', fuerzaId.toString());
    return this.http.post<DtoPedidoResult>(`${this.baseUrl}/${id}/cerrar`, request, { params });
  }

  /** Canales SECAD + agencias externas que tienen conocimiento del evento. */
  getCanalesAsignados(id: string): Observable<DtoCanalesAsignadosResult> {
    return this.http.get<DtoCanalesAsignadosResult>(`${this.baseUrl}/${id}/canales-asignados`);
  }

  /** Available channels for a site (used by the canal selector). */
  getCanales(sitioGraba?: number): Observable<DtoCanalItem[]> {
    let params = new HttpParams();
    if (sitioGraba != null && sitioGraba > 0)
      params = params.set('sitioGraba', sitioGraba.toString());
    return this.http.get<DtoCanalItem[]>(`${this.baseUrl}/canales`, { params });
  }

  /**
   * Returns per-state event counts for the dispatcher's filter badges.
   * Closed events only count those within the current surveillance shift.
   * Lightweight single-query endpoint — safe to poll every 15 s.
   */
  getConteos(canalId?: number, fuerzaId?: number): Observable<DtoEventoConteos> {
    let params = new HttpParams();
    if (canalId  != null && canalId  > 0) params = params.set('canalId',  canalId.toString());
    if (fuerzaId != null && fuerzaId > 0) params = params.set('fuerzaId', fuerzaId.toString());
    return this.http.get<DtoEventoConteos>(`${this.baseUrl}/conteos`, { params });
  }

  /**
   * Returns active SLA thresholds from the backend.
   * Used for color-coding the dispatcher queue — values are DB-configurable,
   * never hardcoded in the frontend.
   */
  getSlaConfig(): Observable<DtoSlaConfig[]> {
    return this.http.get<DtoSlaConfig[]>(`${this.baseUrl}/sla-config`);
  }
}
