import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { VideoUnidadInfo, VideoUnidadService } from '../../../../core/services/video-unidad.service';
import { LoginVisualItem, LoginVisualService } from '../../../../core/services/login-visual.service';
import { BrandingService } from '../../../../core/services/branding.service';
import { ToastService } from '../../../../core/services/toast.service';

@Component({
  selector: 'app-configuracion-sistema',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './configuracion-sistema-page.component.html',
  styleUrls: ['./configuracion-sistema-page.component.scss']
})
export class ConfiguracionSistemaPageComponent implements OnInit {
  videoPanelMinimized = false;
  loginPanelMinimized = false;
  brandingPanelMinimized = false;
  loading = false;
  uploading = false;
  info: VideoUnidadInfo | null = null;
  previewUrl = '';
  selectedVideoFile: File | null = null;
  selectedVideoPreviewUrl = '';
  videoDescripcion = '';
  videoObservaciones = '';
  loginLoading = false;
  loginSaving = false;
  loginUploading = false;
  loginIntervalMs = 6000;
  loginItems: LoginVisualItem[] = [];
  brandingLoading = false;
  brandingSaving = false;
  brandingUploading = false;
  brandingUploadingFavicon = false;
  brandingSistema = 'SISGE';
  brandingNombreSistema = 'SISGE';
  brandingLogoFileName: string | null = null;
  brandingLogoUrl: string | null = null;
  brandingFaviconFileName: string | null = null;
  brandingFaviconUrl: string | null = null;

  constructor(
    private videoService: VideoUnidadService,
    private loginVisualService: LoginVisualService,
    private brandingService: BrandingService,
    private toast: ToastService
  ) {}

  ngOnInit(): void {
    this.loadCurrent();
    this.loadLoginVisualConfig();
    this.loadBrandingConfig();
  }

  togglePanel(panel: 'video' | 'login' | 'branding'): void {
    if (panel === 'video') {
      this.videoPanelMinimized = !this.videoPanelMinimized;
      return;
    }
    if (panel === 'login') {
      this.loginPanelMinimized = !this.loginPanelMinimized;
      return;
    }
    this.brandingPanelMinimized = !this.brandingPanelMinimized;
  }

  loadCurrent(): void {
    this.loading = true;
    this.videoService.getCurrent().subscribe({
      next: (info) => {
        this.info = info;
        this.previewUrl = info?.hasVideo ? info.url : '';
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.info = null;
        this.previewUrl = '';
        this.toast.error('Configuracion sistema', err?.error?.message ?? 'No fue posible consultar el video actual.');
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) {
      return;
    }

    const allowed = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'];
    if (!allowed.includes(file.type)) {
      this.toast.warning('Configuracion sistema', 'Formato inválido. Use MP4, WEBM, OGG o MOV.');
      input.value = '';
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      this.toast.warning('Configuracion sistema', 'El archivo excede 100MB.');
      input.value = '';
      return;
    }

    this.selectedVideoFile = file;
    this.selectedVideoPreviewUrl = URL.createObjectURL(file);
  }

  saveVideo(): void {
    if (!this.selectedVideoFile) {
      this.toast.warning('Configuracion sistema', 'Seleccione un archivo de video.');
      return;
    }

    const descripcion = (this.videoDescripcion ?? '').trim();
    if (!descripcion) {
      this.toast.warning('Configuracion sistema', 'La descripción del video es obligatoria.');
      return;
    }

    this.uploading = true;
    this.videoService.upload(
      this.selectedVideoFile,
      descripcion,
      (this.videoObservaciones ?? '').trim() || undefined
    ).subscribe({
      next: (resp) => {
        this.uploading = false;
        if (!resp?.success) {
          this.toast.warning('Configuracion sistema', resp?.message || 'No fue posible cargar el video.');
          return;
        }
        this.toast.success('Configuracion sistema', resp.message || 'Video cargado correctamente.');
        this.selectedVideoFile = null;
        this.selectedVideoPreviewUrl = '';
        this.videoDescripcion = '';
        this.videoObservaciones = '';
        this.loadCurrent();
      },
      error: (err) => {
        this.uploading = false;
        this.toast.error('Configuracion sistema', err?.error?.detail ?? err?.error?.message ?? 'Error cargando video.');
      }
    });
  }

  loadLoginVisualConfig(): void {
    this.loginLoading = true;
    this.loginVisualService.getAdminConfig().subscribe({
      next: (config) => {
        this.loginIntervalMs = Number(config?.intervalMs ?? 6000);
        this.loginItems = (config?.items ?? [])
          .map((x, idx) => ({
            file: x.file,
            active: x.active ?? true,
            order: Number(x.order ?? idx + 1),
            title: x.title ?? '',
            subtitle: x.subtitle ?? '',
            url: x.url ?? ''
          }))
          .sort((a, b) => a.order - b.order);
        this.loginLoading = false;
      },
      error: (err) => {
        this.loginLoading = false;
        this.loginItems = [];
        this.toast.error('Visual Login', err?.error?.message ?? 'No fue posible cargar la configuración.');
      }
    });
  }

  onLoginImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) {
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.toast.warning('Visual Login', 'Formato inválido. Use JPG, PNG o WEBP.');
      input.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      this.toast.warning('Visual Login', 'La imagen excede 10MB.');
      input.value = '';
      return;
    }

    this.loginUploading = true;
    this.loginVisualService.upload(file).subscribe({
      next: (resp) => {
        this.loginUploading = false;
        if (!resp?.success || !resp?.fileName) {
          this.toast.warning('Visual Login', resp?.message || 'No fue posible cargar la imagen.');
          return;
        }

        const maxOrder = this.loginItems.length > 0
          ? Math.max(...this.loginItems.map((x) => Number(x.order || 0)))
          : 0;

        this.loginItems.push({
          file: resp.fileName,
          active: true,
          order: maxOrder + 1,
          title: '',
          subtitle: '',
          url: resp.url
        });

        this.loginItems = this.loginItems.sort((a, b) => a.order - b.order);
        this.toast.success('Visual Login', resp.message || 'Imagen cargada correctamente.');
      },
      error: (err) => {
        this.loginUploading = false;
        this.toast.error('Visual Login', err?.error?.detail ?? err?.error?.message ?? 'Error cargando imagen.');
      }
    });
  }

