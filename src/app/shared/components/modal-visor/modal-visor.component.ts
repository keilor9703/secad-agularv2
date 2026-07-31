import { Component, OnDestroy, OnInit, ChangeDetectionStrategy } from '@angular/core';

import { NavigationEnd, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { filter } from 'rxjs/operators';
import { DtoModalActivo, ModalService } from '../../../core/services/modal.service';
import { environment } from '../../../../environments/environment';
import { SafeUrlPipe } from '../../pipes/safe-url.pipe';

@Component({
  selector: 'app-modal-visor',
  standalone: true,
  imports: [SafeUrlPipe],
  templateUrl: './modal-visor.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./modal-visor.component.scss'],
})
export class ModalVisorComponent implements OnInit, OnDestroy {
  modal: DtoModalActivo | null = null;
  visible = false;

  private static readonly SESSION_KEY = 'modales_vistos';
  private routerSub!: Subscription;
  private delay?: ReturnType<typeof setTimeout>;

  get resourceUrl(): string {
    let raw = (this.modal?.rutaRecurso ?? '').trim();
    if (!raw) return '';
    if (raw.startsWith('http') || raw.startsWith('data:')) return raw;
    
    const baseUrl = environment.sliderMediaBaseUrl;
    if (raw.startsWith('/')) {
      return `${baseUrl}${raw}`;
    }
    // Si viene solo el nombre, intentamos la ruta estándar de modales
    return `${baseUrl}/uploads/modales/${raw}`;
  }

  get esImagen(): boolean { return this.modal?.tipoRecurso?.toUpperCase() === 'IMAGEN'; }
  get esVideo(): boolean  { return this.modal?.tipoRecurso?.toUpperCase() === 'VIDEO';  }
  
  get videoMimeType(): string {
    const ruta = this.modal?.rutaRecurso ?? '';
    if (ruta.endsWith('.webm')) return 'video/webm';
    if (ruta.endsWith('.mov'))  return 'video/quicktime';
    return 'video/mp4';
  }
  
  get requiereAceptar(): boolean {
    return this.modal?.tipoAccion === 'ACEPTAR' || this.modal?.tipoAccion === 'CONFIRMAR';
  }

  constructor(private modalService: ModalService, private router: Router) {}

  ngOnInit(): void {
    // Importación necesaria para el template
    this.routerSub = this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: NavigationEnd) => {
        const url = e.urlAfterRedirects ?? e.url;
        if (url === '/home' || url === '/home;' || url.startsWith('/home?')) {
          this.intentarMostrar();
        }
      });

    const url = this.router.url;
    if (url === '/home' || url.startsWith('/home?') || url.startsWith('/home;')) {
      this.intentarMostrar();
    }
  }

  ngOnDestroy(): void {
    this.routerSub?.unsubscribe();
    clearTimeout(this.delay);
  }

  aceptar(): void {
    this.registrar('ACEPTAR');
    this.cerrarModal();
  }

  cerrar(): void {
    this.registrar('CERRAR');
    this.cerrarModal();
  }

  onVideoError(event: Event): void {
    console.error('Error cargando video del modal:', this.resourceUrl, event);
  }

  private intentarMostrar(): void {
    if (sessionStorage.getItem(ModalVisorComponent.SESSION_KEY)) return;
    if (this.visible) return;

    clearTimeout(this.delay);
    this.delay = setTimeout(() => this.cargar(), 2000);
  }

  private cargar(): void {
    this.modalService.getActivos().subscribe({
      next: (data) => {
        const activo = data?.[0] ?? null;
        if (activo) {
          this.modal = activo;
          this.visible = true;
          this.registrar('VISTA');
        }
      },
      error: (err) => console.error('[ModalVisor] error cargando activos:', err)
    });
  }

  private cerrarModal(): void {
    this.visible = false;
    this.modal = null;
    sessionStorage.setItem(ModalVisorComponent.SESSION_KEY, '1');
  }

  private registrar(accion: string): void {
    if (!this.modal) return;
    this.modalService.registrarInteraccion({
      IdModal: this.modal.idModal,
      TipoAccion: accion,
    }).subscribe({ error: () => {} });
  }
}
