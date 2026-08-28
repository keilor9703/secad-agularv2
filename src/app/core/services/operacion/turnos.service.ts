import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

// ─── Constantes de dominio ─────────────────────────────────────────────────────

/**
 * Clase de turno: correlación con horario oficial de vigilancia.
 * Esquema canónico usado en todo el sistema (ver GetTurnoActual() en
 * DbPedidoRepository.cs del backend).
 */
export const CLASE_TURNO = {
  PRIMERO:  1,   // 22:00 – 06:00
  SEGUNDO:  2,   // 06:00 – 14:00
  TERCERO:  3    // 14:00 – 22:00
} as const;
export type ClaseTurno = typeof CLASE_TURNO[keyof typeof CLASE_TURNO];

/** Estado del turno */
export const ESTADO_TURNO = {
  ACTIVO:  'A',
  CERRADO: 'C',
  ANULADO: 'V'
} as const;
export type EstadoTurno = typeof ESTADO_TURNO[keyof typeof ESTADO_TURNO];

/** Estado operativo de un medio en turno */
export const ESTADO_MEDIO = {
  LIBRE:           27,
  OCUPADO:         28,
  FUERA_SERVICIO:  29,
  EN_RUTA:         30,
  EN_BASE:         31
} as const;
export type EstadoMedio = typeof ESTADO_MEDIO[keyof typeof ESTADO_MEDIO];

/** Tipo de medio/recurso */
export const TIPO_MEDIO = {
  MOTOCICLETA:     20,
  BICICLETA:       21,
  PATRULLA:        22,
  AMBULANCIA:      23,
  CAMION_BOMBEROS: 24,
  HELICOPTERO:     25,
  LANCHA:          26
} as const;
export type TipoMedio = typeof TIPO_MEDIO[keyof typeof TIPO_MEDIO];

// ─── DTOs ──────────────────────────────────────────────────────────────────────

/** Ítem de la grilla de turnos (lista resumida) */
export interface DtoTurnoListItem {
  id:             string;   // Snowflake — serializado como string para evitar pérdida de precisión JS
  claseTurno:     ClaseTurno;
  claseTurnoDesc: string;
  fuerzaDesc:     string;
  horaInicia:     string;   // dd/MM/yyyy HH:mm
  horaTermina:    string;
  estado:         EstadoTurno;
  totalUnidades:  number;
  totalMedios:    number;
  siviccSync:     boolean;
}

/** Detalle completo del turno (header) */
export interface DtoTurno {
  id:                 string;   // Snowflake
  sitioGraba:         number;
  fuerzaId:           number;
  fuerzaDescripcion:  string;
  claseTurno:         ClaseTurno;
  claseTurnoDesc:     string;
  tipoTurno?:         number;
  tipoTurnoDesc:      string;
  horaInicia:         string;
  horaTermina:        string;
  diaInicia:          string;   // dd/MM/yyyy
  consignas?:         string;
  estado:             EstadoTurno;
  siviccSincronizado: boolean;
  siviccFechaSync?:   string;
  fechaCreacion:      string;
  usuarioCrea?:       string;
  totalUnidades:      number;
  totalMedios:        number;
}

/** Unidad/estación dentro de un turno */
export interface DtoTurnoUnidad {
  id:                 string;   // Snowflake
  turnoId:            string;   // Snowflake
  unidadCodigo:       string;
  unidadDesc:         string;
  fuerzaId?:          number;
  consignas?:         string;
  origen:             'MANUAL' | 'SIVICC';
  siviccMinutaId?:    number;
  siviccConsecutivo?: number;
  totalMedios:        number;
}

/** Policía asignado a un medio */
export interface DtoPersonalMedio {
  ceduEmpleado:    string;
  nombrePolicial?: string;
  descCargo?:      string;
}

/**
 * Medio disponible en turno — versión completa para el panel de despacho.
 * Incluye posición GPS y personal asignado.
 */
export interface DtoMedioDisponible {
  id:              string;   // Snowflake
  sitioGraba:      number;
  turnoId:         string;   // Snowflake
  turnoUnidadId?:  string;   // Snowflake
  unidadCodigo?:   string;
  fuerzaId?:       number;

  // Canal de radio
  canalFuerzaId?:  number;
  canalCodigo?:    number;
  canalDesc:       string;

