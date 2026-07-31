
import { Component, EventEmitter, Input, Output, ChangeDetectionStrategy } from '@angular/core';
import { environment } from '../../../../../environments/environment';
import { BannerItem } from '../../../../core/interfaces/banner.interface';

@Component({
  selector: 'app-home-banner-slider',
  standalone: true,
  imports: [],
  templateUrl: './home-banner-slider.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './home-banner-slider.component.scss',
})
export class HomeBannerSliderComponent {
  @Input() banners: BannerItem[] = [];
  @Input() currentBannerIndex = 0;
  @Input() activeAspectRatio = '3.78 / 1';

  @Output() previous = new EventEmitter<void>();
  @Output() next = new EventEmitter<void>();
  @Output() selectBanner = new EventEmitter<number>();
  @Output() bannerImageLoad = new EventEmitter<{ index: number; event: Event }>();

  getBannerImageUrl(item: BannerItem): string {
    const raw = (item.urlImagen ?? '').trim();
    if (!raw) {
      return '';
    }

    if (raw.startsWith('data:')) {
      return raw;
    }

    if (raw.startsWith('/api/Slider/Image/')) {
      return `${this.getMediaBaseUrl()}${raw}`;
    }

    const normalized = raw.replace(/\\/g, '/');
    const uploadPathIndex = normalized.toLowerCase().indexOf('/uploads/sliders/');
    if (uploadPathIndex >= 0) {
      const fileName = normalized.substring(uploadPathIndex).split('/').filter(Boolean).pop() ?? '';
      return fileName ? `${this.getApiBaseUrl()}/Slider/Image/${encodeURIComponent(fileName)}` : '';
    }

    if (normalized.toLowerCase().startsWith('uploads/sliders/')) {
      const fileName = normalized.split('/').filter(Boolean).pop() ?? '';
      return fileName ? `${this.getApiBaseUrl()}/Slider/Image/${encodeURIComponent(fileName)}` : '';
    }

    if (raw.startsWith('http://') || raw.startsWith('https://')) {
      return raw;
    }

    if (raw.startsWith('/')) {
      return `${this.getApiOrigin()}${raw}`;
    }

    if (/^[^/]+\.(jpg|jpeg|png|webp)$/i.test(normalized)) {
      return `${this.getApiBaseUrl()}/Slider/Image/${encodeURIComponent(normalized)}`;
    }

    return `/${raw}`;
  }

  onImageLoad(index: number, event: Event): void {
    this.bannerImageLoad.emit({ index, event });
  }

  private getMediaBaseUrl(): string {
    return (environment.mediaBaseUrl || environment.sliderMediaBaseUrl || '').trim().replace(/\/+$/, '');
  }

  private getApiBaseUrl(): string {
    const base = (environment.apiBaseUrl ?? '/api').trim().replace(/\/+$/, '');
    return base || '/api';
  }

  private getApiOrigin(): string {
    const base = this.getApiBaseUrl();
    if (!/^https?:\/\//i.test(base)) {
      return '';
    }

    try {
      const url = new URL(base);
      return `${url.protocol}//${url.host}`;
    } catch {
      return '';
    }
  }
}
