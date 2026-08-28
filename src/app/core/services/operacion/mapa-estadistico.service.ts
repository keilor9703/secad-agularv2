import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

// ─── DTOs ──────────────────────────────────────────────────────────────────────

export interface DtoFiltroEstadistico {
  desde:             string;   // 'YYYY-MM-DD'
  hasta:             string;
  codiPedido?:       string;
  prioridad?:        string;
  ciudad?:           string;
  barrio?:           string;
  canalCodigo?:      number;
  /** Obligatorio cuando canalCodigo &gt; 0 — cad_canales.codigo no es único por sí solo. */
  canalFuerzaId?:    number;
  sitioGraba?:       number;
  soloCerrados:      boolean;
  turnoVigilancia?:  number;   // 0=Todos, 1=Segundo(06-13h), 2=Tercer(14-21h), 3=Cuarto(22-05h)
}

export interface DtoPuntoEstadistico {
  id:          string;
  codiPedido:  string;
  descPedido:  string;
  direCaso:    string;
  barrio:      string;
  ciudad:      string;
  lat:         number;
  lng:         number;
  prioridad:   string;
  estado:      string;
  horaCaso:    string;
  intensidad:  number;  // para el heatmap (1.0 Flash, 0.65 Inmediata, 0.35 Rutina)
}

export interface DtoAgrupacion {
  clave:       string;
  descripcion: string;
  total:       number;
}

export interface DtoMetricasEstadisticas {
  total:           number;
  totalFlash:      number;
  totalInmd:       number;
  totalRutina:     number;
  totalOtros:      number;
  conCoordenadas:  number;
  porTipoCaso:     DtoAgrupacion[];
  porHora:         DtoAgrupacion[];
  porDiaSemana:    DtoAgrupacion[];
  porMes:          DtoAgrupacion[];
  porCiudad:       DtoAgrupacion[];
  porPrioridad:    DtoAgrupacion[];
}

export interface DtoAnalisisEstadistico {
  puntos:   DtoPuntoEstadistico[];
  metricas: DtoMetricasEstadisticas;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class MapaEstadisticoService {
  private readonly baseUrl = `${environment.apiBaseUrl}/MapaEstadistico`;

  constructor(private http: HttpClient) {}

  getAnalisis(filtro: DtoFiltroEstadistico): Observable<DtoAnalisisEstadistico> {
    let params = new HttpParams()
      .set('desde',        filtro.desde)
      .set('hasta',        filtro.hasta)
      .set('soloCerrados', String(filtro.soloCerrados));

    if (filtro.codiPedido)  params = params.set('codiPedido',  filtro.codiPedido);
    if (filtro.prioridad)   params = params.set('prioridad',   filtro.prioridad);
    if (filtro.ciudad)      params = params.set('ciudad',      filtro.ciudad);
    if (filtro.barrio)      params = params.set('barrio',      filtro.barrio);
    if (filtro.canalCodigo)      params = params.set('canalCodigo',      filtro.canalCodigo.toString());
    if (filtro.canalFuerzaId)    params = params.set('canalFuerzaId',    filtro.canalFuerzaId.toString());
    if (filtro.sitioGraba)       params = params.set('sitioGraba',       filtro.sitioGraba.toString());
    if (filtro.turnoVigilancia)  params = params.set('turnoVigilancia',  filtro.turnoVigilancia.toString());

    return this.http.get<DtoAnalisisEstadistico>(`${this.baseUrl}/analisis`, { params });
  }

  getCiudades(sitioGraba?: number): Observable<string[]> {
    let params = new HttpParams();
    if (sitioGraba) params = params.set('sitioGraba', sitioGraba.toString());
    return this.http.get<string[]>(`${this.baseUrl}/ciudades`, { params });
  }

  getBarrios(ciudad?: string, sitioGraba?: number): Observable<string[]> {
    let params = new HttpParams();
    if (ciudad)     params = params.set('ciudad', ciudad);
    if (sitioGraba) params = params.set('sitioGraba', sitioGraba.toString());
    return this.http.get<string[]>(`${this.baseUrl}/barrios`, { params });
  }
}
