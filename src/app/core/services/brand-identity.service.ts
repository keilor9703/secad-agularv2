import { Injectable, signal } from '@angular/core';

import {
  BrandingService,
  DEFAULT_MENU_BRAND_PREFERENCES,
  MenuBrandLayout,
  MenuBrandTextAlign,
  MenuBrandTextLayout,
  MenuBrandTextOrder,
  MenuLogoPosition,
} from './branding.service';

export interface BrandIdentity {
  readonly institutionName: string;
  readonly systemName: string;
  readonly shortName: string;
  readonly logoUrl: string;
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

const DEFAULT_IDENTITY: BrandIdentity = {
  institutionName: 'Policía Nacional de Colombia',
  systemName: 'OFTIC',
  shortName: 'OFTIC',
  logoUrl: '/imagenes/oftic-logo-app.png',
  ...DEFAULT_MENU_BRAND_PREFERENCES,
};

/**
 * Estado compartido de identidad visual.
 *
 * Sidebar y breadcrumb consumen la misma señal para evitar solicitudes repetidas
 * y mantener sincronizados logo y nombre institucional.
 */
@Injectable({ providedIn: 'root' })
export class BrandIdentityService {
  private readonly identityState = signal<BrandIdentity>(DEFAULT_IDENTITY);
  private loaded = false;

  readonly identity = this.identityState.asReadonly();

  constructor(private readonly brandingService: BrandingService) {}

  load(forceRefresh = false): void {
    if (this.loaded && !forceRefresh) {
      return;
    }

    this.loaded = true;
    this.brandingService.getPublicConfig().subscribe({
      next: (config) => {
        const systemName = this.firstText(
          config?.nombreSistema,
          config?.systemName,
          config?.sistema,
        );
        const shortName = this.firstText(config?.sistema, config?.systemName);
        const logoUrl = (config?.logoUrl ?? '').trim();

        this.identityState.set({
          institutionName:
            this.firstText(config?.nombreInstitucion) || DEFAULT_IDENTITY.institutionName,
          systemName: systemName || DEFAULT_IDENTITY.systemName,
          shortName: shortName || DEFAULT_IDENTITY.shortName,
          logoUrl: logoUrl || DEFAULT_IDENTITY.logoUrl,
          menuShowLogo: config?.menuShowLogo ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowLogo,
          menuShowInstitutionName:
            config?.menuShowInstitutionName ??
            DEFAULT_MENU_BRAND_PREFERENCES.menuShowInstitutionName,
          menuShowSystemName:
            config?.menuShowSystemName ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowSystemName,
          menuTextSizePx: config?.menuTextSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx,
          menuShowAcronym:
            config?.menuShowAcronym ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowAcronym,
          menuBrandLayout:
            config?.menuBrandLayout ?? DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
          menuLogoPosition:
            config?.menuLogoPosition ?? DEFAULT_MENU_BRAND_PREFERENCES.menuLogoPosition,
          menuTextLayout: config?.menuTextLayout ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextLayout,
          menuBrandTextOrder:
            config?.menuBrandTextOrder ?? DEFAULT_MENU_BRAND_PREFERENCES.menuBrandTextOrder,
          menuTextAlign: config?.menuTextAlign ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextAlign,
          menuLogoSizePx: config?.menuLogoSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuLogoSizePx,
          menuInstitutionTextSizePx:
            config?.menuInstitutionTextSizePx ??
            DEFAULT_MENU_BRAND_PREFERENCES.menuInstitutionTextSizePx,
          menuSystemTextSizePx:
            config?.menuSystemTextSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuSystemTextSizePx,
          menuAcronymTextSizePx:
            config?.menuAcronymTextSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuAcronymTextSizePx,
        });
      },
      error: () => {
        if (!forceRefresh) {
          this.identityState.set(DEFAULT_IDENTITY);
        }
      },
    });
  }

  /**
   * Recarga la identidad después de guardar Configuración del sistema.
   */
  refresh(): void {
    this.load(true);
  }

  private firstText(...values: Array<string | null | undefined>): string {
    return values.map((value) => (value ?? '').trim()).find(Boolean) ?? '';
  }
}