  // Identificación del recurso
  patrullaCodigo:  string;
  patrullaDesc:    string;
  tipoMedio:       TipoMedio;
  tipoMedioDesc:   string;

  // Estado operativo
  estado:          EstadoMedio;
  estadoDesc:      string;

  // Ubicación GPS (última posición GESPO)
  latitud?:        number;
  longitud?:       number;
  velocidadKmh?:   number;
  rumboGrados?:    number;
  fechaUbicacion?: string;
  /** true si la última posición tiene menos de 10 minutos */
  gpsActivo:       boolean;

  // Incidente activo (si estado es Ocupado/En ruta)
  eventoId?:       string;   // Snowflake
  actuacionId?:    string;   // Snowflake

  // Personal asignado
  personal:        DtoPersonalMedio[];

  // Distancia calculada al incidente activo
  distanciaKm?:    number;
}

/**
 * Un medio Libre sugerido como candidato de asignación, rankeado por cercanía
 * al punto consultado (búsqueda PostGIS en el backend). Solo sugerencia —
 * nunca se asigna automáticamente.
 */
export interface DtoRecursoCercano {
  medioId:        string;   // Snowflake
  patrullaCodigo: string;
  patrullaDesc:   string;
  tipoMedio:      TipoMedio;
  estado:         EstadoMedio;
  estadoDesc:     string;
  latitud:        number;
  longitud:       number;
  /** Distancia en línea recta al punto consultado, en metros. */
  distanciaM:     number;
}

/**
 * Versión reducida para polling rápido desde el panel de despacho.
 * Minimiza el payload enviado al cliente.
 */
export interface DtoMedioDisponibleResumen {
  id:              string;   // Snowflake
  patrullaCodigo:  string;
  patrullaDesc:    string;
  tipoMedio:       TipoMedio;
  estado:          EstadoMedio;
  estadoDesc:      string;
  canalDesc:       string;
  lat?:            number;
  lng?:            number;
  gpsActivo:       boolean;
  eventoId?:       string;   // Snowflake
  distanciaKm?:    number;
  /** "Cédula1 / Cédula2" — personal concatenado */
  personalResumen: string;
}

// ─── Request DTOs ──────────────────────────────────────────────────────────────

/** Request: crear un nuevo turno */
export interface DtoCrearTurnoRequest {
  sitioGraba:   number;
  fuerzaId:     number;
  claseTurno:   ClaseTurno;
  tipoTurno?:   number;
  /** Formato: dd/MM/yyyy HH:mm */
  horaInicia:   string;
  horaTermina:  string;
  consignas?:   string;
}

/** Request: copiar turno existente a nueva franja horaria */
export interface DtoCopiarTurnoRequest {
  turnoOrigenId: string;   // Snowflake
  claseTurno:    ClaseTurno;
  tipoTurno?:    number;
  horaInicia:    string;
  horaTermina:   string;
}

/** Request: agregar unidad/estación al turno */
export interface DtoAgregarUnidadRequest {
  turnoId:           string;   // Snowflake
  unidadCodigo:      string;
  unidadDesc?:       string;
  fuerzaId?:         number;
  consignas?:        string;
  origen?:           'MANUAL' | 'SIVICC';
  siviccMinutaId?:   number;
  siviccConsecutivo?: number;
}

/** Request: agregar medio/patrulla al turno */
export interface DtoAgregarMedioRequest {
  turnoId:        string;   // Snowflake
  turnoUnidadId?: string;   // Snowflake
  unidadCodigo?:  string;
  fuerzaId?:      number;
  canalFuerzaId?: number;
  canalCodigo?:   number;
  patrullaCodigo: string;
  patrullaDesc?:  string;
  tipoMedio:      TipoMedio;
  personal:       DtoPersonalMedio[];
}

// ─── SIVICC — paso 1: unidades disponibles ────────────────────────────────────

/**
 * Unidad disponible en SIVICC para el turno activo.
 * Retornada por GET api/Turnos/{id}/sivicc/unidades.
 */
