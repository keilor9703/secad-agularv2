import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';

export type MenuBrandLayout =
  | 'stacked-name-first'
  | 'stacked-acronym-first'
  | 'inline-name-first'
  | 'inline-acronym-first';

export type MenuLogoPosition = 'left' | 'right';
export type LoginLogoPosition = 'top' | 'left' | 'right' | 'bottom';
export type BrandTextLayout = 'stacked' | 'inline';
export type BrandTextAlign = 'left' | 'center' | 'right';
export type BrandTextOrder =
  | 'institution-system-acronym'
  | 'institution-acronym-system'
  | 'system-institution-acronym'
  | 'system-acronym-institution'
  | 'acronym-institution-system'
  | 'acronym-system-institution';
export type LoginBrandTextLayout = BrandTextLayout;
export type LoginBrandTextAlign = BrandTextAlign;
export type LoginBrandTextOrder = BrandTextOrder;
export type MenuBrandTextLayout = BrandTextLayout;
export type MenuBrandTextAlign = BrandTextAlign;
export type MenuBrandTextOrder = BrandTextOrder;

export interface MenuBrandPreferences {
  readonly menuShowLogo: boolean;
  readonly menuShowInstitutionName: boolean;
  readonly menuShowSystemName: boolean;
  readonly menuTextSizePx: number;
  readonly menuShowAcronym: boolean;
  readonly menuBrandLayout: MenuBrandLayout;
  readonly menuLogoPosition: MenuLogoPosition;
  readonly menuTextLayout: MenuBrandTextLayout;
  readonly menuBrandTextOrder: MenuBrandTextOrder;
  readonly menuTextAlign: MenuBrandTextAlign;
  readonly menuLogoSizePx: number;
  readonly menuInstitutionTextSizePx: number;
  readonly menuSystemTextSizePx: number;
  readonly menuAcronymTextSizePx: number;
}

export interface LoginBrandPreferences {
  readonly nombreInstitucion: string;
  readonly loginShowLogo: boolean;
  readonly loginShowInstitutionName: boolean;
  readonly loginShowSystemName: boolean;
  readonly loginShowAcronym: boolean;
  readonly loginLogoPosition: LoginLogoPosition;
  readonly loginTextLayout: LoginBrandTextLayout;
  readonly loginBrandTextOrder: LoginBrandTextOrder;
  readonly loginTextAlign: LoginBrandTextAlign;
  readonly loginLogoSizePx: number;
  readonly loginInstitutionTextSizePx: number;
  readonly loginSystemTextSizePx: number;
  readonly loginAcronymTextSizePx: number;
}

export const DEFAULT_MENU_BRAND_PREFERENCES: MenuBrandPreferences = {
  menuShowLogo: true,
  menuShowInstitutionName: true,
  menuShowSystemName: true,
  menuTextSizePx: 14,
  menuShowAcronym: true,
  menuBrandLayout: 'stacked-name-first',
  menuLogoPosition: 'left',
  menuTextLayout: 'stacked',
  menuBrandTextOrder: 'institution-system-acronym',
  menuTextAlign: 'left',
  menuLogoSizePx: 48,
  menuInstitutionTextSizePx: 9,
  menuSystemTextSizePx: 14,
  menuAcronymTextSizePx: 10,
};

export const DEFAULT_LOGIN_BRAND_PREFERENCES: LoginBrandPreferences = {
  nombreInstitucion: 'Policía Nacional de Colombia',
  loginShowLogo: true,
  loginShowInstitutionName: true,
  loginShowSystemName: true,
  loginShowAcronym: true,
  loginLogoPosition: 'top',
  loginTextLayout: 'stacked',
  loginBrandTextOrder: 'institution-system-acronym',
  loginTextAlign: 'center',
  loginLogoSizePx: 112,
  loginInstitutionTextSizePx: 13,
  loginSystemTextSizePx: 30,
  loginAcronymTextSizePx: 18,
};

export interface BrandingPublicConfig
  extends Partial<MenuBrandPreferences>, Partial<LoginBrandPreferences> {
  sistema?: string;
  nombreSistema?: string;
  systemName: string;
  logoUrl?: string | null;
  faviconUrl?: string | null;
}

export interface BrandingAdminConfig extends BrandingPublicConfig {
  logoFileName?: string | null;
  faviconFileName?: string | null;
}

