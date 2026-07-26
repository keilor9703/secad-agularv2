import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { environment } from '../../../../environments/environment';
import { AuthService } from '../../auth/auth.service';
import { HeaderNotification, MiPerfilDto } from '../../interfaces/topbar.interface';
import { BrandingService } from '../../services/branding.service';
import { DtoEvento, EventoService } from '../../services/evento.service';
import { SidebarService } from '../../services/sidebar.service';

@Component({
  selector: 'app-topbar',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './topbar.component.html',
  styleUrls: ['./topbar.component.scss'],
})
export class TopbarComponent implements OnInit {
  private readonly sidebarService = inject(SidebarService);

  readonly sidebarOpen = this.sidebarService.isOpen;

  isUserDropdownOpen = false;
  userPhotoUrl: string | null = null;
  profileModalOpen = false;
  profileLoading = false;
  perfil: MiPerfilDto | null = null;

  // Próximos eventos
  proximosEventos: DtoEvento[] = [];
  isCalendarDropdownOpen = false;
  selectedEvento: DtoEvento | null = null;
  isEventoModalOpen = false;

  constructor(
    private authService: AuthService,
    private http: HttpClient,
    private router: Router,
    private brandingService: BrandingService,
    private eventoService: EventoService,
  ) {}

  ngOnInit(): void {
    this.userName = this.authService.getUsuario();
    this.loadBranding();
    this.loadMyPhoto();
    this.loadEventosCount();
  }

  toggleMobileMenu(): void {
    this.sidebarService.toggleSidebar();
  }

  toggleUserDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.isUserDropdownOpen = !this.isUserDropdownOpen;
  }

  closeUserDropdown(): void {
    this.isUserDropdownOpen = false;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;

    // Cierre de dropdown de usuario
    if (this.isUserDropdownOpen) {
      if (!target.closest('.header-user')) {
        this.closeUserDropdown();
      }
    }

    // Cierre de dropdown de calendario
    if (this.isCalendarDropdownOpen) {
      if (!target.closest('.notification-wrapper')) {
        this.isCalendarDropdownOpen = false;
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeUserDropdown();
    this.isCalendarDropdownOpen = false;
  }

  notifications: HeaderNotification[] = [
    { id: 4, icon: 'fa-calendar-check', color: 'primary', count: 0, tooltip: 'Eventos' },
  ];

  searchQuery: string = '';
  userName: string = 'Usuario';
  userRole: string = 'OFTIC';

  private loadBranding(): void {
    this.brandingService.getPublicConfig().subscribe({
      next: (cfg) => {
        const sigla = (cfg?.sistema ?? cfg?.systemName ?? '').trim();
        this.userRole = sigla || 'OFTIC';
      },
      error: () => {
        this.userRole = 'OFTIC';
      },
    });
  }

  private loadEventosCount(): void {
    this.eventoService.getAll().subscribe({
      next: (items) => {
        const today = new Date();
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const limit = new Date(todayZero);
        limit.setDate(todayZero.getDate() + 5);

        const filtered = (items ?? []).filter((e) => {
          // Validar vigencia
          const v = e.vigente;
          if (v == null || String(v) !== '1') return false;

          // Validar fecha de inicio dentro de los próximos 5 días
          const startStr = (e.fechaInicio || '').toString().split('T')[0];
          const parts = startStr.split('-');
          if (parts.length !== 3) return false;

          const startDate = new Date(
            parseInt(parts[0], 10),
            parseInt(parts[1], 10) - 1,
            parseInt(parts[2], 10),
          );

          return (
            startDate.getTime() >= todayZero.getTime() && startDate.getTime() <= limit.getTime()
          );
        });

        this.proximosEventos = filtered;
        const calendarNotif = this.notifications.find((n) => n.id === 4);
        if (calendarNotif) {
          calendarNotif.count = filtered.length;
        }
      },
    });
  }

  onSearch(): void {}

  onNotificationClick(notification: HeaderNotification): void {
    if (notification.id === 4) {
      this.isCalendarDropdownOpen = !this.isCalendarDropdownOpen;
    }
  }

  openEventoDetail(evento: DtoEvento, event?: Event): void {
    if (event) event.stopPropagation();
    this.selectedEvento = evento;
    this.isEventoModalOpen = true;
    this.isCalendarDropdownOpen = false;
  }

  closeEventoModal(): void {
    this.isEventoModalOpen = false;
    this.selectedEvento = null;
  }

  getEventoImageUrl(raw: string | null | undefined): string {
    const value = (raw ?? '').trim();
    if (!value) return '';
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:'))
      return value;
    if (value.startsWith('/')) return value;

    // Usar el host externo para imágenes de eventos
    return `${environment.eventoMediaBaseUrl}/api/Evento/Image/${value}`;
  }

  getEventoFechaRango(evento: DtoEvento): string {
    const fmt = (dStr: string) => {
      const d = new Date(dStr);
      return isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
    };
    const fi = fmt(evento.fechaInicio);
    const ff = fmt(evento.fechaFin);
    if (!fi && !ff) return 'Sin fecha';
    return fi === ff ? fi : `${fi} - ${ff}`;
  }

  onProfileClick(): void {
    this.openProfileModal();
  }

  onLogout(): void {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  private loadMyPhoto(): void {
    this.http.get(`${environment.apiBaseUrl}/Usuario/MiFoto`, { responseType: 'text' }).subscribe({
      next: (raw) => {
        this.userPhotoUrl = this.normalizePhoto(raw);
      },
      error: () => {
        this.userPhotoUrl = null;
      },
    });
  }

  private normalizePhoto(raw: string | null): string | null {
    if (!raw) {
      return null;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    let decoded = trimmed;
    try {
      if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
        decoded = JSON.parse(trimmed);
      }
    } catch {
      decoded = trimmed;
    }

    if (!decoded || decoded.length < 20) {
      return null;
    }

    if (decoded.startsWith('data:image/')) {
      return decoded;
    }

    return `data:image/jpeg;base64,${decoded}`;
  }

  openProfileModal(): void {
    this.profileModalOpen = true;
    this.closeUserDropdown();

    if (this.perfil) {
      return;
    }

    this.profileLoading = true;
    this.http.get<MiPerfilDto>(`${environment.apiBaseUrl}/Usuario/MiPerfil`).subscribe({
      next: (data) => {
        this.perfil = data ?? {};
        this.profileLoading = false;
      },
      error: () => {
        this.perfil = null;
        this.profileLoading = false;
      },
    });
  }

  closeProfileModal(): void {
    this.profileModalOpen = false;
  }
}
