import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── Constantes de origen (deben coincidir con el CHECK en cad_eventos.origen) ─
export const ORIGEN_EVENTO = {
  PLANTATEL:   'PLANTATEL',
  RECEPCION:   'RECEPCION',
  APP_MOVIL:   'APP_MOVIL',
  INTEGRACION: 'INTEGRACION',
  SIEDCO:      'SIEDCO',
  INTERNO:     'INTERNO',
  MANUAL:      'MANUAL',
  CHAT:        'CHAT',
  SMS:         'SMS'
} as const;
export type OrigenEvento = typeof ORIGEN_EVENTO[keyof typeof ORIGEN_EVENTO];

// ─── Constantes de estado del evento ────────────────────────────────────────────
export const ESTADO_EVENTO = {
  PENDIENTE:  'P',
  DESPACHADO: 'D',
  ATENDIDO:   'A',
  CERRADO:    'C',
  ANULADO:    'V'
} as const;
export type EstadoEvento = typeof ESTADO_EVENTO[keyof typeof ESTADO_EVENTO];

// ─── DTOs de recepción ───────────────────────────────────────────────────────────

export interface DtoLlamadaEntrante {
  NUME_LLAMADA:  number;
  NUME_TELEFONO: number;
  CORDX:         string;
  CORDY:         string;
  TIPOSHAPE:     string;
  RADIO:         number;
  FECHAGMLC:     string;
  OPERADOR:      string;
}

export interface DtoCasoItem {
  CODIGO_CASO:             string;
  DESCRIPCION_CASO:        string;
  /** ID (string) de la categoría del Asistente vinculada. Null = sin asistente. */
  ID_CATEGORIA_ASISTENTE?: string | null;
  /** Código corto de la categoría (ej: HURTO, RINA). Usado para seleccionar plantilla narrativa. */
  CATEGORIA_CODIGO?:       string | null;
  /** Descripción legible de la categoría (JOIN informativo). */
  CATEGORIA_DESCRIPCION?:  string | null;
}

export interface DtoCanalRecepcion {
  codigo:        number;
  descripcion:   string;
  fuerza:        string;
  /** ID numérico de la fuerza. El frontend lo compara con fuerzaId del JWT
   *  para distinguir canales propios de canales de agencias SECAD externas. */
  fuerzaId:      number;
  seleccionado?: boolean;   // UI only — no se envía al backend
}

/**
 * Llave compuesta de un canal seleccionado para despacho.
 * El `codigo` solo NO es único: distintas fuerzas pueden tener el mismo número de canal.
 */
export interface DtoCanalSeleccionado {
  codigo:   number;
  fuerzaId: number;
}

export interface DtoReferenciaSecad {
  Nombre:      string;
  Codigo:      string;
  Descripcion: string;
  Abreviatura: string;
}

export interface DtoBusquedaAsociarLlamada {
  sitioGraba:  number;
  horaCaso:    string;
  numeLlamada: number;
}

export interface DtoLlamadaAsociar {
  NUME_LLAMADA:  number;
  HORA_CASO:     string;
  NUME_TELEFONO: number;
  CALI_PEDIDO:   string;
  CIUDAD:        string;
  NOMB_LLAMANTE: string;
  DIRE_CASO:     string;
  CODI_PEDIDO:   string;
  ESTADO:        string;
  SITIO_GRABA:   number;
}

export interface DtoRecepcion {
  SITIO_GRABA:          number;
  NUME_LLAMADA:         number;
  HORA_CASO:            string;
  NUME_TELEFONO:        number;
  PROP_TELEFONO:        string;
  NOMB_LLAMANTE:        string;
  DIRE_LLAMANTE:        string;
  TIPO_PEDIDO:          string;
  CALI_PEDIDO:          string;
  BARRIO:               string;
  CIUDAD:               string;
  DIRE_CASO:            string;
  LATITUD_CASO:         string;
  LONGITUD_CASO:        string;
  COMENTARIO:           string;
  CODI_PEDIDO:          string;
  CODI_PEDIDO2:         string;
  IMPORTANCIA:          string;
  PRIORIDAD:            string;
  DISP_TELEFONICO:      string;
  OPERADOR:             string;
  ESTADO:               string;
  ENVIAR:               string;
  /** Origen del evento a registrar. Por defecto 'RECEPCION'; usar 'PLANTATEL' si la
   *  llamada llega de la centralita telefónica, 'APP_MOVIL', etc. */
  Origen:               OrigenEvento;
  CANALES_SELECCIONADOS: DtoCanalSeleccionado[];
  CANAL_FUERZA:         number | null;
  CADPEDI_SITIO_GRABA:  string | null;
  CADPEDI_NUME_LLAMADA: string | null;
}

