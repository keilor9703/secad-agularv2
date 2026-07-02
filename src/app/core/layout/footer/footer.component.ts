import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BrandingService } from '../../services/branding.service';
import { DtoRadioEmisora, RadioService } from '../../services/radio.service';
import { environment } from '../../../../environments/environment';

interface FooterStation {
  id: string;
  name: string;
  url: string;
  logoUrl?: string | null;
}

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './footer.component.html',
  styleUrl: './footer.component.scss',
})
export class FooterComponent implements OnInit, OnDestroy {
  systemName = 'SISGE';
  systemDisplayName = 'Sistema de gestion de Policia';
  isPlaying = false;
  errorMessage = '';
  selectedStation = '';
  private audio: HTMLAudioElement | null = null;

  supportOpen = false;
  policyOpen = false;

  stations: FooterStation[] = [];

  supportForm = {
    tipo: 'Incidente (error)',
    prioridad: 'Media',
    asunto: '',
    descripcion: '',
    incluirDatosTecnicos: true,
    adjuntos: [] as File[]
  };

  constructor(
    private brandingService: BrandingService,
    private radioService: RadioService
  ) {
    this.loadBranding();
    this.initAudio();
  }

  ngOnInit(): void {
    this.loadStations();
  }

  private loadBranding(): void {
    this.brandingService.getPublicConfig().subscribe({
      next: (cfg) => {
        const sigla = (cfg?.sistema ?? cfg?.systemName ?? '').trim();
        const nombre = (cfg?.nombreSistema ?? '').trim();
        this.systemName = sigla || 'OFTIC';
        this.systemDisplayName = nombre || 'Sistema de gestion de Policia';
      },
      error: () => {
        this.systemName = 'OFTIC';
        this.systemDisplayName = 'Sistema de gestion de Policia';
      }
    });
  }

  private loadStations(): void {
    this.radioService.getPublicas().subscribe({
      next: (data) => {
        const mapped = (data ?? [])
          .map((x, idx) => this.mapStation(x, idx))
          .filter((x) => !!x.url);

        this.stations = mapped;
        this.selectedStation = this.stations[0]?.id ?? '';

        if (this.audio && this.currentStationUrl) {
          this.audio.src = this.currentStationUrl;
        }
      },
      error: () => {
        this.stations = [];
        this.selectedStation = '';
        this.errorMessage = 'No fue posible cargar emisoras activas.';
      }
    });
  }

  openSupport(): void {
    this.supportOpen = true;
    document.body.classList.add('ui-modal-open');
  }

  closeSupport(): void {
    this.supportOpen = false;
    if (!this.policyOpen) {
      document.body.classList.remove('ui-modal-open');
    }
  }

  onFilesSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    this.supportForm.adjuntos = files;
  }

  submitSupport(): void {
    if (!this.supportForm.asunto.trim() || !this.supportForm.descripcion.trim()) {
      alert('Completa Asunto y Descripcion.');
      return;
    }

    // solo UI
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
      adjuntos: []
    };
  }

  get currentStationUrl(): string {
    const station = this.stations.find((s) => s.id === this.selectedStation);
    return station?.url ?? '';
  }

  get currentStationName(): string {
    const station = this.stations.find((s) => s.id === this.selectedStation);
    return station?.name ?? 'Sin emisora';
  }

  get currentStationLogo(): string {
    const station = this.stations.find((s) => s.id === this.selectedStation);
    return (station?.logoUrl ?? '').trim() || '/imagenes/radio-policia-bogota.svg';
  }

  get currentStationLabel(): string {
    return `Radio Policia - ${this.currentStationName}`;
  }

  private initAudio(): void {
    this.audio = new Audio();
    this.audio.volume = 0.75;

    this.audio.addEventListener('playing', () => {
      this.isPlaying = true;
      this.errorMessage = '';
    });

    this.audio.addEventListener('pause', () => {
      this.isPlaying = false;
    });

    this.audio.addEventListener('error', () => {
      this.isPlaying = false;
      this.errorMessage = 'No se pudo conectar con la radio.';
    });

    this.audio.addEventListener('ended', () => {
      this.isPlaying = false;
    });
  }

  onStationChange(): void {
    if (!this.audio || !this.currentStationUrl) return;

    const wasPlaying = this.isPlaying;
    this.audio.pause();
    this.audio.src = this.currentStationUrl;
    this.isPlaying = false;

    if (wasPlaying) {
      this.audio.play().catch(() => {
        this.errorMessage = 'No se pudo reproducir esta emisora.';
      });
    }
  }

  togglePlay(): void {
    if (!this.audio) return;

    if (!this.currentStationUrl) {
      this.errorMessage = 'No hay emisoras activas configuradas.';
      return;
    }

    if (this.isPlaying) {
      this.audio.pause();
      return;
    }

    this.errorMessage = '';
    this.audio.play().catch(() => {
      this.errorMessage = 'No se pudo iniciar la radio.';
    });
  }

  openPolicy(): void {
    this.policyOpen = true;
    document.body.classList.add('ui-modal-open');
  }

  closePolicy(): void {
    this.policyOpen = false;

    if (!this.supportOpen) {
      document.body.classList.remove('ui-modal-open');
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
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio = null;
    }

    document.body.classList.remove('ui-modal-open');
  }

  private mapStation(item: DtoRadioEmisora, index: number): FooterStation {
    let logo = (item.logoUrl ?? '').trim();
    if (logo && !logo.startsWith('http') && !logo.startsWith('data:')) {
      // Si la ruta es relativa (ej: /uploads/radio/... o similar), apuntamos al servidor externo
      const baseUrl = environment.sliderMediaBaseUrl;
      if (logo.startsWith('/')) {
        logo = `${baseUrl}${logo}`;
      } else {
        // Si viene solo el nombre, intentamos la ruta estándar de uploads de radio en ese server
        logo = `${baseUrl}/uploads/radio/${logo}`;
      }
    }

    return {
      id: String(item.idEmisora ?? index + 1),
      name: (item.nombre ?? '').trim() || `Emisora ${index + 1}`,
      url: (item.streamUrl ?? '').trim(),
      logoUrl: logo || null
    };
  }
}

