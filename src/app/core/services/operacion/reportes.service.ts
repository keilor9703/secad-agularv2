import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface DtoResumenReporte {
  totalIncidentes:  number;
  activos:          number;
  pendientes:       number;
  cerrados:         number;
  flash:            number;
  inmediatos:       number;
  rutina:           number;
  sinPrioridad:     number;
  conEventoActivo:  number;
  sinEventoAun:     number;
  fechaDesde:       string;
  fechaHasta:       string;
}

export interface DtoPorOrigen {
  origen:      string;
  total:       number;
  porcentaje:  number;
}

export interface DtoPorFuerza {
  fuerzaId:   number;
  fuerza:     string;
  total:      number;
  activos:    number;
  cerrados:   number;
  porcentaje: number;
}

export interface DtoTopCaso {
  codigoCaso:  string;
  descripcion: string;
  total:       number;
  porcentaje:  number;
}

export interface DtoTiemposAtencion {
  minutosPrimerAccesoPromedio: number | null;
  minutosDespachoPromedio:     number | null;
  minutosCierrePromedio:       number | null;
  minutosFlashPromedio:        number | null;
  conDespacho:                 number;
  cerrados:                    number;
}

export interface DtoSlaItem {
  nombre:                  string;
  umbralMinutos:           number;
  colorHex:                string;
  cumplieron:              number;
  incumplieron:            number;
  porcentajeCumplimiento:  number;
}

export interface DtoPorHora {
  hora:  number;
  total: number;
}

export interface DtoReporteCompleto {
  resumen:   DtoResumenReporte;
  porOrigen: DtoPorOrigen[];
  porFuerza: DtoPorFuerza[];
  topCasos:  DtoTopCaso[];
  tiempos:   DtoTiemposAtencion;
  sla:       DtoSlaItem[];
  porHora:   DtoPorHora[];
}

// ─── DTOs nuevos reportes detallados ──────────────────────────────────────────

export interface DtoPorCalidad {
  caliPedido:  string;
  descripcion: string;
  total:       number;
  porcentaje:  number;
}

export interface DtoPedidoEfectivo {
  numeTelefono:   string;
  numeLlamada:    string;
  horaLlamada:    string;
  codigoCaso:     string;
  descCaso:       string;
  canal:          string;
  unidad:         string;
  placa:          string;
  horaAsignacion: string | null;
  horaLlegada:    string | null;
  horaTermino:    string | null;
  tiempoLlegada:  string | null;
  tiempoAtencion: string | null;
  tiempoTotal:    string | null;
  caliPedido:     string;
  prioridad:      string;
}

export interface DtoTiempoDetalleItem {
  seccional:            string;
  unidad:               string;
  nroLlamada:           string;
  codigoCaso:           string;
  descCaso:             string;
  horaLlamada:          string;
  horaEnvioCentral:     string | null;
  horaDespacho:         string | null;
  horaLlegada:          string | null;
  horaTermino:          string | null;
  tiempoDesplazamiento: string | null;
  tiempoAtencionCaso:   string | null;
  tiempoTotalCaso:      string | null;
  placa:                string;
  prioridad:            string;
}

export interface DtoTrabajoOperador {
  usuario:            string;
  casosRecibidos:     number;
  eventosDespachados: number;
  actuaciones:        number;
  eventosCerrados:    number;
  promMinDespacho:    number | null;
  primeraActividad:   string;
  ultimaActividad:    string;
}

