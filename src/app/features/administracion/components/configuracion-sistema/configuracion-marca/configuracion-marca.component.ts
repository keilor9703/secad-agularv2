import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { BrandIdentityService } from '../../../../../core/services/brand-identity.service';
import {
  BrandingService,
  DEFAULT_MENU_BRAND_PREFERENCES,
  MenuBrandLayout,
} from '../../../../../core/services/branding.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiFileUploadComponent } from '../../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { getApiErrorMessage } from '../../../../../shared/utils/api-error-message.util';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

interface BrandingConfigurationForm {
  sistema: FormControl<string>;
  nombreSistema: FormControl<string>;
  menuTextSizePx: FormControl<number>;
  menuShowAcronym: FormControl<boolean>;
  menuBrandLayout: FormControl<MenuBrandLayout>;
}

const LOGO_MAX_SIZE_BYTES = 5 * 1024 * 1024;
const FAVICON_MAX_SIZE_BYTES = 2 * 1024 * 1024;

@Component({
  selector: 'app-configuracion-marca',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiChipComponent,
    UiFileUploadComponent,
    UiInputComponent,
    UiSelectComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './configuracion-marca.component.html',
  styleUrl: './configuracion-marca.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionMarcaComponent implements OnInit {
  private readonly brandingService = inject(BrandingService);
  private readonly brandIdentity = inject(BrandIdentityService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly uploadingLogo = signal(false);
  readonly uploadingFavicon = signal(false);
  readonly logoFileName = signal('');
  readonly logoUrl = signal('');
  readonly faviconFileName = signal('');
  readonly faviconUrl = signal('');

  readonly form = new FormGroup<BrandingConfigurationForm>({
    sistema: new FormControl('SISGE', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10)],
    }),
    nombreSistema: new FormControl('SISGE', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(50)],
    }),
    menuTextSizePx: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx, {
      nonNullable: true,
    }),
    menuShowAcronym: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuShowAcronym, {
      nonNullable: true,
    }),
    menuBrandLayout: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout, {
      nonNullable: true,
    }),
  });

  readonly configured = computed(() => Boolean(this.logoUrl() || this.faviconUrl()));
  readonly statusLabel = computed(() => (this.configured() ? 'Marca configurada' : 'Sin recursos'));
  readonly previewValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  readonly acceptedLogoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];
  readonly acceptedLogoExtensions = ['jpg', 'jpeg', 'png', 'webp', 'svg'];
  readonly acceptedFaviconTypes = [
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/png',
    'image/webp',
    'image/svg+xml',
  ];
  readonly acceptedFaviconExtensions = ['ico', 'png', 'webp', 'svg'];
  readonly maximumLogoSize = LOGO_MAX_SIZE_BYTES;
  readonly maximumFaviconSize = FAVICON_MAX_SIZE_BYTES;
  readonly menuTextSizeOptions: UiSelectOption<number>[] = [
    { value: 10, label: '10 px · Muy compacto' },
    { value: 11, label: '11 px · Compacto' },
    { value: 12, label: '12 px · Reducido' },
    { value: 13, label: '13 px · Pequeño' },
    { value: 14, label: '14 px · Normal' },
    { value: 15, label: '15 px · Medio' },
    { value: 16, label: '16 px · Grande' },
    { value: 18, label: '18 px · Máximo' },
  ];
  readonly menuAcronymVisibilityOptions: UiSelectOption<boolean>[] = [
    { value: true, label: 'Mostrar sigla' },
    { value: false, label: 'Ocultar sigla' },
  ];
  readonly menuBrandLayoutOptions: UiSelectOption<MenuBrandLayout>[] = [
    { value: 'stacked-name-first', label: 'Nombre arriba · sigla abajo' },
    { value: 'stacked-acronym-first', label: 'Sigla arriba · nombre abajo' },
    { value: 'inline-name-first', label: 'Nombre primero · en línea' },
    { value: 'inline-acronym-first', label: 'Sigla primero · en línea' },
  ];

  ngOnInit(): void {
    this.loadConfiguration();
  }

  loadConfiguration(): void {
    this.loading.set(true);

    this.brandingService
      .getAdminConfig()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.loading.set(false)),
      )
      .subscribe({
        next: (configuration) => {
          this.form.setValue({
            sistema: (configuration?.sistema ?? 'SISGE').trim() || 'SISGE',
            nombreSistema:
              (configuration?.nombreSistema ?? configuration?.systemName ?? 'SISGE').trim() ||
              'SISGE',
            menuTextSizePx:
              configuration?.menuTextSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx,
            menuShowAcronym:
              configuration?.menuShowAcronym ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowAcronym,
            menuBrandLayout:
              configuration?.menuBrandLayout ?? DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
          });
          this.logoFileName.set(configuration?.logoFileName ?? '');
          this.logoUrl.set(configuration?.logoUrl ?? '');
          this.faviconFileName.set(configuration?.faviconFileName ?? '');
          this.faviconUrl.set(configuration?.faviconUrl ?? '');
          this.form.markAsPristine();
        },
        error: (error: unknown) => {
          this.toast.error(
            'Marca del sistema',
            getApiErrorMessage(error, 'No fue posible cargar la configuración de marca.'),
          );
        },
      });
  }

  onLogoSelected(file: File): void {
    this.uploadingLogo.set(true);

    this.brandingService
      .uploadLogo(file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploadingLogo.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toast.warning(
              'Marca del sistema',
              response.message || 'No fue posible cargar el logo.',
            );
            return;
          }

          this.logoFileName.set(response.fileName ?? '');
          this.logoUrl.set(response.logoUrl ?? '');
          this.toast.success(
            'Marca del sistema',
            response.message || 'Logo cargado correctamente.',
          );
        },
        error: (error: unknown) => {
          this.toast.error(
            'Marca del sistema',
            getApiErrorMessage(error, 'Ocurrió un error cargando el logo.'),
          );
        },
      });
  }

  onFaviconSelected(file: File): void {
    this.uploadingFavicon.set(true);

    this.brandingService
      .uploadFavicon(file)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploadingFavicon.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toast.warning(
              'Marca del sistema',
              response.message || 'No fue posible cargar el favicon.',
            );
            return;
          }

          this.faviconFileName.set(response.fileName ?? '');
          this.faviconUrl.set(response.faviconUrl ?? '');
          this.toast.success(
            'Marca del sistema',
            response.message || 'Favicon cargado correctamente.',
          );
        },
        error: (error: unknown) => {
          this.toast.error(
            'Marca del sistema',
            getApiErrorMessage(error, 'Ocurrió un error cargando el favicon.'),
          );
        },
      });
  }

  saveConfiguration(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warning('Marca del sistema', 'Revise los campos obligatorios.');
      return;
    }

    const value = this.form.getRawValue();
    this.saving.set(true);

    this.brandingService
      .saveConfig({
        sistema: value.sistema.trim(),
        nombreSistema: value.nombreSistema.trim(),
        logoFileName: this.logoFileName() || null,
        faviconFileName: this.faviconFileName() || null,
        menuTextSizePx: value.menuTextSizePx,
        menuShowAcronym: value.menuShowAcronym,
        menuBrandLayout: value.menuBrandLayout,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.saving.set(false)),
      )
      .subscribe({
        next: (response) => {
          if (!response.success) {
            this.toast.warning(
              'Marca del sistema',
              response.message || 'No fue posible guardar la configuración.',
            );
            return;
          }

          this.toast.success(
            'Marca del sistema',
            response.message || 'Configuración guardada correctamente.',
          );
          this.brandIdentity.refresh();
          this.loadConfiguration();
        },
        error: (error: unknown) => {
          this.toast.error(
            'Marca del sistema',
            getApiErrorMessage(error, 'Ocurrió un error guardando la configuración.'),
          );
        },
      });
  }

  resetForm(): void {
    this.loadConfiguration();
  }

  showFileValidationError(message: string): void {
    this.toast.warning('Marca del sistema', message);
  }

  error(controlName: keyof BrandingConfigurationForm): string {
    return getFormErrorMessage(this.form.controls[controlName]);
  }
}