export interface RecepcionApiResponse<T = unknown> {
  success: boolean;
  data:    T;
  message: string;
}

// ─── DTOs de eventos ─────────────────────────────────────────────────────────────

export interface DtoCodigoCierreEvento {
  orden:            number;
  codigoCierre:     string;
  tipoCodigo:       'CIERRE' | 'DISPOSICION' | 'NOVEDAD';
  descripcionLibre?: string;
}

export interface DtoEvento {
  /** Snowflake ID, serializado como string desde el backend para preservar precisión. */
  id:                   string;
  sitioGraba:           number;
  origen:               OrigenEvento;
  origenReferenciaExt?: string;
  integracionClienteId?: number;
  integracionNombre?:   string;
  /** Snowflake ID (cad_pedidos.id), serializado como string. */
  pedidoId?:            string;
  pedidoSitioGraba?:    number;
  horaCasoPedido:       string;
  direccionCaso:        string;
  codiPedido:           string;
  caliPedido:           string;
  fuerzaId?:            number;
  fuerzaDescripcion:    string;
  canalCodigo?:         number;
  canalDescripcion:     string;
  ceduEmpleado?:        string;
  usuarioGenera:        string;
  tipoDespachador?:     string;
  estado:               EstadoEvento;
  fechaCreacion:        string;
  fechaDespacho?:       string;
  fechaLlegada?:        string;
  fechaCierre?:         string;
  codigoCierrePrimario?: string;
  clasifCierre?:        string;
  observacionCierre?:   string;
  codigosCierre:        DtoCodigoCierreEvento[];
}

export interface DtoEventoListItem {
  /** Snowflake ID, serializado como string desde el backend para preservar precisión. */
  id:            string;
  origen:        OrigenEvento;
  estado:        EstadoEvento;
  /** Snowflake ID (cad_pedidos.id), serializado como string. */
  pedidoId?:     string;
  direccionCaso: string;
  codiPedido:    string;
  caliPedido:    string;
  fuerzaDesc:    string;
  canalDesc:     string;
  fechaCreacion: string;
  fechaDespacho?: string;
  fechaCierre?:   string;
}

export interface DtoCierreEventoRequest {
  /** Snowflake ID (cad_eventos.id), enviado como string. */
  eventoId:          string;
  estado:            'C' | 'V';
  clasifCierre?:     string;
  observacionCierre?: string;
  codigosCierre:     DtoCodigoCierreEvento[];
}

export interface DtoEventoIntegracionRequest {
  origen:               OrigenEvento;
  integracionClienteId: number;
  origenReferenciaExt?: string;
  sitioGraba:           number;
  direccionCaso:        string;
  ciudad:               string;
  barrio:               string;
  latitudCaso?:         string;
  longitudCaso?:        string;
  codiPedido:           string;
  caliPedido:           string;
  comentario:           string;
  nombReportante:       string;
  telefonoReportante?:  string;
  canalesSugeridos:     number[];
}

export interface DtoEventoResult {
  success:  boolean;
  message:  string;
  /** Snowflake ID, serializado como string desde el backend para preservar precisión. */
  eventoId: string;
  /** Snowflake ID (cad_pedidos.id), serializado como string. */
  pedidoId?: string;
}

// ─── Duplicado / pedido cercano (§6.8) ───────────────────────────────────────
/**
 * Pedido (llamada) activo encontrado en un radio geográfico — alerta de posible duplicado.
 * Los datos vienen de cad_pedidos, que es donde el formulario de recepción guarda
 * la georreferenciación y los códigos de caso.
 */
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

// ─── Adjuntos (fotos vinculadas a pedidos) ───────────────────────────────────────

