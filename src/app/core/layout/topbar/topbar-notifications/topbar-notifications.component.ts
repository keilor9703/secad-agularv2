import { CommonModule } from '@angular/common';
import { Component, HostListener, OnInit } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { HeaderNotification } from '../../../interfaces/topbar.interface';
import { DtoEvento, EventoService } from '../../../services/evento.service';

@Component({
  selector: 'app-topbar-notifications',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './topbar-notifications.component.html',
  styleUrl: './topbar-notifications.component.scss',
})
export class TopbarNotificationsComponent implements OnInit {
  readonly notifications: HeaderNotification[] = [
    { id: 4, icon: 'fa-calendar-check', color: 'primary', count: 0, tooltip: 'Eventos' },
  ];

  proximosEventos: DtoEvento[] = [];
  isCalendarDropdownOpen = false;
  selectedEvento: DtoEvento | null = null;
  isEventoModalOpen = false;

  constructor(private eventoService: EventoService) {}

  ngOnInit(): void {
    this.loadEventosCount();
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement;
    if (!target.closest('app-topbar-notifications')) {
      this.isCalendarDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.isCalendarDropdownOpen = false;
    this.closeEventoModal();
  }

  onNotificationClick(notification: HeaderNotification, event: Event): void {
    event.stopPropagation();

    if (notification.id === 4) {
      this.isCalendarDropdownOpen = !this.isCalendarDropdownOpen;
    }
  }

  openEventoDetail(evento: DtoEvento, event?: Event): void {
    event?.stopPropagation();
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
    if (!value) {
      return '';
    }

    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:')) {
      return value;
    }

    if (value.startsWith('/')) {
      return value;
    }

    return `${environment.eventoMediaBaseUrl}/api/Evento/Image/${value}`;
  }

  getEventoFechaRango(evento: DtoEvento): string {
    const fi = this.formatDate(evento.fechaInicio);
    const ff = this.formatDate(evento.fechaFin);

    if (!fi && !ff) {
      return 'Sin fecha';
    }

    return fi === ff ? fi : `${fi} - ${ff}`;
  }

  private loadEventosCount(): void {
    this.eventoService.getAll().subscribe({
      next: (items) => {
        const today = new Date();
        const todayZero = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const limit = new Date(todayZero);
        limit.setDate(todayZero.getDate() + 5);

        this.proximosEventos = (items ?? []).filter((eventItem) =>
          this.isUpcomingActiveEvent(eventItem, todayZero, limit),
        );

        const calendarNotif = this.notifications.find((item) => item.id === 4);
        if (calendarNotif) {
          calendarNotif.count = this.proximosEventos.length;
        }
      },
      error: () => {
        this.proximosEventos = [];
      },
    });
  }

  private isUpcomingActiveEvent(evento: DtoEvento, todayZero: Date, limit: Date): boolean {
    if (String(evento.vigente ?? '') !== '1') {
      return false;
    }

    const startDate = this.parseDateOnly(evento.fechaInicio);
    if (!startDate) {
      return false;
    }

    return startDate.getTime() >= todayZero.getTime() && startDate.getTime() <= limit.getTime();
  }

  private parseDateOnly(value: string): Date | null {
    const parts = String(value ?? '').split('T')[0].split('-');
    if (parts.length !== 3) {
      return null;
    }

    const parsed = new Date(
      Number.parseInt(parts[0], 10),
      Number.parseInt(parts[1], 10) - 1,
      Number.parseInt(parts[2], 10),
    );

    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private formatDate(value: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString('es-CO', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
  }
}