export interface DtoPagedResult<T> {
  total: number;
  page:  number;
  limit: number;
  data:  T[];
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class ReportesService {
  private readonly base = `${environment.apiBaseUrl}/Reportes`;

  constructor(private http: HttpClient) {}

  // ── Dashboard (existente) ─────────────────────────────────────────────────

  // ── Constantes de turnos de vigilancia ───────────────────────────────────

  static readonly TURNOS = [
    { value: 0, label: 'Todos los turnos',          rango: ''            },
    { value: 1, label: 'Segundo turno (06-13h)',     rango: '06:00–13:59' },
    { value: 2, label: 'Tercer turno  (14-21h)',     rango: '14:00–21:59' },
    { value: 3, label: 'Cuarto turno  (22-05h)',     rango: '22:00–05:59' },
  ];

  turnoLabel(v: number): string {
    return ReportesService.TURNOS.find(t => t.value === v)?.label ?? 'Todos';
  }

  turnoBadgeColor(v: number): string {
    return ['#64748b', '#2563eb', '#7c3aed', '#dc2626'][v] ?? '#64748b';
  }

  // ── Dashboard (existente) ─────────────────────────────────────────────────

  getReporte(params: {
    desde?:           string;
    hasta?:           string;
    fuerzaId?:        number;
    turnoVigilancia?: number;
  }): Observable<{ success: boolean; data: DtoReporteCompleto }> {
    return this.http.get<{ success: boolean; data: DtoReporteCompleto }>(
      `${this.base}${this.qs(params)}`
    );
  }

  // ── R1 — Llamadas por calidad ─────────────────────────────────────────────

  getPorCalidad(params: { desde?: string; hasta?: string; turnoVigilancia?: number }): Observable<{ success: boolean; data: DtoPorCalidad[] }> {
    return this.http.get<{ success: boolean; data: DtoPorCalidad[] }>(
      `${this.base}/calidad${this.qs(params)}`
    );
  }

  // ── R2 — Pedidos con detalle (paginado, filtro calidad) ───────────────────

  getEfectivos(params: {
    desde?:           string;
    hasta?:           string;
    fuerzaId?:        number;
    calidad?:         string;
    page?:            number;
    limit?:           number;
    turnoVigilancia?: number;
  }): Observable<{ success: boolean; data: DtoPagedResult<DtoPedidoEfectivo> }> {
    return this.http.get<{ success: boolean; data: DtoPagedResult<DtoPedidoEfectivo> }>(
      `${this.base}/efectivos${this.qs(params)}`
    );
  }

  // ── R3 — Tiempos detalle por unidad (paginado) ────────────────────────────

  getTiemposDetalle(params: {
    desde?:           string;
    hasta?:           string;
    fuerzaId?:        number;
    page?:            number;
    limit?:           number;
    turnoVigilancia?: number;
  }): Observable<{ success: boolean; data: DtoPagedResult<DtoTiempoDetalleItem> }> {
    return this.http.get<{ success: boolean; data: DtoPagedResult<DtoTiempoDetalleItem> }>(
      `${this.base}/tiempos-detalle${this.qs(params)}`
    );
  }

  // ── R4 — Trabajo de operadores/despachadores ──────────────────────────────

  getTrabajoOperadores(params: {
    desde?:           string;
    hasta?:           string;
    fuerzaId?:        number;
    turnoVigilancia?: number;
  }): Observable<{ success: boolean; data: DtoTrabajoOperador[] }> {
    return this.http.get<{ success: boolean; data: DtoTrabajoOperador[] }>(
      `${this.base}/operadores${this.qs(params)}`
    );
  }

  // ── R5 — Llamadas por código (top configurable) ───────────────────────────

  getPorCodigo(params: {
    desde?:           string;
    hasta?:           string;
    fuerzaId?:        number;
    top?:             number;
    turnoVigilancia?: number;
  }): Observable<{ success: boolean; data: DtoTopCaso[] }> {
    return this.http.get<{ success: boolean; data: DtoTopCaso[] }>(
      `${this.base}/codigos${this.qs(params)}`
    );
  }

  // ── Export CSV ────────────────────────────────────────────────────────────

  exportarCSV<T extends Record<string, unknown>>(
    filas: T[],
    columnas: { key: keyof T; label: string }[],
    nombreArchivo: string
  ): void {
    const header = columnas.map(c => `"${c.label}"`).join(',');
    const rows   = filas.map(f =>
      columnas.map(c => {
        const v = f[c.key] ?? '';
        return `"${this.csvCelda(String(v))}"`;
      }).join(',')
    );
    const csv  = [header, ...rows].join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${nombreArchivo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Neutraliza inyección de fórmulas CSV: Excel/Sheets interpretan celdas que
   * empiezan con =, +, - o @ como fórmulas, lo que permite ejecutar comandos
   * si el usuario abre el CSV exportado (p.ej. un código de caso malicioso).
   */
  private csvCelda(v: string): string {
    const esc = v.replace(/"/g, '""');
    return /^[=+\-@]/.test(esc) ? `'${esc}` : esc;
  }

  // ── Helpers de presentación ───────────────────────────────────────────────

  formatMinutos(min: number | null): string {
    if (min === null || min === undefined) return '—';
    if (min < 1)    return `${Math.round(min * 60)} seg`;
    if (min < 60)   return `${min.toFixed(1)} min`;
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return `${h}h ${m}m`;
  }

  origenLabel(origen: string): string {
    const map: Record<string, string> = {
      PLANTATEL: 'Línea 123/112', RECEPCION: 'Recepción', APP_MOVIL: 'App Móvil',
      INTEGRACION: 'Integración', SIEDCO: 'SIEDCO', INTERNO: 'Interno',
      MANUAL: 'Manual', CHAT: 'Chat', SMS: 'SMS', SIN_ORIGEN: 'Sin origen'
    };
    return map[origen] ?? origen;
  }

  origenColor(origen: string): string {
    const map: Record<string, string> = {
      PLANTATEL: '#08a6cb', RECEPCION: '#6366f1', APP_MOVIL: '#10b981',
      INTEGRACION: '#f59e0b', SIEDCO: '#8b5cf6', INTERNO: '#64748b',
      MANUAL: '#94a3b8', CHAT: '#22c55e', SMS: '#3b82f6', SIN_ORIGEN: '#e5e7eb'
    };
    return map[origen] ?? '#94a3b8';
  }

  calidadLabel(cali: string): string {
    const map: Record<string, string> = {
      'REAL':                'Pedido Efectivo',
      'INFORMACION':         'Información General',
      'NIÑO MOLESTANDO':     'Niño Molestando',
      'PERSONAS MOLESTANDO': 'Personas Molestando',
      'LLAMADA CORTADA':     'Llamada Cortada',
      'NO CULTAS':           'No Cultas',
      'PRUEBA':              'Llamada de Prueba',
      'SIN CALIDAD':         'Sin Calidad',
    };
    return map[cali?.toUpperCase()] ?? cali;
  }

  calidadColor(cali: string): string {
    const map: Record<string, string> = {
      'REAL':                '#16a34a',
      'INFORMACION':         '#2563eb',
      'NIÑO MOLESTANDO':     '#d97706',
      'PERSONAS MOLESTANDO': '#9333ea',
      'LLAMADA CORTADA':     '#64748b',
      'NO CULTAS':           '#dc2626',
      'PRUEBA':              '#0891b2',
      'SIN CALIDAD':         '#94a3b8',
    };
    return map[cali?.toUpperCase()] ?? '#94a3b8';
  }

  prioridadLabel(p: string): string {
    const map: Record<string, string> = {
      '01': 'Flash', 'FLASH': 'Flash',
      '02': 'Inmediata', 'INMEDIATA': 'Inmediata',
      '03': 'Rutina', 'RUTINA': 'Rutina',
    };
    return map[p?.toUpperCase()] ?? p ?? '—';
  }

  // ── Query string builder ──────────────────────────────────────────────────

  private qs(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(params))
      if (v !== undefined && v !== null && v !== '' && v !== 0)
        parts.push(`${k}=${encodeURIComponent(String(v))}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }
}