export interface DtoAdjunto {
  /** ID Snowflake como string para preservar precisión JS */
  id:             string;
  pedidoId:       string;
  sitioGraba:     number;
  tipoAdjunto:    'FOTO' | 'DOCUMENTO' | 'AUDIO' | 'VIDEO';
  nombreOriginal: string;
  nombreGuardado: string;
  rutaRelativa:   string;
  urlPublica:     string;
  mimeType:       string;
  tamanioBytes:   number;
  descripcion?:   string | null;
  canalOrigen:    'MANUAL' | 'API_CHAT' | 'API_SMS' | 'API_FOTO' | 'VIDEOLLAMADA';
  subidoPor:      string;
  fechaSubida:    string;
  /** Metadatos de la videollamada (solo si canalOrigen === 'VIDEOLLAMADA') */
  numeroTelefonoLlamada?: string | null;
  fechaInicioLlamada?:    string | null;
  duracionSegundos?:      number | null;
}

// ─── Service ─────────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class RecepcionService {
  private readonly base = `${environment.apiBaseUrl}/Recepcion`;

  constructor(private http: HttpClient) {}

  // ── PlantaTel / Incoming call ────────────────────────────────────────────────

  /** Poll para llamada entrante desde centralita */
  getLlamada(): Observable<RecepcionApiResponse<DtoLlamadaEntrante | null>> {
    return this.http.get<RecepcionApiResponse<DtoLlamadaEntrante | null>>(
      `${this.base}/llamada`
    );
  }

  /** Genera un ID Snowflake para la llamada (sin round-trip a BD) */
  getConsecutivo(): Observable<RecepcionApiResponse<number>> {
    return this.http.post<RecepcionApiResponse<number>>(`${this.base}/consecutivo`, {});
  }

  // ── Catalogs ─────────────────────────────────────────────────────────────────

  getCanales(sitioGraba?: number): Observable<DtoCanalRecepcion[]> {
    const qs = sitioGraba != null ? `?sitioGraba=${sitioGraba}` : '';
    return this.http.get<DtoCanalRecepcion[]>(`${this.base}/canales${qs}`);
  }

  getReferencias(nombre: string): Observable<DtoReferenciaSecad[]> {
    return this.http.get<DtoReferenciaSecad[]>(
      `${this.base}/referencias?nombre=${encodeURIComponent(nombre)}`
    );
  }

  buscarCasos(busqueda: string): Observable<RecepcionApiResponse<DtoCasoItem[]>> {
    return this.http.post<RecepcionApiResponse<DtoCasoItem[]>>(
      `${this.base}/casos-intel`,
      { Busqueda: busqueda }
    );
  }

  getCasoPorCodigo(codigo: string): Observable<RecepcionApiResponse<DtoCasoItem | null>> {
    return this.http.post<RecepcionApiResponse<DtoCasoItem | null>>(
      `${this.base}/caso-por-codigo`,
      { Codigo: codigo }
    );
  }

  buscarAsociar(dto: DtoBusquedaAsociarLlamada): Observable<RecepcionApiResponse<DtoLlamadaAsociar[]>> {
    return this.http.post<RecepcionApiResponse<DtoLlamadaAsociar[]>>(
      `${this.base}/buscar-asociar`,
      dto
    );
  }

  // ── Save / close ─────────────────────────────────────────────────────────────

  /** Guarda la llamada completa. Escribe en cad_pedidos + cad_eventos + cad_pedidos_canales */
  guardar(datos: DtoRecepcion): Observable<{ success: boolean; message: string; pedidoId?: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.base}/guardar`,
      datos
    );
  }

  /** Cierre rápido: crea pedido + evento anulado sin despachar */
  cerrarRapido(datos: DtoRecepcion): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>(
      `${this.base}/cerrar-rapido`,
      datos
    );
  }

  // ── Event lifecycle (usado desde módulo Eventos — despachador) ────────────────

  /** Detalle completo de un evento con sus códigos de cierre */
  getEvento(id: string): Observable<{ success: boolean; data: DtoEvento }> {
    return this.http.get<{ success: boolean; data: DtoEvento }>(
      `${this.base}/evento/${id}`
    );
  }

  /** Eventos asociados a un pedido (llamada) */
  getEventosPorPedido(pedidoId: string): Observable<{ success: boolean; data: DtoEventoListItem[] }> {
    return this.http.get<{ success: boolean; data: DtoEventoListItem[] }>(
      `${this.base}/evento/pedido/${pedidoId}`
    );
  }

  /** Marca el evento como Despachado (D) o Atendido (A) */
  actualizarEstadoEvento(id: string, estado: 'D' | 'A'): Observable<{ success: boolean; message: string }> {
    return this.http.put<{ success: boolean; message: string }>(
      `${this.base}/evento/${id}/estado`,
      { Estado: estado }
    );
  }

  /** Cierra el evento con uno o más códigos de cierre */
  cerrarEvento(req: DtoCierreEventoRequest): Observable<DtoEventoResult> {
    return this.http.post<DtoEventoResult>(
      `${this.base}/evento/cerrar`,
      req
    );
  }

  // ── External integration ──────────────────────────────────────────────────────

  /** Crea un evento desde un sistema externo (app móvil, API, SIEDCO, etc.) */
  crearEventoIntegracion(req: DtoEventoIntegracionRequest): Observable<DtoEventoResult> {
    return this.http.post<DtoEventoResult>(
      `${this.base}/integracion/evento`,
      req
    );
  }

  // ── Remisión a canal SECAD (§6.11 / §6.1) ────────────────────────────────────

  /** Remite un pedido/evento a canales SECAD adicionales. */
  remitirCanal(req: {
    pedidoId:    string;
    sitioGraba:  number;
    eventoId:    string;
    canales:     DtoCanalSeleccionado[];
    observacion?: string;
    /** true = remover del canal origen (gestión exclusiva en el destino). */
    removerCanalOrigen?:  boolean;
    canalOrigenCodigo?:   number;
    canalOrigenFuerzaId?: number;
  }): Observable<{ success: boolean; message: string; canalesAgregados: number }> {
    return this.http.post<{ success: boolean; message: string; canalesAgregados: number }>(
      `${this.base}/remitir-canal`, req
    );
  }

  // ── Adjuntos (fotos vinculadas a pedidos) ────────────────────────────────────

  /**
   * Sube una foto (JPG/PNG/WEBP, máx 8 MB) vinculada a un pedido.
   * Usa multipart/form-data.
   */
  subirAdjunto(
    pedidoId:   number | string,
    sitioGraba: number,
    file:       File,
    descripcion?: string
  ): Observable<{ success: boolean; data: DtoAdjunto; message: string }> {
    const form = new FormData();
    form.append('File',       file);
    form.append('PedidoId',   String(pedidoId));
    form.append('SitioGraba', String(sitioGraba));
    form.append('CanalOrigen', 'MANUAL');
    if (descripcion) form.append('Descripcion', descripcion);
    return this.http.post<{ success: boolean; data: DtoAdjunto; message: string }>(
      `${environment.apiBaseUrl}/Adjunto/subir`, form
    );
  }

  /** Lista las fotos de un pedido. */
  getAdjuntos(pedidoId: number | string): Observable<{ success: boolean; data: DtoAdjunto[] }> {
    return this.http.get<{ success: boolean; data: DtoAdjunto[] }>(
      `${environment.apiBaseUrl}/Adjunto/${pedidoId}`
    );
  }

  /** Elimina una foto por su ID. */
  eliminarAdjunto(adjuntoId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(
      `${environment.apiBaseUrl}/Adjunto/${adjuntoId}`
    );
  }

  // ── Duplicate / nearby-event detection (§6.8) ────────────────────────────────

  /**
   * Busca en cad_pedidos llamadas activas en un radio geográfico y ventana temporal
   * configurables. Usado en Recepción para alertar al operador sobre posibles duplicados.
   *
   * @param lat          Latitud del incidente en curso (WGS-84)
   * @param lng          Longitud del incidente en curso (WGS-84)
   * @param radioMetros  Radio de búsqueda en metros (default: 300 m)
   * @param minutosAtras Ventana temporal en minutos hacia atrás (default: 20 min)
   * @param codCaso      Código de caso para filtrar por tipo similar (opcional)
   */
  getPedidosCercanos(
    lat:          number,
    lng:          number,
    radioMetros:  number = 300,
    minutosAtras: number = 20,
    codCaso?:     string
  ): Observable<{ success: boolean; data: DtoPedidoCercano[] }> {
    let url = `${this.base}/pedidos-cercanos?lat=${lat}&lng=${lng}` +
              `&radioMetros=${radioMetros}&minutosAtras=${minutosAtras}`;
    if (codCaso) url += `&codCaso=${encodeURIComponent(codCaso)}`;
    return this.http.get<{ success: boolean; data: DtoPedidoCercano[] }>(url);
  }
}
