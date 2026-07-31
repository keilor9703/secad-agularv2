import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../services/branding.service';
import { RadioPlayerComponent } from './radio-player/radio-player.component';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [FormsModule, RadioPlayerComponent],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FooterComponent implements OnDestroy {
  private readonly brandingService = inject(BrandingService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly systemName = signal('SISGE');
  readonly systemDisplayName = signal('Sistema de gestión de Policía');

  supportOpen = false;
  policyOpen = false;

  supportForm = {
    tipo: 'Incidente (error)',
    prioridad: 'Media',
    asunto: '',
    descripcion: '',
    incluirDatosTecnicos: true,
    adjuntos: [] as File[],
  };

  constructor() {
    this.loadBranding();
  }

  openSupport(): void {
    this.supportOpen = true;
    this.document.body.classList.add('ui-modal-open');
  }

  closeSupport(): void {
    this.supportOpen = false;

    if (!this.policyOpen) {
      this.document.body.classList.remove('ui-modal-open');
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.supportForm.adjuntos = input.files ? Array.from(input.files) : [];
  }

  submitSupport(): void {
    if (!this.supportForm.asunto.trim() || !this.supportForm.descripcion.trim()) {
      alert('Completa Asunto y Descripción.');
      return;
    }

    // Integración de backend pendiente; por ahora se conserva el flujo visual existente.
    this.resetSupportForm();
    this.closeSupport();
  }

  resetSupportForm(): void {
    this.supportForm = {
      tipo: 'Incidente (error)',
      prioridad: 'Media',
      asunto: '',
      descripcion: '',
      incluirDatosTecnicos: true,
      adjuntos: [],
    };
  }

  openPolicy(): void {
    this.policyOpen = true;
    this.document.body.classList.add('ui-modal-open');
  }

  closePolicy(): void {
    this.policyOpen = false;

    if (!this.supportOpen) {
      this.document.body.classList.remove('ui-modal-open');
    }
  }

  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.supportOpen) {
      this.closeSupport();
      return;
    }

    if (this.policyOpen) {
      this.closePolicy();
    }
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('ui-modal-open');
  }

  private loadBranding(): void {
    this.brandingService
      .getPublicConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (configuration) => {
          const acronym = (configuration?.sistema ?? configuration?.systemName ?? '').trim();
          const name = (configuration?.nombreSistema ?? '').trim();
          this.systemName.set(acronym || 'OFTIC');
          this.systemDisplayName.set(name || 'Sistema de gestión de Policía');
        },
        error: () => {
          this.systemName.set('OFTIC');
          this.systemDisplayName.set('Sistema de gestión de Policía');
        },
      });
  }
}
