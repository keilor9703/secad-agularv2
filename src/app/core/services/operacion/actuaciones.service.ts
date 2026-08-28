import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── Constantes de estado de actuación ────────────────────────────────────────
export const ESTADO_ACTUACION = {
  PENDIENTE:  'P',   // asignada, sin despachar
  DESPACHADA: 'D',   // unidad en camino
  ATENDIDA:   'A',   // unidad en el lugar del hecho
  CERRADA:    'C',   // actuación finalizada
  ANULADA:    'V'    // no fue necesaria / error
} as const;
export type EstadoActuacion = typeof ESTADO_ACTUACION[keyof typeof ESTADO_ACTUACION];

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface DtoCodigoCierreActuacion {
  orden:             number;
  codigoCierre:      string;
  tipoCodigo:        'CIERRE' | 'DISPOSICION' | 'NOVEDAD';
  descripcionLibre?: string;
}

export interface DtoActuacionUnidad {
  id:               number;
  unidadCodigo:     string;
  placa?:           string;
  tipoUnidad?:      string;
  estado:           'D' | 'A' | 'L' | 'V';
  fechaDespacho?:   string;
  fechaLlegada?:    string;
  fechaLiberacion?: string;
  observacion?:     string;
}

export interface DtoActuacionNota {
  id:               number;
  nota:             string;
  tipoNota:         'GENERAL' | 'NOVEDAD' | 'ALERTA' | 'CIERRE';
  usuarioRegistra:  string;
  fechaRegistra:    string;
}

/** DTO completo — usado en el panel de detalle del despachador */
export interface DtoActuacion {
  id:                    string;   // Snowflake → string
  eventoId:              string;   // Snowflake → string
  pedidoId?:             string;   // Snowflake → string
  sitioGraba:            number;
  fuerzaId?:             number;
  canalCodigo?:          number;
  fuerzaDescripcion:     string;
  canalDescripcion:      string;
  despachadorUsuario?:   string;
  tipoDespachador?:      string;
  unidadAsignada?:       string;
  placaUnidad?:          string;
  estado:                EstadoActuacion;
  fechaCreacion:         string;
  fechaDespacho?:        string;
  fechaLlegada?:         string;
  fechaCierre?:          string;
  codigoCierrePrimario?: string;
  clasifCierre?:         string;
  observacionCierre?:    string;
  caliPedido?:           string;
  fechaModificacion?:    string;
  usuarioModifica?:      string;
  codigosCierre:         DtoCodigoCierreActuacion[];
  unidades:              DtoActuacionUnidad[];
  notas:                 DtoActuacionNota[];
}

/** Item reducido para la grilla de actuaciones de un evento */
export interface DtoActuacionListItem {
  id:              string;   // Snowflake → string
  eventoId:        string;   // Snowflake → string
  fuerzaDesc:      string;
  canalDesc:       string;
  /**
   * Canal/fuerza que asignó este recurso. Se compara contra la sesión activa
   * para habilitar los botones de gestión — solo el canal que lo asignó puede
   * operarlo (el backend igual lo valida; esto es solo para no ofrecer
   * acciones que van a fallar).
   */
  canalCodigo?:    number;
  fuerzaId?:       number;
  unidadAsignada?: string;
  /** Nombre legible del cuadrante (patrulla_desc) — se muestra en la UI en vez del código. */
  unidadDesc?:     string;
  estado:          EstadoActuacion;
  fechaCreacion:   string;
  fechaDespacho?:  string;
  fechaLlegada?:   string;
  fechaCierre?:    string;
  caliPedido?:          string;
  totalUnidades?:       number;
  totalNotas?:          number;
  placaUnidad?:         string;
  /** Username de quien despachó el recurso — auditoría para el Jefe de Turno. */
  despachadorUsuario?:  string;
  /** Solicitud de apoyo urgente activa sobre este recurso (seguridad del funcionario). */
  solicitaApoyo?:       boolean;
  fechaSolicitaApoyo?:  string;
}

/** Request: crear nueva actuación (primer paso del flujo de despacho) */
export interface DtoCrearActuacionRequest {
  /** cad_pedidos.id — Snowflake transmitido como string para preservar precisión. */
  eventoId:        string;
  sitioGraba?:     number;
  fuerzaId?:       number;
  canalCodigo?:    number;
  /** Código de patrulla/unidad — snapshot del recurso asignado */
  unidadAsignada?: string;
  placaUnidad?:    string;
  /** ID del medio (string para preservar precisión del Snowflake ID en JSON) */
  medioId?:        string;
  tipoDespachador?: string;
}

