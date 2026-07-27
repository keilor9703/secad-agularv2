export interface BannerItem {
  idBanner: number;
  titulo?: string | null;
  subtitulo?: string | null;
  urlImagen?: string | null;
  urlDestino?: string | null;
  orden: number;
  vigente: number;
  fechaInicio?: string | null;
  fechaFin?: string | null;
  origenDatos?: 'API' | 'CACHE' | string;
}