  saveLoginConfig(): void {
    this.loginSaving = true;

    const payload = {
      intervalMs: Number(this.loginIntervalMs || 6000),
      items: this.loginItems
        .map((x) => ({
          file: (x.file ?? '').trim(),
          active: !!x.active,
          order: Number(x.order || 0),
          title: (x.title ?? '').trim() || null,
          subtitle: (x.subtitle ?? '').trim() || null
        }))
        .filter((x) => !!x.file)
    };

    this.loginVisualService.saveConfig(payload).subscribe({
      next: (resp) => {
        this.loginSaving = false;
        if (!resp?.success) {
          this.toast.warning('Visual Login', resp?.message || 'No fue posible guardar la configuración.');
          return;
        }
        this.toast.success('Visual Login', resp.message || 'Configuración guardada correctamente.');
        this.loadLoginVisualConfig();
      },
      error: (err) => {
        this.loginSaving = false;
        this.toast.error('Visual Login', err?.error?.detail ?? err?.error?.message ?? 'Error guardando configuración.');
      }
    });
  }

  deleteLoginImage(item: LoginVisualItem): void {
    if (!item?.file) {
      return;
    }
    this.loginVisualService.delete(item.file).subscribe({
      next: (resp) => {
        if (!resp?.success) {
          this.toast.warning('Visual Login', resp?.message || 'No fue posible eliminar la imagen.');
          return;
        }
        this.toast.success('Visual Login', resp.message || 'Imagen eliminada.');
        this.loginItems = this.loginItems.filter((x) => x.file !== item.file);
      },
      error: (err) => {
        this.toast.error('Visual Login', err?.error?.detail ?? err?.error?.message ?? 'Error eliminando imagen.');
      }
    });
  }

  loadBrandingConfig(): void {
    this.brandingLoading = true;
    this.brandingService.getAdminConfig().subscribe({
      next: (cfg) => {
        this.brandingSistema = (cfg?.sistema ?? 'SISGE').trim() || 'SISGE';
        this.brandingNombreSistema = (cfg?.nombreSistema ?? cfg?.systemName ?? 'SISGE').trim() || 'SISGE';
        this.brandingLogoFileName = cfg?.logoFileName ?? null;
        this.brandingLogoUrl = cfg?.logoUrl ?? null;
        this.brandingFaviconFileName = cfg?.faviconFileName ?? null;
        this.brandingFaviconUrl = cfg?.faviconUrl ?? null;
        this.brandingLoading = false;
      },
      error: (err) => {
        this.brandingLoading = false;
        this.toast.error('Marca del sistema', err?.error?.message ?? 'No fue posible cargar la configuración de marca.');
      }
    });
  }

  onBrandingLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) {
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) {
      this.toast.warning('Marca del sistema', 'Formato inválido. Use JPG, PNG, WEBP o SVG.');
      input.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      this.toast.warning('Marca del sistema', 'El logo excede 5MB.');
      input.value = '';
      return;
    }

    this.brandingUploading = true;
    this.brandingService.uploadLogo(file).subscribe({
      next: (resp) => {
        this.brandingUploading = false;
        if (!resp?.success) {
          this.toast.warning('Marca del sistema', resp?.message || 'No fue posible cargar el logo.');
          return;
        }
        this.brandingLogoFileName = resp.fileName;
        this.brandingLogoUrl = resp.logoUrl;
        this.toast.success('Marca del sistema', resp.message || 'Logo cargado correctamente.');
      },
      error: (err) => {
        this.brandingUploading = false;
        this.toast.error('Marca del sistema', err?.error?.detail ?? err?.error?.message ?? 'Error cargando logo.');
      }
    });
  }

  onBrandingFaviconSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files.length > 0 ? input.files[0] : null;
    if (!file) {
      return;
    }

    const allowed = ['image/x-icon', 'image/vnd.microsoft.icon', 'image/png', 'image/svg+xml', 'image/webp'];
    if (!allowed.includes(file.type)) {
      this.toast.warning('Marca del sistema', 'Formato inválido. Use ICO, PNG, WEBP o SVG.');
      input.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.toast.warning('Marca del sistema', 'El favicon excede 2MB.');
      input.value = '';
      return;
    }

    this.brandingUploadingFavicon = true;
    this.brandingService.uploadFavicon(file).subscribe({
      next: (resp) => {
        this.brandingUploadingFavicon = false;
        if (!resp?.success) {
          this.toast.warning('Marca del sistema', resp?.message || 'No fue posible cargar el favicon.');
          return;
        }
        this.brandingFaviconFileName = resp.fileName;
        this.brandingFaviconUrl = resp.faviconUrl ?? null;
        this.toast.success('Marca del sistema', resp.message || 'Favicon cargado correctamente.');
      },
      error: (err) => {
        this.brandingUploadingFavicon = false;
        this.toast.error('Marca del sistema', err?.error?.detail ?? err?.error?.message ?? 'Error cargando favicon.');
      }
    });
  }

  saveBrandingConfig(): void {
    const sistema = (this.brandingSistema ?? '').trim();
    const nombreSistema = (this.brandingNombreSistema ?? '').trim();

    if (!sistema) {
      this.toast.warning('Marca del sistema', 'El campo Sistema es obligatorio.');
      return;
    }
    if (sistema.length > 10) {
      this.toast.warning('Marca del sistema', 'El campo Sistema solo permite hasta 10 caracteres.');
      return;
    }
    if (!nombreSistema) {
      this.toast.warning('Marca del sistema', 'El campo Nombre del sistema es obligatorio.');
      return;
    }
    if (nombreSistema.length > 50) {
      this.toast.warning('Marca del sistema', 'Nombre del sistema solo permite hasta 50 caracteres.');
      return;
    }

    this.brandingSaving = true;
    this.brandingService.saveConfig({
      sistema,
      nombreSistema,
      logoFileName: this.brandingLogoFileName,
      faviconFileName: this.brandingFaviconFileName
    }).subscribe({
      next: (resp) => {
        this.brandingSaving = false;
        if (!resp?.success) {
          this.toast.warning('Marca del sistema', resp?.message || 'No fue posible guardar la configuración.');
          return;
        }
        this.toast.success('Marca del sistema', resp.message || 'Configuración guardada correctamente.');
        this.loadBrandingConfig();
      },
      error: (err) => {
        this.brandingSaving = false;
        this.toast.error('Marca del sistema', err?.error?.detail ?? err?.error?.message ?? 'Error guardando configuración.');
      }
    });
  }
}


