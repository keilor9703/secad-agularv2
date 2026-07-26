/**
 * Contrato entregado por la API pública de emisoras.
 * Se mantiene separado del reproductor para no acoplar la UI al backend.
 */
export interface DtoRadioEmisora {
  idEmisora: number;
  nombre: string;
  streamUrl: string;
  logoUrl?: string | null;
  orden: number;
  activo: number;
}

/** Modelo normalizado que consume la interfaz del reproductor. */
export interface RadioStation {
  id: string;
  name: string;
  streamUrl: string;
  logoUrl: string | null;
}

export type RadioPlaybackState = 'idle' | 'loading' | 'ready' | 'playing' | 'paused' | 'offline';

export type RadioConnectionState = 'checking' | 'online' | 'offline';

/** Estado breve visible y detalle técnico presentado en el tooltip. */
export interface RadioStatusView {
  state: RadioConnectionState;
  label: 'Verificando' | 'Online' | 'Offline';
  tooltip: string;
}