/** Request: avanzar estado operativo (D o A) */
export interface DtoActualizarEstadoActuacionRequest {
  estado:          'D' | 'A';
  unidadAsignada?: string;
  placaUnidad?:    string;
}

/** Request: cerrar la actuación con códigos */
export interface DtoCierreActuacionRequest {
  estado:             'C' | 'V';
  clasifCierre?:      string;
  observacionCierre?: string;
  codigosCierre:      DtoCodigoCierreActuacion[];
  /** Resultado operativo estructurado (V12) */
  actividadCodigo?:  string;
  actividadTipo?:    string;   // 'O' | 'P'
  actividadDesc?:    string;
  delitoArticulo?:   string;
  delitoDesc?:       string;
}

/** Item del catálogo de actividades policiales (cad_act_policial) */
export interface DtoActividadPolicial {
  id:             number;
  tipo:           'O' | 'P';
  codigo:         string;
  descripcion:    string;
  requiereDelito: boolean;
  orden:          number;
}

/** Item del catálogo de delitos — Código Penal Colombiano (cad_delitos) */
export interface DtoDelitoItem {
  id:            number;
  articulo:      string;
  descripcion:   string;
  bienJuridico?: string;
}

/** Item de código de tipificación/cierre (cad_casos) */
export interface DtoCodigoCasoItem {
  codigo:      string;
  descripcion: string;
}

/** Request: agregar nota de campo */
export interface DtoAgregarNotaActuacionRequest {
  nota:     string;
  tipoNota: 'GENERAL' | 'NOVEDAD' | 'ALERTA' | 'CIERRE';
}

/** Request: registrar unidad adicional */
export interface DtoAgregarUnidadActuacionRequest {
  unidadCodigo: string;
  placa?:       string;
  tipoUnidad?:  string;
  observacion?: string;
}

