import { ChangeDetectionStrategy, Component, inject, input, OnDestroy } from '@angular/core';
import { RadioPlayerService } from '../../../services/radio-player.service';

interface EqualizerBar {
  readonly id: number;
  readonly level: number;
}

export type RadioPlayerVariant = 'footer' | 'mobile';

@Component({
  selector: 'app-radio-player',
  standalone: true,
  templateUrl: './radio-player.component.html',
  styleUrl: './radio-player.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RadioPlayerComponent implements OnDestroy {
  /**
   * `footer` conserva la barra compacta de escritorio.
   * `mobile` presenta el mismo reproductor como una tarjeta bajo el banner.
   */
  readonly variant = input<RadioPlayerVariant>('footer');

  /**
   * El tipo explícito evita falsos positivos del Angular Language Service
   * después de agregar o mover el servicio en una sesión activa del editor.
   */
  readonly player: RadioPlayerService = inject<RadioPlayerService>(RadioPlayerService);

  /** Niveles visuales fijos; la animación solo se activa durante la reproducción. */
  readonly equalizerBars: readonly EqualizerBar[] = [
    { id: 1, level: 7 },
    { id: 2, level: 11 },
    { id: 3, level: 17 },
    { id: 4, level: 24 },
    { id: 5, level: 13 },
    { id: 6, level: 9 },
    { id: 7, level: 15 },
    { id: 8, level: 21 },
    { id: 9, level: 12 },
    { id: 10, level: 18 },
    { id: 11, level: 25 },
    { id: 12, level: 14 },
    { id: 13, level: 10 },
    { id: 14, level: 7 },
  ];

  constructor() {
    this.player.initialize();
  }

  onStationChange(event: Event): void {
    this.player.selectStation((event.target as HTMLSelectElement).value);
  }

  onVolumeInput(event: Event): void {
    const percentage = Number((event.target as HTMLInputElement).value);
    this.player.setVolume(percentage / 100);
  }

  onStatusClick(): void {
    if (this.player.status().state === 'offline') {
      this.player.retryConnection();
    }
  }

  onLogoError(event: Event): void {
    const image = event.target as HTMLImageElement;
    const fallback = '/imagenes/radio-policia-bogota.svg';

    if (!image.src.endsWith(fallback)) {
      image.src = fallback;
    }
  }

  ngOnDestroy(): void {
    // No se deja una reproducción activa cuando desaparece su única interfaz visible.
    this.player.pause();
  }
}
