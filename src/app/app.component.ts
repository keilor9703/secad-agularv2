import { CommonModule } from '@angular/common';
import { Component, HostListener, OnDestroy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';

import { ToastService, ToastType } from './core/services/toast.service';
import { AlertService, AlertType } from './core/services/alert.service';
import { BrandingService } from './core/services/branding.service';
import { ModalVisorComponent } from './shared/components/modal-visor/modal-visor.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [RouterOutlet, CommonModule, ModalVisorComponent]
})
export class AppComponent implements OnDestroy {

  // ===== TOAST =====
  toast = {
    open: false,
    type: 'success' as ToastType,
    title: '',
    message: ''
  };

  private toastTimer?: ReturnType<typeof setTimeout>;
  private toastSub: Subscription;

  // ===== ALERT MODAL =====
  alert = {
    open: false,
    type: 'info' as AlertType,
    title: '',
    message: '',
    okText: 'OK'
  };

  private alertSub: Subscription;

  constructor(
    private toastService: ToastService,
    private alertService: AlertService,
    private brandingService: BrandingService
  ) {
    // Escucha TOAST global
    this.toastSub = this.toastService.toast$.subscribe(t => {
      this.toast = {
        open: true,
        type: t.type,
        title: t.title,
        message: t.message
      };

      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.hideToast(), t.duration ?? 3500);
    });

    // Escucha ALERT MODAL global
    this.alertSub = this.alertService.alert$.subscribe(a => {
      this.alert = {
        open: true,
        type: a.type,
        title: a.title,
        message: a.message,
        okText: a.okText ?? 'OK'
      };

      // Bloquear scroll del fondo mientras esté la alerta
      document.body.classList.add('ui-modal-open');
    });

    this.brandingService.getPublicConfig().subscribe({
      next: (cfg) => {
        this.applyFavicon(cfg?.faviconUrl ?? null);
        this.applyDocumentTitle(cfg?.sistema ?? cfg?.systemName ?? null);
      },
      error: () => {}
    });
  }

  private applyDocumentTitle(sigla: string | null): void {
    const title = (sigla ?? '').trim();
    document.title = title || 'SISGE';
  }

  private applyFavicon(faviconUrl: string | null): void {
    if (!faviconUrl) return;
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (link) {
      link.href = faviconUrl;
      return;
    }

    const newLink = document.createElement('link');
    newLink.rel = 'icon';
    newLink.href = faviconUrl;
    document.head.appendChild(newLink);
  }

  // ===== TOAST API =====
  hideToast(): void {
    this.toast.open = false;
  }

  // ===== ALERT API =====
  closeAlert(): void {
    this.alert.open = false;
    document.body.classList.remove('ui-modal-open');
  }

  // Cerrar con ESC (prioridad: alerta)
  @HostListener('document:keydown.escape')
  onEsc(): void {
    if (this.alert.open) this.closeAlert();
  }

  ngOnDestroy(): void {
    this.toastSub.unsubscribe();
    this.alertSub.unsubscribe();

    clearTimeout(this.toastTimer);
    document.body.classList.remove('ui-modal-open');
  }
}

