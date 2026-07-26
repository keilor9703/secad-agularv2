import { Injectable, signal } from '@angular/core';

import { BrandingService } from './branding.service';

export interface BrandIdentity {
  readonly systemName: string;
  readonly shortName: string;
  readonly logoUrl: string;
}

const DEFAULT_IDENTITY: BrandIdentity = {
  systemName: 'OFTIC',
  shortName: 'OFTIC',
  logoUrl: '/imagenes/oftic-logo-app.png',
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

  load(): void {
    if (this.loaded) {
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
        });
      },
      error: () => this.identityState.set(DEFAULT_IDENTITY),
    });
  }

  private firstText(...values: Array<string | null | undefined>): string {
    return values.map((value) => (value ?? '').trim()).find(Boolean) ?? '';
  }
}
