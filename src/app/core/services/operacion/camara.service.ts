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

/**
 * Un movimiento PTZ. El backend arranca el giro y lo PARA él mismo antes de
 * responder, así que esto es «mueve un paso», no «empieza a girar»: si el
 * navegador se cerrara a media petición, la cámara no se queda dando vueltas.
 */
export interface DtoPtzPeticion {
  comando:     string;
  /** 20 a 60; el backend acota lo que llegue fuera de rango. */
  velocidad?:  number;
  /** Cuánto dura el paso, en ms. El backend lo acota entre 100 y 2000. */
  duracionMs?: number;
  preset?:     number;
  patrulla?:   number;
  eventoId?:   number | string;
  pedidoId?:   number | string;
}

export interface DtoPtzResultado {
  ok:         boolean;
  mensaje:    string;
  comando:    string;
  duracionMs: number;
  /** false = el VMS aceptó el movimiento pero no confirmó la parada. */
  detenida:   boolean;
}

/** Comandos tal como los nombra el VMS. Se mandan literales al backend. */
export const PTZ = {
  izquierda:    'LEFT',
  derecha:      'RIGHT',
  arriba:       'UP',
  abajo:        'DOWN',
  arribaIzq:    'LEFT_UP',
  abajoIzq:     'LEFT_DOWN',
  arribaDer:    'RIGHT_UP',
  abajoDer:     'RIGHT_DOWN',
  acercar:      'ZOOM_IN',
  alejar:       'ZOOM_OUT',
  irAPreset:    'GOTO_PRESET',
} as const;

/** Con qué se reproduce lo que devolvió el VMS. Lo decide el backend. */
export type Reproductor = 'hls' | 'webrtc' | 'jsdecoder' | 'ninguno';

export interface DtoStreamCamara {
  url:           string;
  autenticacion: string | null;
  protocolo:     string;
  /**
   * Qué reproductor hace falta. Viene del backend a propósito: deducirlo
   * mirando la URL es la clase de adivinanza que ya rompió el video una vez.
   */
  reproductor:   Reproductor;
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
   * URL para reproducir la cámara. No se guarda: se pide cada vez que alguien
   * abre el visor, y cada petición queda auditada.
   *
   * No se guarda precisamente porque el manual de HikCentral la describe como
   * «permanently valid» — no caduca sola. Guardarla en el cliente sería dejar
   * una llave del video sin fecha de vencimiento.
   */
  stream(codigo: string, eventoId?: string | number, pedidoId?: string | number):
    Observable<{ success: boolean; message: string; data: DtoStreamCamara }> {
    let params = new HttpParams();
    if (eventoId != null) params = params.set('eventoId', eventoId);
    if (pedidoId != null) params = params.set('pedidoId', pedidoId);
    return this.http.get<{ success: boolean; message: string; data: DtoStreamCamara }>(
      `${this.base}/${encodeURIComponent(codigo)}/stream`, { params });
  }

  /**
   * Mueve una cámara PTZ un paso. La respuesta tarda lo que dura el
   * movimiento, porque el backend espera para poder pararla él.
   */
  ptz(codigo: string, peticion: DtoPtzPeticion):
    Observable<{ success: boolean; message: string; data: DtoPtzResultado }> {
    return this.http.post<{ success: boolean; message: string; data: DtoPtzResultado }>(
      `${this.base}/${encodeURIComponent(codigo)}/ptz`, peticion);
  }
}