export interface BrandingSaveRequest extends MenuBrandPreferences, LoginBrandPreferences {
  sistema: string;
  nombreSistema: string;
  logoFileName?: string | null;
  faviconFileName?: string | null;
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
  private readonly loginPreferencesStorageKey = 'oftic.login-brand-preferences-v1';

  constructor(private readonly http: HttpClient) {}

  getPublicConfig(): Observable<BrandingPublicConfig> {
    return this.http
      .get<BrandingPublicConfig>(`${this.baseUrl}/config`)
      .pipe(map((configuration) => this.withBrandPreferences(configuration)));
  }

  getAdminConfig(): Observable<BrandingAdminConfig> {
    return this.http
      .get<BrandingAdminConfig>(`${this.baseUrl}/admin-config`)
      .pipe(map((configuration) => this.withBrandPreferences(configuration)));
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
            this.storeLoginPreferences(payload);
          }
        }),
      );
  }

  /**
   * La respuesta remota tiene prioridad. El respaldo local permite activar los
   * nuevos controles antes de desplegar los campos equivalentes en el backend.
   */
  private withBrandPreferences<T extends BrandingPublicConfig>(configuration: T): T {
    const storedMenu = this.readMenuPreferences();
    const storedLogin = this.readLoginPreferences();
    const merged: T = {
      ...configuration,
      menuShowLogo: this.resolveBoolean(configuration.menuShowLogo, storedMenu.menuShowLogo),
      menuShowInstitutionName: this.resolveBoolean(
        configuration.menuShowInstitutionName,
        storedMenu.menuShowInstitutionName,
      ),
      menuShowSystemName: this.resolveBoolean(
        configuration.menuShowSystemName,
        storedMenu.menuShowSystemName,
      ),
      menuTextSizePx: this.normalizeInteger(
        configuration.menuTextSizePx,
        storedMenu.menuTextSizePx,
        10,
        18,
      ),
      menuShowAcronym: this.resolveBoolean(
        configuration.menuShowAcronym,
        storedMenu.menuShowAcronym,
      ),
      menuBrandLayout: this.isMenuBrandLayout(configuration.menuBrandLayout)
        ? configuration.menuBrandLayout
        : storedMenu.menuBrandLayout,
      menuLogoPosition: this.isMenuLogoPosition(configuration.menuLogoPosition)
        ? configuration.menuLogoPosition
        : storedMenu.menuLogoPosition,
      menuTextLayout: this.isLoginTextLayout(configuration.menuTextLayout)
        ? configuration.menuTextLayout
        : storedMenu.menuTextLayout,
      menuBrandTextOrder: this.isLoginTextOrder(configuration.menuBrandTextOrder)
        ? configuration.menuBrandTextOrder
        : storedMenu.menuBrandTextOrder,
      menuTextAlign: this.isLoginTextAlign(configuration.menuTextAlign)
        ? configuration.menuTextAlign
        : storedMenu.menuTextAlign,
      menuLogoSizePx: this.normalizeInteger(
        configuration.menuLogoSizePx,
        storedMenu.menuLogoSizePx,
        36,
        52,
      ),
      menuInstitutionTextSizePx: this.normalizeInteger(
        configuration.menuInstitutionTextSizePx,
        storedMenu.menuInstitutionTextSizePx,
        9,
        14,
      ),
      menuSystemTextSizePx: this.normalizeInteger(
        configuration.menuSystemTextSizePx,
        storedMenu.menuSystemTextSizePx,
        10,
        18,
      ),
      menuAcronymTextSizePx: this.normalizeInteger(
        configuration.menuAcronymTextSizePx,
        storedMenu.menuAcronymTextSizePx,
        9,
        14,
      ),
      nombreInstitucion:
        this.normalizeText(configuration.nombreInstitucion, 100) || storedLogin.nombreInstitucion,
      loginShowLogo: this.resolveBoolean(configuration.loginShowLogo, storedLogin.loginShowLogo),
      loginShowInstitutionName: this.resolveBoolean(
        configuration.loginShowInstitutionName,
        storedLogin.loginShowInstitutionName,
      ),
      loginShowSystemName: this.resolveBoolean(
        configuration.loginShowSystemName,
        storedLogin.loginShowSystemName,
      ),
      loginShowAcronym: this.resolveBoolean(
        configuration.loginShowAcronym,
        storedLogin.loginShowAcronym,
      ),
      loginLogoPosition: this.isLoginLogoPosition(configuration.loginLogoPosition)
        ? configuration.loginLogoPosition
        : storedLogin.loginLogoPosition,
      loginTextLayout: this.isLoginTextLayout(configuration.loginTextLayout)
        ? configuration.loginTextLayout
        : storedLogin.loginTextLayout,
      loginBrandTextOrder: this.isLoginTextOrder(configuration.loginBrandTextOrder)
        ? configuration.loginBrandTextOrder
        : storedLogin.loginBrandTextOrder,
      loginTextAlign: this.isLoginTextAlign(configuration.loginTextAlign)
        ? configuration.loginTextAlign
        : storedLogin.loginTextAlign,
      loginLogoSizePx: this.normalizeInteger(
        configuration.loginLogoSizePx,
        storedLogin.loginLogoSizePx,
        56,
        160,
      ),
      loginInstitutionTextSizePx: this.normalizeInteger(
        configuration.loginInstitutionTextSizePx,
        storedLogin.loginInstitutionTextSizePx,
        10,
        24,
      ),
      loginSystemTextSizePx: this.normalizeInteger(
        configuration.loginSystemTextSizePx,
        storedLogin.loginSystemTextSizePx,
        16,
        44,
      ),
      loginAcronymTextSizePx: this.normalizeInteger(
        configuration.loginAcronymTextSizePx,
        storedLogin.loginAcronymTextSizePx,
        10,
        36,
      ),
    };

    const safeMerged = this.hasVisibleMenuIdentity(merged)
      ? merged
      : { ...merged, menuShowSystemName: true };

    if (!this.hasVisibleLoginIdentity(safeMerged)) {
      return { ...safeMerged, loginShowSystemName: true };
    }

    return safeMerged;
  }

  private readMenuPreferences(): MenuBrandPreferences {
    const value = this.readStorage<Partial<MenuBrandPreferences>>(this.menuPreferencesStorageKey);
    const defaults = DEFAULT_MENU_BRAND_PREFERENCES;

    return {
      menuShowLogo: this.resolveBoolean(value?.menuShowLogo, defaults.menuShowLogo),
      menuShowInstitutionName: this.resolveBoolean(
        value?.menuShowInstitutionName,
        defaults.menuShowInstitutionName,
      ),
      menuShowSystemName: this.resolveBoolean(
        value?.menuShowSystemName,
        defaults.menuShowSystemName,
      ),
      menuTextSizePx: this.normalizeInteger(value?.menuTextSizePx, defaults.menuTextSizePx, 10, 18),
      menuShowAcronym: this.resolveBoolean(value?.menuShowAcronym, defaults.menuShowAcronym),
      menuBrandLayout: this.isMenuBrandLayout(value?.menuBrandLayout)
        ? value.menuBrandLayout
        : defaults.menuBrandLayout,
      menuLogoPosition: this.isMenuLogoPosition(value?.menuLogoPosition)
        ? value.menuLogoPosition
        : defaults.menuLogoPosition,
      menuTextLayout: this.isLoginTextLayout(value?.menuTextLayout)
        ? value.menuTextLayout
        : defaults.menuTextLayout,
      menuBrandTextOrder: this.isLoginTextOrder(value?.menuBrandTextOrder)
        ? value.menuBrandTextOrder
        : defaults.menuBrandTextOrder,
      menuTextAlign: this.isLoginTextAlign(value?.menuTextAlign)
        ? value.menuTextAlign
        : defaults.menuTextAlign,
      menuLogoSizePx: this.normalizeInteger(value?.menuLogoSizePx, defaults.menuLogoSizePx, 36, 52),
      menuInstitutionTextSizePx: this.normalizeInteger(
        value?.menuInstitutionTextSizePx,
        defaults.menuInstitutionTextSizePx,
        9,
        14,
      ),
      menuSystemTextSizePx: this.normalizeInteger(
        value?.menuSystemTextSizePx ?? value?.menuTextSizePx,
        defaults.menuSystemTextSizePx,
        10,
        18,
      ),
      menuAcronymTextSizePx: this.normalizeInteger(
        value?.menuAcronymTextSizePx,
        defaults.menuAcronymTextSizePx,
        9,
        14,
      ),
    };
  }

  private readLoginPreferences(): LoginBrandPreferences {
    const value = this.readStorage<Partial<LoginBrandPreferences>>(this.loginPreferencesStorageKey);
    const defaults = DEFAULT_LOGIN_BRAND_PREFERENCES;

    return {
      nombreInstitucion:
        this.normalizeText(value?.nombreInstitucion, 100) || defaults.nombreInstitucion,
      loginShowLogo: this.resolveBoolean(value?.loginShowLogo, defaults.loginShowLogo),
      loginShowInstitutionName: this.resolveBoolean(
        value?.loginShowInstitutionName,
        defaults.loginShowInstitutionName,
      ),
      loginShowSystemName: this.resolveBoolean(
        value?.loginShowSystemName,
        defaults.loginShowSystemName,
      ),
      loginShowAcronym: this.resolveBoolean(value?.loginShowAcronym, defaults.loginShowAcronym),
      loginLogoPosition: this.isLoginLogoPosition(value?.loginLogoPosition)
        ? value.loginLogoPosition
        : defaults.loginLogoPosition,
      loginTextLayout: this.isLoginTextLayout(value?.loginTextLayout)
        ? value.loginTextLayout
        : defaults.loginTextLayout,
      loginBrandTextOrder: this.isLoginTextOrder(value?.loginBrandTextOrder)
        ? value.loginBrandTextOrder
        : defaults.loginBrandTextOrder,
      loginTextAlign: this.isLoginTextAlign(value?.loginTextAlign)
        ? value.loginTextAlign
        : defaults.loginTextAlign,
      loginLogoSizePx: this.normalizeInteger(
        value?.loginLogoSizePx,
        defaults.loginLogoSizePx,
        56,
        160,
      ),
      loginInstitutionTextSizePx: this.normalizeInteger(
        value?.loginInstitutionTextSizePx,
        defaults.loginInstitutionTextSizePx,
        10,
        24,
      ),
      loginSystemTextSizePx: this.normalizeInteger(
        value?.loginSystemTextSizePx,
        defaults.loginSystemTextSizePx,
        16,
        44,
      ),
      loginAcronymTextSizePx: this.normalizeInteger(
        value?.loginAcronymTextSizePx,
        defaults.loginAcronymTextSizePx,
        10,
        36,
      ),
    };
  }

  private storeMenuPreferences(preferences: MenuBrandPreferences): void {
    this.writeStorage(this.menuPreferencesStorageKey, {
      menuShowLogo: preferences.menuShowLogo,
      menuShowInstitutionName: preferences.menuShowInstitutionName,
      menuShowSystemName: preferences.menuShowSystemName,
      menuTextSizePx: this.normalizeInteger(
        preferences.menuTextSizePx,
        DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx,
        10,
        18,
      ),
      menuShowAcronym: preferences.menuShowAcronym,
      menuBrandLayout: this.isMenuBrandLayout(preferences.menuBrandLayout)
        ? preferences.menuBrandLayout
        : DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
      menuLogoPosition: this.isMenuLogoPosition(preferences.menuLogoPosition)
        ? preferences.menuLogoPosition
        : DEFAULT_MENU_BRAND_PREFERENCES.menuLogoPosition,
      menuTextLayout: this.isLoginTextLayout(preferences.menuTextLayout)
        ? preferences.menuTextLayout
        : DEFAULT_MENU_BRAND_PREFERENCES.menuTextLayout,
      menuBrandTextOrder: this.isLoginTextOrder(preferences.menuBrandTextOrder)
        ? preferences.menuBrandTextOrder
        : DEFAULT_MENU_BRAND_PREFERENCES.menuBrandTextOrder,
      menuTextAlign: this.isLoginTextAlign(preferences.menuTextAlign)
        ? preferences.menuTextAlign
        : DEFAULT_MENU_BRAND_PREFERENCES.menuTextAlign,
      menuLogoSizePx: this.normalizeInteger(preferences.menuLogoSizePx, 48, 36, 52),
      menuInstitutionTextSizePx: this.normalizeInteger(
        preferences.menuInstitutionTextSizePx,
        9,
        9,
        14,
      ),
      menuSystemTextSizePx: this.normalizeInteger(preferences.menuSystemTextSizePx, 14, 10, 18),
      menuAcronymTextSizePx: this.normalizeInteger(preferences.menuAcronymTextSizePx, 10, 9, 14),
    } satisfies MenuBrandPreferences);
  }

  private storeLoginPreferences(preferences: LoginBrandPreferences): void {
    this.writeStorage(this.loginPreferencesStorageKey, {
      nombreInstitucion:
        this.normalizeText(preferences.nombreInstitucion, 100) ||
        DEFAULT_LOGIN_BRAND_PREFERENCES.nombreInstitucion,
      loginShowLogo: preferences.loginShowLogo,
      loginShowInstitutionName: preferences.loginShowInstitutionName,
      loginShowSystemName: preferences.loginShowSystemName,
      loginShowAcronym: preferences.loginShowAcronym,
      loginLogoPosition: preferences.loginLogoPosition,
      loginTextLayout: preferences.loginTextLayout,
      loginBrandTextOrder: preferences.loginBrandTextOrder,
      loginTextAlign: preferences.loginTextAlign,
      loginLogoSizePx: this.normalizeInteger(preferences.loginLogoSizePx, 112, 56, 160),
      loginInstitutionTextSizePx: this.normalizeInteger(
        preferences.loginInstitutionTextSizePx,
        13,
        10,
        24,
      ),
      loginSystemTextSizePx: this.normalizeInteger(preferences.loginSystemTextSizePx, 30, 16, 44),
      loginAcronymTextSizePx: this.normalizeInteger(preferences.loginAcronymTextSizePx, 18, 10, 36),
    } satisfies LoginBrandPreferences);
  }

  private readStorage<T>(key: string): T | null {
    try {
      if (typeof localStorage === 'undefined') {
        return null;
      }

      const rawValue = localStorage.getItem(key);
      return rawValue ? (JSON.parse(rawValue) as T) : null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: unknown): void {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch {
      // La configuración remota ya se guardó; localStorage no bloquea la operación.
    }
  }

  private hasVisibleLoginIdentity(configuration: Partial<LoginBrandPreferences>): boolean {
    return Boolean(
      configuration.loginShowLogo ||
      configuration.loginShowInstitutionName ||
      configuration.loginShowSystemName ||
      configuration.loginShowAcronym,
    );
  }

  private hasVisibleMenuIdentity(configuration: Partial<MenuBrandPreferences>): boolean {
    return Boolean(
      configuration.menuShowLogo ||
      configuration.menuShowInstitutionName ||
      configuration.menuShowSystemName ||
      configuration.menuShowAcronym,
    );
  }

  private resolveBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === 'boolean' ? value : fallback;
  }

  private normalizeInteger(
    value: number | undefined,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const source = Number.isFinite(value) ? Number(value) : fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(source)));
  }

  private normalizeText(value: unknown, maximumLength: number): string {
    return typeof value === 'string' ? value.trim().slice(0, maximumLength) : '';
  }

  private isMenuBrandLayout(value: unknown): value is MenuBrandLayout {
    return (
      value === 'stacked-name-first' ||
      value === 'stacked-acronym-first' ||
      value === 'inline-name-first' ||
      value === 'inline-acronym-first'
    );
  }

  private isMenuLogoPosition(value: unknown): value is MenuLogoPosition {
    return value === 'left' || value === 'right';
  }

  private isLoginLogoPosition(value: unknown): value is LoginLogoPosition {
    return value === 'top' || value === 'left' || value === 'right' || value === 'bottom';
  }

  private isLoginTextLayout(value: unknown): value is LoginBrandTextLayout {
    return value === 'stacked' || value === 'inline';
  }

  private isLoginTextAlign(value: unknown): value is LoginBrandTextAlign {
    return value === 'left' || value === 'center' || value === 'right';
  }

  private isLoginTextOrder(value: unknown): value is LoginBrandTextOrder {
    return (
      value === 'institution-system-acronym' ||
      value === 'institution-acronym-system' ||
      value === 'system-institution-acronym' ||
      value === 'system-acronym-institution' ||
      value === 'acronym-institution-system' ||
      value === 'acronym-system-institution'
    );
  }
}
