import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';

/**
 * Un servidor ICE tal como lo entrega la API (`DtoIceServer`). Los campos son
 * opcionales porque lo que llega por la red no se da por bueno hasta pasar por
 * `aRtcIceServers`.
 */
export interface IceServerDto {
  urls?: string[] | string | null;
  username?: string | null;
  credential?: string | null;
}

/**
 * Lo único que se usa cuando el servidor no entrega nada utilizable: el STUN
 * público. Alcanza donde el NAT del ciudadano lo permite; en redes móviles con
 * NAT simétrico no, y ahí hace falta TURN (ver docs/turn-coturn.md).
 */
export const ICE_RESPALDO: readonly RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Cuánto se espera la respuesta antes de seguir sin TURN. */
export const ESPERA_ICE_MS = 5000;

const ES_TURN = /^turns?:/i;

/**
 * Convierte la respuesta de la API en la lista que entiende `RTCPeerConnection`.
 *
 * Se descarta, sin avisar, todo lo que haría fallar la creación de la conexión:
 * un servidor `turn:` SIN usuario y contraseña hace que el navegador lance
 * `InvalidAccessError` y la videollamada ni siquiera empiece —mucho peor que
 * conectar solo con STUN—. Si no queda nada utilizable, se devuelve el STUN de
 * respaldo en vez de una lista vacía.
 */
export function aRtcIceServers(dtos: readonly IceServerDto[] | null | undefined): RTCIceServer[] {
  const validos: RTCIceServer[] = [];

  for (const dto of Array.isArray(dtos) ? dtos : []) {
    const crudas: unknown[] = typeof dto?.urls === 'string' ? [dto.urls] : Array.isArray(dto?.urls) ? dto.urls : [];
    const urls: string[] = crudas
      .filter((u): u is string => typeof u === 'string' && u.trim().length > 0)
      .map((u) => u.trim());
    if (urls.length === 0) continue;

    const usuario = dto.username?.trim();
    const credencial = dto.credential?.trim();
    const traeCredenciales = !!usuario && !!credencial;

    if (urls.some((u) => ES_TURN.test(u)) && !traeCredenciales) continue;

    validos.push(traeCredenciales ? { urls, username: usuario, credential: credencial } : { urls });
  }

  return validos.length > 0 ? validos : [...ICE_RESPALDO];
}

/**
 * Pide los servidores ICE a la API. Nunca lanza ni se queda esperando: ante
 * un error, una respuesta inútil o un servidor lento devuelve el respaldo, de
 * modo que un fallo aquí no impida la videollamada.
 */
export async function obtenerIceServers(
  http: HttpClient,
  url: string,
  esperaMs: number = ESPERA_ICE_MS,
): Promise<RTCIceServer[]> {
  try {
    const dtos = await firstValueFrom(http.get<IceServerDto[]>(url).pipe(timeout(esperaMs)));
    return aRtcIceServers(dtos);
  } catch {
    return [...ICE_RESPALDO];
  }
}
