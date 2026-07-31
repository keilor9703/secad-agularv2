import { Component, DestroyRef, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';

import { BrandingService } from './core/services/branding.service';
import { ToastService, type ToastType } from './core/services/toast.service';
import { ModalVisorComponent } from './shared/components/modal-visor/modal-visor.component';

interface AppToastState {
  readonly open: boolean;
  readonly type: ToastType;
  readonly title: string;
  readonly message: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [RouterOutlet, ModalVisorComponent],
})
export class AppComponent {
  readonly toast = signal<AppToastState>({
    open: false,
    type: 'success',
    title: '',
    message: '',
  });

  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);
  private readonly brandingService = inject(BrandingService);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    this.listenForToasts();
    this.loadBranding();
    this.destroyRef.onDestroy(() => clearTimeout(this.toastTimer));
  }

  hideToast(): void {
    this.toast.update((toast) => ({ ...toast, open: false }));
  }

  private listenForToasts(): void {
    this.toastService.toast$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((toast) => {
      this.toast.set({
        open: true,
        type: toast.type,
        title: toast.title,
        message: toast.message,
      });

      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => this.hideToast(), toast.duration ?? 3500);
    });
  }

  private loadBranding(): void {
    this.brandingService
      .getPublicConfig()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (config) => {
          this.applyFavicon(config?.faviconUrl ?? null);
          this.applyDocumentTitle(config?.sistema ?? config?.systemName ?? null);
        },
        error: () => undefined,
      });
  }

  private applyDocumentTitle(sigla: string | null): void {
    const title = (sigla ?? '').trim();
    document.title = title || 'SISGE';
  }

  private applyFavicon(faviconUrl: string | null): void {
    if (!faviconUrl) {
      return;
    }

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
}
