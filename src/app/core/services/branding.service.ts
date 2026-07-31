import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export type MenuBrandLayout =
  | 'stacked-name-first'
  | 'stacked-acronym-first'
  | 'inline-name-first'
  | 'inline-acronym-first';

export interface MenuBrandPreferences {
  readonly menuTextSizePx: number;
  readonly menuShowAcronym: boolean;
  readonly menuBrandLayout: MenuBrandLayout;
}

export const DEFAULT_MENU_BRAND_PREFERENCES: MenuBrandPreferences = {
  menuTextSizePx: 14,
  menuShowAcronym: true,
  menuBrandLayout: 'stacked-name-first',
};

export interface BrandingPublicConfig {
  sistema?: string;
  nombreSistema?: string;
  systemName: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
  menuTextSizePx?: number;
  menuShowAcronym?: boolean;
  menuBrandLayout?: MenuBrandLayout;
}

export interface BrandingAdminConfig extends BrandingPublicConfig {
  logoFileName?: string | null;
  faviconFileName?: string | null;
}

export interface BrandingSaveRequest {
  sistema: string;
  nombreSistema: string;
  logoFileName?: string | null;
  faviconFileName?: string | null;
  menuTextSizePx: number;
  menuShowAcronym: boolean;
  menuBrandLayout: MenuBrandLayout;
}

export interface BrandingUploadResponse {
  success: boolean;
  fileName: string;
  logoUrl: string;
  faviconUrl?: string;
  message: string;
  detail?: string;
}

@Injectable({ providedIn: 'root' })
export class BrandingService {
  private readonly baseUrl = `${environment.apiBaseUrl}/Branding`;
  private readonly menuPreferencesStorageKey = 'oftic.menu-brand-preferences';

  constructor(private readonly http: HttpClient) {}

  getPublicConfig(): Observable<BrandingPublicConfig> {
    return this.http
      .get<BrandingPublicConfig>(`${this.baseUrl}/config`)
      .pipe(map((configuration) => this.withMenuPreferences(configuration)));
  }

  getAdminConfig(): Observable<BrandingAdminConfig> {
    return this.http
      .get<BrandingAdminConfig>(`${this.baseUrl}/admin-config`)
      .pipe(map((configuration) => this.withMenuPreferences(configuration)));
  }

  uploadLogo(file: File): Observable<BrandingUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);
    return this.http.post<BrandingUploadResponse>(`${this.baseUrl}/upload-logo`, formData);
  }

  uploadFavicon(file: File): Observable<BrandingUploadResponse> {
    const formData = new FormData();
    formData.append('File', file);
    return this.http.post<BrandingUploadResponse>(`${this.baseUrl}/upload-favicon`, formData);
  }

  saveConfig(
    payload: BrandingSaveRequest,
  ): Observable<{ success: boolean; message: string; detail?: string }> {
    return this.http
      .post<{
        success: boolean;
        message: string;
        detail?: string;
      }>(`${this.baseUrl}/save-config`, payload)
      .pipe(
        tap((response) => {
          if (response.success) {
            this.storeMenuPreferences(payload);
          }
        }),
      );
  }

  /**
   * Combina la respuesta de la API con el respaldo local.
   *
   * El respaldo permite usar los controles con el backend actual. Cuando la API
   * incorpore estas propiedades, su valor tendrá prioridad automáticamente.
   */
  private withMenuPreferences<T extends BrandingPublicConfig>(configuration: T): T {
    const stored = this.readMenuPreferences();

    return {
      ...configuration,
      menuTextSizePx: this.normalizeTextSize(configuration.menuTextSizePx ?? stored.menuTextSizePx),
      menuShowAcronym:
        typeof configuration.menuShowAcronym === 'boolean'
          ? configuration.menuShowAcronym
          : stored.menuShowAcronym,
      menuBrandLayout: this.isMenuBrandLayout(configuration.menuBrandLayout)
        ? configuration.menuBrandLayout
        : stored.menuBrandLayout,
    };
  }

  private readMenuPreferences(): MenuBrandPreferences {
    try {
      if (typeof localStorage === 'undefined') {
        return DEFAULT_MENU_BRAND_PREFERENCES;
      }

      const rawValue = localStorage.getItem(this.menuPreferencesStorageKey);
      if (!rawValue) {
        return DEFAULT_MENU_BRAND_PREFERENCES;
      }

      const value = JSON.parse(rawValue) as Partial<MenuBrandPreferences>;

      return {
        menuTextSizePx: this.normalizeTextSize(value.menuTextSizePx),
        menuShowAcronym:
          typeof value.menuShowAcronym === 'boolean'
            ? value.menuShowAcronym
            : DEFAULT_MENU_BRAND_PREFERENCES.menuShowAcronym,
        menuBrandLayout: this.isMenuBrandLayout(value.menuBrandLayout)
          ? value.menuBrandLayout
          : DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
      };
    } catch {
      return DEFAULT_MENU_BRAND_PREFERENCES;
    }
  }

  private storeMenuPreferences(preferences: MenuBrandPreferences): void {
    try {
      if (typeof localStorage === 'undefined') {
        return;
      }

      localStorage.setItem(
        this.menuPreferencesStorageKey,
        JSON.stringify({
          menuTextSizePx: this.normalizeTextSize(preferences.menuTextSizePx),
          menuShowAcronym: preferences.menuShowAcronym,
          menuBrandLayout: this.isMenuBrandLayout(preferences.menuBrandLayout)
            ? preferences.menuBrandLayout
            : DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
        } satisfies MenuBrandPreferences),
      );
    } catch {
      // La configuración remota ya fue guardada; no se interrumpe por el storage local.
    }
  }

  private normalizeTextSize(value: number | undefined): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx;
    }

    return Math.min(18, Math.max(10, Math.round(value as number)));
  }

  private isMenuBrandLayout(value: unknown): value is MenuBrandLayout {
    return (
      value === 'stacked-name-first' ||
      value === 'stacked-acronym-first' ||
      value === 'inline-name-first' ||
      value === 'inline-acronym-first'
    );
  }
}
