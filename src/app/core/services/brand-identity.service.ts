import { Injectable, signal } from '@angular/core';

import {
  BrandingService,
  DEFAULT_MENU_BRAND_PREFERENCES,
  MenuBrandLayout,
} from './branding.service';

export interface BrandIdentity {
  readonly systemName: string;
  readonly shortName: string;
  readonly logoUrl: string;
  readonly menuTextSizePx: number;
  readonly menuShowAcronym: boolean;
  readonly menuBrandLayout: MenuBrandLayout;
}

const DEFAULT_IDENTITY: BrandIdentity = {
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
          systemName: systemName || DEFAULT_IDENTITY.systemName,
          shortName: shortName || DEFAULT_IDENTITY.shortName,
          logoUrl: logoUrl || DEFAULT_IDENTITY.logoUrl,
          menuTextSizePx: config?.menuTextSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx,
          menuShowAcronym:
            config?.menuShowAcronym ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowAcronym,
          menuBrandLayout:
            config?.menuBrandLayout ?? DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
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
