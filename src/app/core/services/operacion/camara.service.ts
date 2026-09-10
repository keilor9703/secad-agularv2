import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/** Una cámara del catálogo del CAD, tal como la ve el operador. */
export interface DtoCamara {
  id:            string;
  nombre:        string;
  numeroCenso:   string | null;
  direccion:     string | null;
  municipio:     string | null;
  unidad:        string | null;
  latitud:       number | null;
  longitud:      number | null;
  tienePtz:      boolean;
  /** Del inventario: dada de alta y en servicio. */
  operativa:     boolean | null;
  /** Del VMS y en vivo: 0 desconocido · 1 en línea · 2 fuera de línea. */
  estado:        number;
  camaraCodigo:  string | null;
  integracionId: string | null;
  origen:        string;
  /** true = emparejada con el VMS, se le puede pedir video. */
  reproducible:  boolean;
  /** Metros hasta el incidente. Solo viene en la consulta de cercanas. */
  distancia:     number | null;
}

export interface DtoStreamCamara {
  url:           string;
  autenticacion: string | null;
  protocolo:     string;
  camaraNombre:  string;
  /** Nodo por el que se pidió la URL; ayuda a diagnosticar si el video no carga. */
  nodo:          string | null;
}

@Injectable({ providedIn: 'root' })
export class CamaraService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/Camaras`;

  /** Cámaras cercanas al incidente de un evento. Las coordenadas las pone el backend. */
  cercanasAlEvento(
    eventoId: string | number, radioMetros = 1000, limite = 8,
  ): Observable<{ success: boolean; data: DtoCamara[]; message?: string }> {
    const params = new HttpParams()
      .set('radioMetros', radioMetros)
      .set('limite', limite);
    return this.http.get<{ success: boolean; data: DtoCamara[]; message?: string }>(
      `${environment.apiBaseUrl}/Evento/${eventoId}/camaras-cercanas`, { params });
  }

  /** Cámaras cercanas a un punto cualquiera del mapa. */
  cercanas(lat: number, lng: number, radioMetros = 1000, limite = 10):
    Observable<{ success: boolean; data: DtoCamara[] }> {
    const params = new HttpParams()
      .set('lat', lat).set('lng', lng)
      .set('radioMetros', radioMetros).set('limite', limite);
    return this.http.get<{ success: boolean; data: DtoCamara[] }>(`${this.base}/cercanas`, { params });
  }

  /**
   * URL para reproducir la cámara. Es de corta vida y no se guarda: se pide
   * cada vez que alguien abre el visor, y cada petición queda auditada.
   */
  stream(codigo: string, eventoId?: string | number, pedidoId?: string | number):
    Observable<{ success: boolean; message: string; data: DtoStreamCamara }> {
    let params = new HttpParams();
    if (eventoId != null) params = params.set('eventoId', eventoId);
    if (pedidoId != null) params = params.set('pedidoId', pedidoId);
    return this.http.get<{ success: boolean; message: string; data: DtoStreamCamara }>(
      `${this.base}/${encodeURIComponent(codigo)}/stream`, { params });
  }
}
