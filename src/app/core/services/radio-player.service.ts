import { isPlatformBrowser } from '@angular/common';
import { computed, DestroyRef, inject, Injectable, PLATFORM_ID, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  DtoRadioEmisora,
  RadioPlaybackState,
  RadioStation,
  RadioStatusView,
} from '../models/radio.model';
import { RadioService } from './radio.service';

const DEFAULT_RADIO_LOGO = '/imagenes/radio-policia-bogota.svg';
const STREAM_CONNECTION_TIMEOUT_MS = 8_000;

/**
 * Controlador global de la emisora institucional.
 *
 * Centraliza el elemento HTMLAudioElement, sus eventos y el estado reactivo.
 * Los componentes solo representan señales y delegan las acciones de usuario.
 */
@Injectable({ providedIn: 'root' })
export class RadioPlayerService {
  private readonly radioApi = inject(RadioService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);

  private readonly stationsState = signal<readonly RadioStation[]>([]);
  private readonly selectedStationIdState = signal('');
  private readonly playbackState = signal<RadioPlaybackState>('idle');
  private readonly volumeState = signal(0.75);
  private readonly mutedState = signal(false);
  private readonly technicalDetail = signal('No se ha iniciado la conexión con la emisora.');

  private initialized = false;
  private loadingStations = false;
  private playRequested = false;
  private readonly failedStationIds = new Set<string>();
  private connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private readonly audio: HTMLAudioElement | null;

  readonly stations = this.stationsState.asReadonly();
  readonly selectedStationId = this.selectedStationIdState.asReadonly();
  readonly volume = this.volumeState.asReadonly();
  readonly isMuted = this.mutedState.asReadonly();
  readonly isPlaying = computed(() => this.playbackState() === 'playing');
  readonly hasStations = computed(() => this.stations().length > 0);
  readonly volumePercent = computed(() => Math.round(this.volume() * 100));

  readonly currentStation = computed<RadioStation | null>(() => {
    const selectedId = this.selectedStationId();
    return this.stations().find((station) => station.id === selectedId) ?? null;
  });

  readonly currentStationLogo = computed(
    () => this.currentStation()?.logoUrl || DEFAULT_RADIO_LOGO,
  );

  readonly currentStationLabel = computed(() => {
    const name = this.currentStation()?.name ?? 'Sin emisora';
    return `Radio Policía - ${name}`;
  });

  readonly status = computed<RadioStatusView>(() => {
    const detail = this.technicalDetail();

    switch (this.playbackState()) {
      case 'ready':
      case 'paused':
        return {
          state: 'online',
          label: 'Online',
          tooltip: 'Servidor de streaming disponible; reproducción en pausa.',
        };
      case 'playing':
        return {
          state: 'online',
          label: 'Online',
          tooltip: 'Conexión estable con el servidor de streaming; audio en reproducción.',
        };
      case 'loading':
        return {
          state: 'checking',
          label: 'Verificando',
          tooltip: detail,
        };
      case 'offline':
        return {
          state: 'offline',
          label: 'Offline',
          tooltip: `${detail} Seleccione el estado para reintentar.`,
        };
      default:
        return {
          state: 'checking',
          label: 'Verificando',
          tooltip: detail,
        };
    }
  });

  constructor() {
    this.audio = isPlatformBrowser(this.platformId) ? new Audio() : null;

    if (!this.audio) {
      return;
    }

    this.audio.preload = 'metadata';
    this.audio.volume = this.volume();
    this.bindAudioEvents(this.audio);

    this.destroyRef.onDestroy(() => {
      this.clearConnectionTimeout();
      this.audio?.pause();
      this.audio?.removeAttribute('src');
      this.audio?.load();
    });
  }

