/**
 * Semáforo y etiquetas de tiempo de la cola de eventos.
 *
 * Viven aquí, como funciones puras, porque los usan por igual la bandeja
 * (una tarjeta por evento) y el panel de detalle, que son dos componentes.
 */
import { DtoEventoListItem } from '../../../core/services/operacion/evento.service';
import { DtoPedidoDetalle } from '../../../core/services/operacion/pedido.service';

export type SemaforoColor = 'semaforo-verde' | 'semaforo-amarillo' | 'semaforo-rojo';
export type EstadoEvento  = 'A' | 'P' | 'E' | 'T' | 'R' | 'C';

export interface UmbralesSla {
  /** Minutos sin que nadie abra el caso antes de pasar a advertencia. */
  sinAcceso: number;
  /** Minutos en gestión antes de considerarlo crítico. */
  critico:   number;
}

export const ESTADOS_EVENTO: {
  valor: EstadoEvento;
  label: string;
  variante: 'info' | 'warning' | 'success' | 'secondary';
}[] = [
  { valor: 'A', label: 'Activo',        variante: 'info' },
  { valor: 'P', label: 'Pendiente',     variante: 'warning' },
  { valor: 'E', label: 'En proceso',    variante: 'info' },
  { valor: 'T', label: 'Seguimiento',   variante: 'secondary' },
  { valor: 'R', label: 'Para revisión', variante: 'warning' },
  { valor: 'C', label: 'Cerrado',       variante: 'success' },
];

export function etiquetaEstadoEvento(estado: string): string {
  return ESTADOS_EVENTO.find(e => e.valor === estado)?.label ?? estado;
}

export function varianteEstadoEvento(estado: string): 'info' | 'warning' | 'success' | 'secondary' {
  return ESTADOS_EVENTO.find(e => e.valor === estado)?.variante ?? 'secondary';
}

export function etiquetaPrioridad(p: string | null | undefined): string {
  return ({ FLASH: 'Flash', INMEDIATA: 'Inmediata', RUTINA: 'Rutina' } as Record<string, string>)[
    (p ?? '').toUpperCase()
  ] ?? (p || 'Sin prioridad');
}

export function variantePrioridad(p: string | null | undefined): 'danger' | 'warning' | 'info' | 'secondary' {
  return ({ FLASH: 'danger', INMEDIATA: 'warning', RUTINA: 'info' } as const)[
    (p ?? '').toUpperCase() as 'FLASH'
  ] ?? 'secondary';
}

export function minutosDesde(fecha: string | null | undefined): number {
  if (!fecha) return 0;
  return Math.max(0, Math.floor((Date.now() - new Date(fecha).getTime()) / 60_000));
}

type Evento = DtoEventoListItem | DtoPedidoDetalle;

/** El detalle trae 'anotaciones'; el item de bandeja no. */
function esDetalle(item: Evento): item is DtoPedidoDetalle {
  return 'anotaciones' in item;
}

function primerAccesoDe(item: Evento): string | null {
  return (item as DtoEventoListItem).fechaPrimerAcceso ?? null;
}

/**
 * Cerrado: verde. Flash: siempre rojo. Abierto y sin que nadie lo haya
 * abierto: amarillo pasado el umbral, rojo si además es inmediata. Abierto y
 * en gestión: rojo al superar el umbral crítico.
 *
 * En la vista de detalle el acceso ya quedó registrado al abrir el caso, así
 * que siempre se mide contra el tiempo de gestión.
 */
export function semaforoDe(item: Evento, umbrales: UmbralesSla): SemaforoColor {
  if (item.estado === 'C') return 'semaforo-verde';

  const prio = (item.prioridad ?? '').toUpperCase().trim();
  if (prio === 'FLASH') return 'semaforo-rojo';

  const acceso = primerAccesoDe(item);
  if (!esDetalle(item) && !acceso) {
    return minutosDesde(item.fechaCreacion ?? item.horaCaso) >= umbrales.sinAcceso
      ? (prio === 'INMEDIATA' ? 'semaforo-rojo' : 'semaforo-amarillo')
      : 'semaforo-verde';
  }

  return minutosDesde(acceso ?? item.fechaCreacion) >= umbrales.critico
    ? 'semaforo-rojo' : 'semaforo-verde';
}

/**
 * Fecha fija si el caso está cerrado, tiempo en cola si nadie lo ha abierto y
 * tiempo de gestión una vez abierto. Ya no es un contador infinito.
 */
export function etiquetaTiempo(item: Evento): string {
  if (item.estado === 'C') {
    return item.fechaCreacion ? formatoCorto(item.fechaCreacion) : '—';
  }
  const acceso = primerAccesoDe(item);
  const enCola = !esDetalle(item) && !acceso;
  const min = enCola
    ? minutosDesde(item.fechaCreacion ?? item.horaCaso)
    : minutosDesde(acceso ?? item.fechaCreacion);
  const texto = min < 60
    ? `${min}m`
    : `${Math.floor(min / 60)}h${min % 60 ? ' ' + (min % 60) + 'm' : ''}`;
  return `${enCola ? 'En cola' : 'Gestión'} ${texto}`;
}

const dosDigitos = (n: number) => String(n).padStart(2, '0');

function formatoCorto(raw: string): string {
  const d = new Date(raw);
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)} ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

export function etiquetaFechaCreacion(item: Evento): string {
  const raw = item.fechaCreacion ?? item.horaCaso;
  if (!raw) return '—';
  const d = new Date(raw);
  return `${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}/${d.getFullYear()}`
       + ` ${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
}

export function formatHora(raw: string | null | undefined): string {
  if (!raw) return '—';
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleString('es-CO', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/** Distancia en kilómetros entre dos coordenadas (fórmula de Haversine). */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2
          + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function escaparHtml(valor: unknown): string {
  if (!valor) return '';
  return String(valor)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
