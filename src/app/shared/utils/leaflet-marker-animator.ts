/**
 * Anima marcadores de Leaflet entre fixes GPS sucesivos en vez de teletransportarlos.
 *
 * El GPS de las patrullas se refresca cada 8-15 s. Si el marcador «salta» a la
 * nueva coordenada en cada refresco se ve a tirones; aquí se desliza durante la
 * ventana entre refrescos, dando sensación de movimiento continuo aunque el dato
 * de fondo solo llegue cada tantos segundos.
 */
import type { Marker } from 'leaflet';

/** Marcador con el identificador del frame de animación en curso. */
type MarcadorAnimado = Marker & { __animFrame?: number | null };

const RADIO_TIERRA_M = 6_371_000;

function metrosEntre(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RADIO_TIERRA_M * Math.asin(Math.sqrt(a));
}

/**
 * Desliza `marcador` hasta (lat, lng) durante `duracionMs`. Si la distancia es
 * insignificante (< 1 m, ruido de precisión del GPS) o el marcador aún no tiene
 * posición, se coloca directo sin animar.
 */
export function animarMarcadorHasta(
  marcador: Marker,
  lat: number,
  lng: number,
  duracionMs = 2500,
): void {
  const m = marcador as MarcadorAnimado;
  const inicio = m.getLatLng?.();
  if (!inicio) { m.setLatLng([lat, lng]); return; }

  if (metrosEntre(inicio.lat, inicio.lng, lat, lng) < 1) return;   // ya está ahí

  detenerAnimacionMarcador(m);

  const lat0 = inicio.lat;
  const lng0 = inicio.lng;
  const dLat = lat - lat0;
  const dLng = lng - lng0;
  const t0 = performance.now();

  const paso = (ahora: number) => {
    const t = Math.min(1, (ahora - t0) / duracionMs);
    const suave = 1 - Math.pow(1 - t, 2);   // ease-out cuadrático
    m.setLatLng([lat0 + dLat * suave, lng0 + dLng * suave]);
    m.__animFrame = t < 1 ? requestAnimationFrame(paso) : null;
  };
  m.__animFrame = requestAnimationFrame(paso);
}

/** Cancela la animación en curso. Llamar antes de quitar el marcador del mapa. */
export function detenerAnimacionMarcador(marcador: Marker): void {
  const m = marcador as MarcadorAnimado;
  if (m?.__animFrame) {
    cancelAnimationFrame(m.__animFrame);
    m.__animFrame = null;
  }
}