  /** Carga el catálogo una sola vez aunque el componente vuelva a crearse. */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.initialized = true;
    this.loadStations();
  }

  selectStation(stationId: string): void {
    if (stationId === this.selectedStationId()) {
      return;
    }

    const shouldResume = this.playRequested || this.isPlaying();
    this.failedStationIds.delete(stationId);
    this.selectedStationIdState.set(stationId);
    this.connectSelectedStation(shouldResume);
  }

  async togglePlayback(): Promise<void> {
    if (this.isPlaying() || this.playRequested) {
      this.pause();
      return;
    }

    await this.play();
  }

  pause(): void {
    this.playRequested = false;
    this.clearConnectionTimeout();
    this.audio?.pause();
  }

  setVolume(volume: number): void {
    const normalizedVolume = Math.min(1, Math.max(0, volume));
    this.volumeState.set(normalizedVolume);

    if (!this.audio) {
      return;
    }

    this.audio.volume = normalizedVolume;

    if (normalizedVolume > 0 && this.audio.muted) {
      this.audio.muted = false;
    }
  }

  toggleMuted(): void {
    const muted = !this.isMuted();
    this.mutedState.set(muted);

    if (this.audio) {
      this.audio.muted = muted;
    }
  }

  retryConnection(): void {
    this.failedStationIds.clear();
    this.playRequested = false;

    if (!this.hasStations()) {
      this.loadStations();
      return;
    }

    this.connectSelectedStation(false);
  }

  private loadStations(): void {
    if (this.loadingStations) {
      return;
    }

    this.loadingStations = true;
    this.playbackState.set('loading');
    this.technicalDetail.set('Consultando el catálogo de emisoras institucionales.');

    this.radioApi
      .getPublicas()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.loadingStations = false;
          const stations = (data ?? [])
            .filter((item) => item.activo !== 0)
            .map((item, index) => this.mapStation(item, index))
            .filter((station) => station.streamUrl.length > 0);

          this.stationsState.set(stations);
          this.failedStationIds.clear();

          if (stations.length === 0) {
            this.selectedStationIdState.set('');
            this.setOffline('No existen emisoras activas con una URL de transmisión válida.');
            return;
          }

          const currentId = this.selectedStationId();
          const nextId = stations.some((station) => station.id === currentId)
            ? currentId
            : stations[0].id;

          this.selectedStationIdState.set(nextId);
          this.connectSelectedStation(false);
        },
        error: () => {
          this.loadingStations = false;
          this.stationsState.set([]);
          this.selectedStationIdState.set('');
          this.setOffline('El servicio de catálogo de emisoras no respondió.');
        },
      });
  }

  private connectSelectedStation(shouldResume: boolean, technicalDetail?: string): void {
    const station = this.currentStation();
    this.clearConnectionTimeout();

    if (!station) {
      this.setOffline('No hay una emisora seleccionada.');
      return;
    }

    this.playbackState.set('loading');
    this.technicalDetail.set(technicalDetail ?? `Validando la transmisión de ${station.name}.`);

    if (!this.audio) {
      this.playbackState.set('ready');
      return;
    }

    this.audio.pause();
    this.audio.src = station.streamUrl;
    this.audio.load();
    this.armConnectionTimeout(station.id);

    if (shouldResume) {
      void this.play();
    }
  }

  private async play(): Promise<void> {
    const station = this.currentStation();

    if (!station) {
      this.setOffline('No hay una emisora disponible para reproducir.');
      return;
    }

    if (!this.audio) {
      this.setOffline('El navegador actual no permite reproducción de audio.');
      return;
    }

    this.playRequested = true;
    this.playbackState.set('loading');
    this.technicalDetail.set('Estableciendo conexión con el servidor de streaming.');
    this.armConnectionTimeout(station.id);

    try {
      await this.audio.play();
    } catch (error: unknown) {
      if (this.selectedStationId() !== station.id) {
        return;
      }

      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        this.playRequested = false;
        this.clearConnectionTimeout();
        this.playbackState.set('ready');
        this.technicalDetail.set('El navegador requiere una nueva interacción para reproducir.');
        return;
      }

      this.handleStreamFailure('No fue posible iniciar la transmisión de audio.');
    }
  }

  private bindAudioEvents(audio: HTMLAudioElement): void {
    fromEvent(audio, 'playing')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.clearConnectionTimeout();
        this.playbackState.set('playing');
        this.failedStationIds.delete(this.selectedStationId());
        this.technicalDetail.set('Transmisión de audio estable.');
      });

    fromEvent(audio, 'canplay')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.clearConnectionTimeout();
        this.failedStationIds.delete(this.selectedStationId());

        if (this.playbackState() !== 'playing') {
          this.playbackState.set('ready');
          this.technicalDetail.set('Servidor de streaming disponible.');
        }
      });

    fromEvent(audio, 'pause')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (!['loading', 'offline', 'idle'].includes(this.playbackState())) {
          this.playbackState.set('paused');
        }
      });

    fromEvent(audio, 'waiting')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (['ready', 'paused'].includes(this.playbackState())) {
          return;
        }

        this.playbackState.set('loading');
        this.technicalDetail.set('La transmisión está almacenando audio temporalmente.');
        this.armConnectionTimeout(this.selectedStationId());
      });

    fromEvent(audio, 'stalled')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (['ready', 'paused'].includes(this.playbackState())) {
          return;
        }

        this.playbackState.set('loading');
        this.technicalDetail.set('El servidor de streaming presenta una respuesta lenta.');
        this.armConnectionTimeout(this.selectedStationId());
      });

    fromEvent(audio, 'error')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.handleStreamFailure('El servidor de streaming está fuera de línea.'));

    fromEvent(audio, 'ended')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.playRequested = false;
        this.playbackState.set('paused');
      });

    fromEvent(audio, 'volumechange')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.volumeState.set(audio.volume);
        this.mutedState.set(audio.muted);
      });
  }

  /**
   * Descarta temporalmente el stream fallido y prueba el siguiente.
   * El conjunto evita ciclos infinitos cuando todas las emisoras están caídas.
   */
  private handleStreamFailure(detail: string): void {
    this.clearConnectionTimeout();
    const failedStation = this.currentStation();

    if (failedStation) {
      this.failedStationIds.add(failedStation.id);
    }

    const nextStation = this.findNextAvailableStation();

    if (!nextStation) {
      this.playRequested = false;
      this.setOffline(
        failedStation
          ? `Ninguna emisora disponible respondió. Último intento: ${failedStation.name}.`
          : detail,
      );
      return;
    }

    const shouldResume = this.playRequested;
    this.selectedStationIdState.set(nextStation.id);
    this.connectSelectedStation(
      shouldResume,
      `${failedStation?.name ?? 'La emisora anterior'} no respondió. Probando ${nextStation.name}.`,
    );
  }

  private findNextAvailableStation(): RadioStation | null {
    const stations = this.stations();

    if (stations.length === 0) {
      return null;
    }

    const currentIndex = Math.max(
      stations.findIndex((station) => station.id === this.selectedStationId()),
      0,
    );

    const candidates: RadioStation[] = [];

    for (let offset = 1; offset <= stations.length; offset += 1) {
      const candidate = stations[(currentIndex + offset) % stations.length];

      if (!this.failedStationIds.has(candidate.id)) {
        candidates.push(candidate);
      }
    }

    const currentHostname = this.getStreamHostname(this.currentStation()?.streamUrl ?? '');
    return (
      candidates.find(
        (candidate) => this.getStreamHostname(candidate.streamUrl) === currentHostname,
      ) ??
      candidates[0] ??
      null
    );
  }

  private getStreamHostname(streamUrl: string): string {
    try {
      return new URL(streamUrl).hostname.toLowerCase();
    } catch {
      return '';
    }
  }

  private armConnectionTimeout(stationId: string): void {
    this.clearConnectionTimeout();
    this.connectionTimeoutId = setTimeout(() => {
      if (this.selectedStationId() === stationId && this.playbackState() === 'loading') {
        this.handleStreamFailure('El servidor agotó el tiempo máximo de conexión.');
      }
    }, STREAM_CONNECTION_TIMEOUT_MS);
  }

  private clearConnectionTimeout(): void {
    if (this.connectionTimeoutId === null) {
      return;
    }

    clearTimeout(this.connectionTimeoutId);
    this.connectionTimeoutId = null;
  }

  private setOffline(detail: string): void {
    this.clearConnectionTimeout();
    this.playbackState.set('offline');
    this.technicalDetail.set(detail);
  }

  private mapStation(item: DtoRadioEmisora, index: number): RadioStation {
    return {
      id: String(item.idEmisora ?? index + 1),
      name: item.nombre?.trim() || `Emisora ${index + 1}`,
      streamUrl: item.streamUrl?.trim() ?? '',
      logoUrl: this.resolveLogoUrl(item.logoUrl),
    };
  }

  private resolveLogoUrl(logoUrl?: string | null): string | null {
    const logo = logoUrl?.trim() ?? '';

    if (!logo || /^(https?:|data:)/i.test(logo)) {
      return logo || null;
    }

    const mediaBaseUrl = environment.sliderMediaBaseUrl.replace(/\/$/, '');
    return logo.startsWith('/')
      ? `${mediaBaseUrl}${logo}`
      : `${mediaBaseUrl}/uploads/radio/${logo}`;
  }
}