export interface DtoUnidadSivicc {
  /** ID de la minuta (necesario para el paso 3 de importación). */
  minutaId:          number;
  /** Consecutivo SIATH de la unidad. */
  consecutivo:       number;
  /** Código SECAD de la unidad. */
  unidadCodigo:      string;
  /** Nombre en SIVICC. */
  descripcion:       string;
  /** true si ya tiene medios importados para este turno. */
  existeEnCadMedios: boolean;
  /** Marcado por el usuario en el checkbox del modal (solo UI). */
  seleccionada: boolean;
  /**
   * Canal de radio elegido para ESTA unidad (solo UI, poblado en el modal).
   * Cada unidad puede tener un canal distinto — no todas comparten el mismo.
   */
  canalCodigo?:   number;
  canalFuerzaId?: number;
}

/** Unidad seleccionada para importar (enviada en el body del POST). */
export interface DtoUnidadSiviccSeleccionada {
  minutaId:    number;
  consecutivo: number;
  /** Snapshot del nombre de la unidad (viene del paso 1) — evita otra consulta a GESPO. */
  descripcion?: string;
  /** Canal de radio propio de esta unidad. Si se omite, se usa el canal por defecto del request. */
  canalCodigo?:   number;
  canalFuerzaId?: number;
}

/** Request: importar medios de las unidades SIVICC seleccionadas */
export interface DtoImportarSiviccRequest {
  turnoId:        string;   // Snowflake
  canalCodigo?:   number;
  canalFuerzaId?: number;
  fuerzaId:       number;
  sitioGraba:     number;
  /**
   * Unidades a importar. Si está vacío el backend importa TODAS.
   * minutaId/consecutivo vienen del GET .../sivicc/unidades.
   */
  unidades: DtoUnidadSiviccSeleccionada[];
}

/**
 * Campos editables de un medio ya registrado.
 * Excluye turnoId, unidadId, fuerza, sitioGraba y estado operativo.
 */
export interface DtoActualizarMedioRequest {
  canalFuerzaId?: number;
  canalCodigo?:   number;
  patrullaCodigo: string;
  patrullaDesc?:  string;
  tipoMedio:      TipoMedio;
  /** Reemplaza completamente la lista anterior (máx. 2). */
  personal:       DtoPersonalMedio[];
}

/** Request: cambiar estado operativo de un medio */
export interface DtoCambiarEstadoMedioRequest {
  nuevoEstado:   EstadoMedio;
  eventoId?:     string;   // Snowflake
  actuacionId?:  string;   // Snowflake
  observacion?:  string;
}

/** Posición GPS de una patrulla recibida desde GESPO */
export interface DtoGespoUbicacion {
  patrullaCodigo: string;
  latitud:        number;
  longitud:       number;
  velocidadKmh?:  number;
  rumboGrados?:   number;
  /** ISO-8601 */
  fechaGps:       string;
}

/** Respuesta genérica de operaciones sobre turnos */
export interface DtoTurnoResult {
  success: boolean;
  message: string;
  id:      string;   // Snowflake — serializado como string desde el backend
}

