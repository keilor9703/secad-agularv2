import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DtoAdjunto } from '../../../../core/services/operacion/recepcion.service';

/**
 * Galería de los archivos de un caso: fotos que llegaron por chat o SMS y
 * grabaciones de videollamada.
 *
 * Vive aparte porque la usan por igual el seguimiento de incidentes y el panel
 * de despacho; antes era la misma cuadrícula copiada en dos pantallas.
 */
@Component({
  selector: 'app-adjuntos-caso',
  standalone: true,
  templateUrl: './adjuntos-caso.component.html',
  styleUrl: './adjuntos-caso.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdjuntosCasoComponent {
  readonly adjuntos = input.required<DtoAdjunto[]>();

  /** Segundos como m:ss — duración de una grabación. */
  formatDuracion(segundos: number | null | undefined): string {
    if (segundos == null || segundos < 0) return '—';
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
}