/** Respuesta genérica de operaciones sobre actuaciones */
export interface DtoActuacionResult {
  success:     boolean;
  message:     string;
  actuacionId: number;
  subId?:      number;  // ID del sub-registro creado (nota, unidad)
  /**
   * Nuevo estado del pedido (cad_pedidos.estado) si esta operación lo
   * promovió automáticamente a 'E' (En proceso); ausente/null si no cambió.
   */
  estadoEventoActual?: string | null;
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ActuacionesService {
  private readonly base = `${environment.apiBaseUrl}/Actuaciones`;

  constructor(private http: HttpClient) {}

  // ── Consultas ─────────────────────────────────────────────────────────────────

  /**
   * Lista todas las actuaciones de un evento (una por agencia/canal).
   * Incluye conteo de notas y unidades por actuación.
   */
  getActuacionesEvento(eventoId: string): Observable<{ success: boolean; data: DtoActuacionListItem[] }> {
    return this.http.get<{ success: boolean; data: DtoActuacionListItem[] }>(
      `${this.base}/evento/${eventoId}`
    );
  }

  /**
   * Detalle completo de una actuación: datos base + códigos + unidades + notas.
   */
  getActuacion(id: string): Observable<{ success: boolean; data: DtoActuacion }> {
    return this.http.get<{ success: boolean; data: DtoActuacion }>(
      `${this.base}/${id}`
    );
  }

  // ── Creación ──────────────────────────────────────────────────────────────────

  /**
   * Crea una actuación en estado P (Asignado) — primer paso del flujo de despacho.
   * Vincula el medio al evento si se proporciona medioId.
   */
  crearActuacion(
    req: DtoCrearActuacionRequest
  ): Observable<{ success: boolean; message: string; actuacionId: string; estadoEventoActual?: string | null }> {
    return this.http.post<{ success: boolean; message: string; actuacionId: string; estadoEventoActual?: string | null }>(
      this.base, req
    );
  }

  // ── Ciclo operativo ───────────────────────────────────────────────────────────

  /**
   * Marca la actuación como Despachada (D) o Atendida (A).
   * Registra automáticamente el timestamp correspondiente.
   */
  actualizarEstado(
    id: string,
    req: DtoActualizarEstadoActuacionRequest
  ): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.base}/${id}/estado`,
      req
    );
  }

  /**
   * Cierra la actuación (C=Cerrada / V=Anulada) con sus códigos.
   * El trigger de BD recalcula el estado global del evento.
   */
  cerrarActuacion(
    id: string,
    req: DtoCierreActuacionRequest
  ): Observable<DtoActuacionResult> {
    return this.http.post<DtoActuacionResult>(
      `${this.base}/${id}/cerrar`,
      req
    );
  }

  // ── Sub-registros ─────────────────────────────────────────────────────────────

  /**
   * Agrega una nota de campo a la actuación.
   * tipoNota: GENERAL | NOVEDAD | ALERTA | CIERRE
   */
  agregarNota(
    id: string,
    req: DtoAgregarNotaActuacionRequest
  ): Observable<DtoActuacionResult> {
    return this.http.post<DtoActuacionResult>(
      `${this.base}/${id}/notas`,
      req
    );
  }

  /**
   * Registra una unidad adicional despachada dentro de la actuación.
   * Usar cuando la agencia envía más de un recurso al mismo incidente.
   */
  agregarUnidad(
    id: string,
    req: DtoAgregarUnidadActuacionRequest
  ): Observable<DtoActuacionResult> {
    return this.http.post<DtoActuacionResult>(
      `${this.base}/${id}/unidades`,
      req
    );
  }

  /**
   * Cancela/desasigna un recurso de una actuación en P, D o A. Anula la
   * actuación (→V) y libera el medio (→Libre 27). En P el motivo es opcional
   * (el backend usa un texto por defecto); en D/A (ya en ruta o en sitio) el
   * motivo es OBLIGATORIO — no se rellena con un texto genérico acá para que
   * el backend lo rechace de verdad si el operador no explicó por qué.
   */
  desasignarActuacion(
    id: string,
    motivo?: string
  ): Observable<{ success: boolean; message: string; actuacionId: string }> {
    return this.http.post<{ success: boolean; message: string; actuacionId: string }>(
      `${this.base}/${id}/desasignar`,
      { motivo }
    );
  }

  /** Marca una solicitud de apoyo urgente activa sobre el recurso (seguridad del funcionario). */
  solicitarApoyo(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.base}/${id}/apoyo/solicitar`, {});
  }

  /** Marca como atendida una solicitud de apoyo urgente activa. */
  atenderApoyo(id: string): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(`${this.base}/${id}/apoyo/atender`, {});
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────────

  /** Etiqueta legible para el estado de una actuación */
  etiquetaEstado(estado: EstadoActuacion): string {
    const map: Record<EstadoActuacion, string> = {
      P: 'Pendiente',
      D: 'En camino',
      A: 'En sitio',
      C: 'Cerrada',
      V: 'Anulada'
    };
    return map[estado] ?? estado;
  }

  /** Clase CSS para el badge de estado */
  claseEstado(estado: EstadoActuacion): string {
    const map: Record<EstadoActuacion, string> = {
      P: 'badge-warning',
      D: 'badge-info',
      A: 'badge-success',
      C: 'badge-secondary',
      V: 'badge-danger'
    };
    return map[estado] ?? '';
  }

  // ── Catálogos ─────────────────────────────────────────────────────────────

  /**
   * Catálogo de actividades policiales.
   * tipo = 'O' (Operativas), 'P' (Preventivas), undefined = todas.
   */
  getActividadesPoliciales(tipo?: 'O' | 'P'):
    Observable<{ success: boolean; data: DtoActividadPolicial[] }> {
    const qs = tipo ? `?tipo=${tipo}` : '';
    return this.http.get<{ success: boolean; data: DtoActividadPolicial[] }>(
      `${this.base}/actividades-policiales${qs}`
    );
  }

  /**
   * Búsqueda de delitos del Código Penal Colombiano por texto libre.
   * Busca en artículo, descripción y bien jurídico.
   */
  buscarDelitos(q: string):
    Observable<{ success: boolean; data: DtoDelitoItem[] }> {
    return this.http.get<{ success: boolean; data: DtoDelitoItem[] }>(
      `${this.base}/delitos?q=${encodeURIComponent(q)}`
    );
  }

  /**
   * Búsqueda de códigos de tipificación/cierre en cad_casos.
   * Misma tabla que usa Recepción para tipificar casos.
   */
  buscarCodigosCierre(q: string):
    Observable<{ success: boolean; data: DtoCodigoCasoItem[] }> {
    return this.http.get<{ success: boolean; data: DtoCodigoCasoItem[] }>(
      `${this.base}/codigos-cierre?q=${encodeURIComponent(q)}`
    );
  }
}