// ─── Service ───────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class TurnosService {
  private readonly base = `${environment.apiBaseUrl}/Turnos`;

  constructor(private http: HttpClient) {}

  // ── Consultas — Turnos ────────────────────────────────────────────────────────

  /**
   * Lista los turnos de una fuerza en una fecha (dd/MM/yyyy).
   * Si se omite fecha, el backend retorna los del día actual.
   */
  getTurnos(
    fuerzaId:   number,
    fecha?:     string,
    sitioGraba: number = 1
  ): Observable<DtoTurnoListItem[]> {
    let params = new HttpParams().set('fuerzaId', fuerzaId).set('sitioGraba', sitioGraba);
    if (fecha) params = params.set('fecha', fecha);
    return this.http
      .get<{ success: boolean; data: DtoTurnoListItem[] }>(this.base, { params })
      .pipe(map(r => r.data));
  }

  /**
   * Detalle completo de un turno.
   */
  getTurno(id: string): Observable<DtoTurno> {
    return this.http
      .get<{ success: boolean; data: DtoTurno }>(`${this.base}/${id}`)
      .pipe(map(r => r.data));
  }

  /**
   * Lista las unidades/estaciones de un turno.
   */
  getUnidades(turnoId: string): Observable<DtoTurnoUnidad[]> {
    return this.http
      .get<{ success: boolean; data: DtoTurnoUnidad[] }>(`${this.base}/${turnoId}/unidades`)
      .pipe(map(r => r.data));
  }

  /**
   * Lista los medios/patrullas de un turno.
   * Opcionalmente filtra por turnoUnidadId para ver los de una unidad específica.
   */
  getMedios(turnoId: string, turnoUnidadId?: string): Observable<DtoMedioDisponible[]> {
    let params = new HttpParams();
    if (turnoUnidadId != null) params = params.set('turnoUnidadId', turnoUnidadId);
    return this.http
      .get<{ success: boolean; data: DtoMedioDisponible[] }>(
        `${this.base}/${turnoId}/medios`, { params }
      )
      .pipe(map(r => r.data));
  }

  // ── Panel de despacho (Módulo de Eventos) ─────────────────────────────────────

  /**
   * Retorna los recursos activos en turno para un canal de radio.
   * Versión completa — incluye GPS y personal.
   * Usada para cargar inicialmente el panel de despacho.
   */
  getRecursosCanal(
    canalCodigo:   number,
    sitioGraba:    number = 1,
    canalFuerzaId?: number
  ): Observable<DtoMedioDisponible[]> {
    let params = new HttpParams().set('sitioGraba', sitioGraba);
    if (canalFuerzaId != null) params = params.set('canalFuerzaId', canalFuerzaId);
    return this.http
      .get<{ success: boolean; data: DtoMedioDisponible[] }>(
        `${this.base}/canal/${canalCodigo}/recursos`, { params }
      )
      .pipe(map(r => r.data));
  }

  /**
   * Versión compacta de recursos activos por canal.
   * Usada para el polling periódico (cada 5-10 s) del panel de despacho.
   */
  getResumenRecursosCanal(
    canalCodigo:   number,
    sitioGraba:    number = 1,
    canalFuerzaId?: number
  ): Observable<DtoMedioDisponibleResumen[]> {
    let params = new HttpParams().set('sitioGraba', sitioGraba);
    if (canalFuerzaId != null) params = params.set('canalFuerzaId', canalFuerzaId);
    return this.http
      .get<{ success: boolean; data: DtoMedioDisponibleResumen[] }>(
        `${this.base}/canal/${canalCodigo}/recursos/resumen`, { params }
      )
      .pipe(map(r => r.data));
  }

  /**
   * Sugiere los medios Libres más cercanos a un punto (p.ej. el sitio de un
   * incidente), rankeados por distancia. Mismo alcance canal+fuerza+sitio que
   * getResumenRecursosCanal. Solo sugerencia — el despachador decide.
   */
  getSugerenciaRecurso(
    canalCodigo:    number,
    lat:            number,
    lng:            number,
    sitioGraba:     number = 1,
    canalFuerzaId?: number,
    top:            number = 5,
    prioridadAlta:  boolean = false
  ): Observable<DtoRecursoCercano[]> {
    let params = new HttpParams()
      .set('lat', lat).set('lng', lng).set('sitioGraba', sitioGraba).set('top', top)
      .set('prioridadAlta', prioridadAlta);
    if (canalFuerzaId != null) params = params.set('canalFuerzaId', canalFuerzaId);
    return this.http
      .get<{ success: boolean; data: DtoRecursoCercano[] }>(
        `${this.base}/canal/${canalCodigo}/sugerencia-recurso`, { params }
      )
      .pipe(map(r => r.data));
  }

  /**
   * Estima el tiempo de llegada a partir de la distancia en línea recta y una
   * velocidad promedio urbana por tipo de medio — no es routing real (no hay
   * API de mapas/tráfico disponible), es una aproximación honesta para darle
   * al despachador una referencia de "cuánto tarda", no solo "cuánto dista".
   */
  estimarEtaMin(distanciaKm: number | undefined | null, tipoMedio: TipoMedio): number | null {
    if (distanciaKm == null || !isFinite(distanciaKm)) return null;
    const velocidadKmh: Record<TipoMedio, number> = {
      20: 30,  // Motocicleta — ágil en tráfico urbano
      21: 15,  // Bicicleta
      22: 28,  // Patrulla
      23: 32,  // Ambulancia — asume prioridad de paso
      24: 25,  // Camión de bomberos
      25: 90,  // Helicóptero
      26: 20   // Lancha
    };
    const v = velocidadKmh[tipoMedio] ?? 25;
    return Math.max(1, Math.round((distanciaKm / v) * 60));
  }

  // ── Creación / edición de turnos ──────────────────────────────────────────────

  /**
   * Crea un nuevo turno de vigilancia.
   * Valida: duración 6-9h, unicidad clase_turno por día+fuerza, sin solapamiento.
   */
  crearTurno(req: DtoCrearTurnoRequest): Observable<DtoTurnoResult> {
    return this.http.post<DtoTurnoResult>(this.base, req);
  }

  /**
   * Copia un turno a una nueva franja horaria, duplicando toda la jerarquía.
   */
  copiarTurno(req: DtoCopiarTurnoRequest): Observable<DtoTurnoResult> {
    return this.http.post<DtoTurnoResult>(`${this.base}/copiar`, req);
  }

  // ── Unidades ──────────────────────────────────────────────────────────────────

  /**
   * Agrega una unidad/estación al turno de forma manual.
   */
  agregarUnidad(
    turnoId: string,
    req:     DtoAgregarUnidadRequest
  ): Observable<DtoTurnoResult> {
    return this.http.post<DtoTurnoResult>(`${this.base}/${turnoId}/unidades`, req);
  }

  // ── Medios disponibles ────────────────────────────────────────────────────────

  /**
   * Agrega un medio (patrulla/moto/etc.) al turno de forma manual.
   * Acepta hasta 2 policías en el campo `personal`.
   */
  agregarMedio(
    turnoId: string,
    req:     DtoAgregarMedioRequest
  ): Observable<DtoTurnoResult> {
    return this.http.post<DtoTurnoResult>(`${this.base}/${turnoId}/medios`, req);
  }

  /**
   * PASO 1 — Consulta las unidades disponibles en SIVICC para el turno.
   * Los filtros (sigla de la fuerza, clase de turno, fecha) los obtiene
   * el backend a partir del propio turno; el usuario no ingresa IDs.
   */
  getUnidadesSivicc(turnoId: string): Observable<DtoUnidadSivicc[]> {
    return this.http
      .get<{ success: boolean; data: DtoUnidadSivicc[] }>(
        `${this.base}/${turnoId}/sivicc/unidades`
      )
      .pipe(map(r => r.data ?? []));
  }

  /**
   * PASO 3 — Importa medios y personal de las unidades seleccionadas.
   * Marca el turno como sincronizado con SIVICC al finalizar.
   */
  importarSivicc(
    turnoId: string,
    req:     DtoImportarSiviccRequest
  ): Observable<DtoTurnoResult> {
    return this.http.post<DtoTurnoResult>(`${this.base}/${turnoId}/sivicc`, req);
  }

  // ── Estado de medios ──────────────────────────────────────────────────────────

  /**
   * Actualiza los datos editables de un medio ya registrado en el turno.
   * El personal anterior se reemplaza completamente.
   */
  actualizarMedio(
    medioId: string,
    req:     DtoActualizarMedioRequest
  ): Observable<DtoTurnoResult> {
    return this.http.put<DtoTurnoResult>(`${this.base}/medios/${medioId}`, req);
  }

  /**
   * Cambia el estado operativo de un medio en tiempo real.
   * Al asignar estado Ocupado (28) o En ruta (30), vincula al evento/actuación.
   * Al liberar (27/29/31), limpia la asociación de evento automáticamente.
   */
  cambiarEstadoMedio(
    medioId: string,
    req:     DtoCambiarEstadoMedioRequest
  ): Observable<DtoTurnoResult> {
    return this.http.put<DtoTurnoResult>(
      `${this.base}/medios/${medioId}/estado`,
      req
    );
  }

  /**
   * Envía un lote de posiciones GPS al backend para que actualice
   * las coordenadas de los medios en turno.
   * Retorna el número de medios efectivamente actualizados.
   */
  actualizarUbicacionesGespo(
    ubicaciones: DtoGespoUbicacion[]
  ): Observable<{ success: boolean; actualizados: number; total: number }> {
    return this.http.post<{ success: boolean; actualizados: number; total: number }>(
      `${this.base}/gespo/ubicaciones`,
      ubicaciones
    );
  }

  /**
   * Sincroniza el GPS de las patrullas activas de un canal bajo demanda (pull
   * directo a Oracle GESPO solo para los medios de ese canal/fuerza en turno,
   * sin ningún proceso de fondo permanente). Pensado para llamarse desde el
   * mismo tick de polling que ya existe en Eventos mientras el operador tiene
   * un canal seleccionado — nunca desde un timer aparte, y nunca desde
   * Turnos (ese módulo no hace georreferenciación). Nunca falla de forma
   * visible: el backend responde 200 con actualizados=0 si el canal no tiene
   * medios activos ahora mismo, si otra sincronización corrió hace muy poco,
   * o si Oracle está lento/caído.
   */
  sincronizarGps(canalCodigo: number, canalFuerzaId?: number): Observable<{ success: boolean; actualizados: number }> {
    let params = new HttpParams().set('canalCodigo', canalCodigo);
    if (canalFuerzaId != null) params = params.set('canalFuerzaId', canalFuerzaId);
    return this.http.post<{ success: boolean; actualizados: number }>(
      `${this.base}/gespo/sincronizar`,
      {},
      { params }
    );
  }

  // ── Helpers UI ────────────────────────────────────────────────────────────────

  /** Etiqueta legible para la clase de turno */
  etiquetaClaseTurno(clase: ClaseTurno): string {
    const map: Record<ClaseTurno, string> = {
      1: 'Primer Turno  (22:00 – 06:00)',
      2: 'Segundo Turno (06:00 – 14:00)',
      3: 'Tercer Turno  (14:00 – 22:00)'
    };
    return map[clase] ?? `Turno ${clase}`;
  }

  /** Etiqueta corta de clase de turno para chips/badges */
  etiquetaClaseTurnoCorta(clase: ClaseTurno): string {
    const map: Record<ClaseTurno, string> = { 1: '1°T', 2: '2°T', 3: '3°T' };
    return map[clase] ?? `T${clase}`;
  }

  /** Etiqueta legible para el estado del turno */
  etiquetaEstadoTurno(estado: EstadoTurno): string {
    const map: Record<EstadoTurno, string> = {
      A: 'Activo',
      C: 'Cerrado',
      V: 'Anulado'
    };
    return map[estado] ?? estado;
  }

  /** Etiqueta legible para el estado de un medio */
  etiquetaEstadoMedio(estado: EstadoMedio): string {
    const map: Record<EstadoMedio, string> = {
      27: 'Libre',
      28: 'Ocupado',
      29: 'Fuera de servicio',
      30: 'En ruta',
      31: 'En base'
    };
    return map[estado] ?? `Estado ${estado}`;
  }

  /** Clase CSS (badge/chip) para el estado de un medio */
  claseEstadoMedio(estado: EstadoMedio): string {
    const map: Record<EstadoMedio, string> = {
      27: 'badge-success',    // Libre  — verde
      28: 'badge-danger',     // Ocupado — rojo
      29: 'badge-dark',       // Fuera servicio — oscuro
      30: 'badge-warning',    // En ruta — amarillo
      31: 'badge-secondary'   // En base — gris
    };
    return map[estado] ?? '';
  }

  /** Clase FontAwesome para el tipo de medio (la app no carga la fuente Material Icons). */
  iconoTipoMedio(tipo: TipoMedio): string {
    const map: Record<TipoMedio, string> = {
      20: 'fa-solid fa-motorcycle',         // Motocicleta
      21: 'fa-solid fa-bicycle',            // Bicicleta
      22: 'fa-solid fa-car-side',           // Patrulla
      23: 'fa-solid fa-truck-medical',      // Ambulancia
      24: 'fa-solid fa-fire-flame-curved',  // Camión Bomberos
      25: 'fa-solid fa-helicopter',         // Helicóptero
      26: 'fa-solid fa-sailboat'            // Lancha
    };
    return map[tipo] ?? 'fa-solid fa-car';
  }

  /**
   * Formatea la distancia para mostrar en la UI.
   * < 1 km → en metros; >= 1 km → en km con 1 decimal.
   */
  formatearDistancia(km?: number): string {
    if (km == null) return '—';
    if (km < 1)     return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  }
}
