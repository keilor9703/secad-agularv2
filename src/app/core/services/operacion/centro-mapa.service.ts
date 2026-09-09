import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';

import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';

/** Dónde abre el mapa para el usuario que pregunta. */
export interface DtoCentroMapa {
  latitud: number;
  longitud: number;
  zoom: number;
  /** 'sitio' | 'tenant' | 'defecto' */
  origen: string;
  descripcion?: string | null;
  /** true = nadie configuró coordenadas y esto es el centro de reserva. */
  porDefecto: boolean;
}

/**
 * El centro del mapa del CAD.
 *
 * Los tres mapas del sistema —Recepción, Mapa de Incidentes y GIS
 * Estadístico— arrancaban con `setView([4.7110, -74.0721], 12)`: Bogotá,
 * escrita a mano en cada uno. El operador de Cali empezaba cada llamada
 * mirando una ciudad a 400 km de la suya.
 *
 * Recepción tenía media solución —`cargarCapaMunicipios` hace fitBounds sobre
 * el polígono que devuelve un ArcGIS externo—, pero depender de un tercero
 * para algo tan básico significa que si ese servicio tarda, responde vacío o
 * la red del CAD no lo alcanza, el mapa se queda en Bogotá sin que nadie se
 * entere. Aquí el centro es un dato nuestro y llega siempre.
 *
 * Se pide una vez por sesión y se comparte entre las tres pantallas. La caché
 * se ata al token, como la del menú: un superadministrador que conmuta de CAD
 * recibe un JWT nuevo y tiene que ver el mapa de su nuevo CAD, no el anterior.
 */
@Injectable({ providedIn: 'root' })
export class CentroMapaService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /** El mismo que estaba escrito en el código de los tres mapas. */
  static readonly DEFECTO: DtoCentroMapa = {
    latitud: 4.7110, longitud: -74.0721, zoom: 12,
    origen: 'defecto', porDefecto: true,
  };

  private peticion?: Observable<DtoCentroMapa>;
  private tokenDeLaCache: string | null = null;

  centro(): Observable<DtoCentroMapa> {
    const token = this.auth.getToken();

    if (!this.peticion || this.tokenDeLaCache !== token) {
      this.tokenDeLaCache = token;
      this.peticion = this.http
        .get<{ success: boolean; data: DtoCentroMapa }>(`${environment.apiBaseUrl}/Mapa/centro`)
        .pipe(
          map(r => r?.data ?? CentroMapaService.DEFECTO),
          // Un mapa en Bogotá es peor que uno centrado, pero mucho mejor que
          // una pantalla que no abre: el error nunca sale de aquí.
          catchError(() => of(CentroMapaService.DEFECTO)),
          shareReplay({ bufferSize: 1, refCount: false }),
        );
    }

    return this.peticion;
  }

  /** Descarta la caché para que la próxima lectura vuelva a preguntar. */
  invalidar(): void {
    this.peticion = undefined;
    this.tokenDeLaCache = null;
  }
}
