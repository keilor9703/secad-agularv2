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
import { finalize, map } from 'rxjs';

import { BrandIdentityService } from '../../../../../core/services/brand-identity.service';
import {
  BrandingService,
  DEFAULT_LOGIN_BRAND_PREFERENCES,
  DEFAULT_MENU_BRAND_PREFERENCES,
  LoginBrandTextAlign,
  LoginBrandTextLayout,
  LoginBrandTextOrder,
  LoginLogoPosition,
  MenuBrandLayout,
  MenuBrandTextAlign,
  MenuBrandTextLayout,
  MenuBrandTextOrder,
  MenuLogoPosition,
} from '../../../../../core/services/branding.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiFileUploadComponent } from '../../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiPanelHeaderComponent } from '../../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';
import { getApiErrorMessage } from '../../../../../shared/utils/api-error-message.util';
import { getFormErrorMessage } from '../../../../../shared/utils/form-error.util';

interface BrandingConfigurationForm {
  sistema: FormControl<string>;
  nombreSistema: FormControl<string>;
  nombreInstitucion: FormControl<string>;
  menuShowLogo: FormControl<boolean>;
  menuShowInstitutionName: FormControl<boolean>;
  menuShowSystemName: FormControl<boolean>;
  menuTextSizePx: FormControl<number>;
  menuShowAcronym: FormControl<boolean>;
  menuBrandLayout: FormControl<MenuBrandLayout>;
  menuLogoPosition: FormControl<MenuLogoPosition>;
  menuTextLayout: FormControl<MenuBrandTextLayout>;
  menuBrandTextOrder: FormControl<MenuBrandTextOrder>;
  menuTextAlign: FormControl<MenuBrandTextAlign>;
  menuLogoSizePx: FormControl<number>;
  menuInstitutionTextSizePx: FormControl<number>;
  menuSystemTextSizePx: FormControl<number>;
  menuAcronymTextSizePx: FormControl<number>;
  loginShowLogo: FormControl<boolean>;
  loginShowInstitutionName: FormControl<boolean>;
  loginShowSystemName: FormControl<boolean>;
  loginShowAcronym: FormControl<boolean>;
  loginLogoPosition: FormControl<LoginLogoPosition>;
  loginTextLayout: FormControl<LoginBrandTextLayout>;
  loginBrandTextOrder: FormControl<LoginBrandTextOrder>;
  loginTextAlign: FormControl<LoginBrandTextAlign>;
  loginLogoSizePx: FormControl<number>;
  loginInstitutionTextSizePx: FormControl<number>;
  loginSystemTextSizePx: FormControl<number>;
  loginAcronymTextSizePx: FormControl<number>;
}

type LoginPreviewTextKind = 'institution' | 'system' | 'acronym';

interface LoginPreviewTextItem {
  readonly kind: LoginPreviewTextKind;
  readonly text: string;
  readonly sizePx: number;
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
    UiPanelHeaderComponent,
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
    nombreInstitucion: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.nombreInstitucion, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    menuShowLogo: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuShowLogo, {
      nonNullable: true,
    }),
    menuShowInstitutionName: new FormControl(
      DEFAULT_MENU_BRAND_PREFERENCES.menuShowInstitutionName,
      { nonNullable: true },
    ),
    menuShowSystemName: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuShowSystemName, {
      nonNullable: true,
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
    menuLogoPosition: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuLogoPosition, {
      nonNullable: true,
    }),
    menuTextLayout: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuTextLayout, {
      nonNullable: true,
    }),
    menuBrandTextOrder: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuBrandTextOrder, {
      nonNullable: true,
    }),
    menuTextAlign: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuTextAlign, {
      nonNullable: true,
    }),
    menuLogoSizePx: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuLogoSizePx, {
      nonNullable: true,
      validators: [Validators.min(36), Validators.max(52)],
    }),
    menuInstitutionTextSizePx: new FormControl(
      DEFAULT_MENU_BRAND_PREFERENCES.menuInstitutionTextSizePx,
      { nonNullable: true, validators: [Validators.min(9), Validators.max(14)] },
    ),
    menuSystemTextSizePx: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuSystemTextSizePx, {
      nonNullable: true,
      validators: [Validators.min(10), Validators.max(18)],
    }),
    menuAcronymTextSizePx: new FormControl(DEFAULT_MENU_BRAND_PREFERENCES.menuAcronymTextSizePx, {
      nonNullable: true,
      validators: [Validators.min(9), Validators.max(14)],
    }),
    loginShowLogo: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowLogo, {
      nonNullable: true,
    }),
    loginShowInstitutionName: new FormControl(
      DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowInstitutionName,
      { nonNullable: true },
    ),
    loginShowSystemName: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowSystemName, {
      nonNullable: true,
    }),
    loginShowAcronym: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowAcronym, {
      nonNullable: true,
    }),
    loginLogoPosition: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginLogoPosition, {
      nonNullable: true,
    }),
    loginTextLayout: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginTextLayout, {
      nonNullable: true,
    }),
    loginBrandTextOrder: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginBrandTextOrder, {
      nonNullable: true,
    }),
    loginTextAlign: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginTextAlign, {
      nonNullable: true,
    }),
    loginLogoSizePx: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginLogoSizePx, {
      nonNullable: true,
      validators: [Validators.min(56), Validators.max(160)],
    }),
    loginInstitutionTextSizePx: new FormControl(
      DEFAULT_LOGIN_BRAND_PREFERENCES.loginInstitutionTextSizePx,
      {
        nonNullable: true,
        validators: [Validators.min(10), Validators.max(24)],
      },
    ),
    loginSystemTextSizePx: new FormControl(DEFAULT_LOGIN_BRAND_PREFERENCES.loginSystemTextSizePx, {
      nonNullable: true,
      validators: [Validators.min(16), Validators.max(44)],
    }),
    loginAcronymTextSizePx: new FormControl(
      DEFAULT_LOGIN_BRAND_PREFERENCES.loginAcronymTextSizePx,
      {
        nonNullable: true,
        validators: [Validators.min(10), Validators.max(36)],
      },
    ),
  });

  readonly configured = computed(() => Boolean(this.logoUrl() || this.faviconUrl()));
  readonly statusLabel = computed(() => (this.configured() ? 'Marca configurada' : 'Sin recursos'));
  readonly previewValue = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );
  readonly menuPreviewTextItems = computed<LoginPreviewTextItem[]>(() => {
    const value = this.previewValue();
    const items: Record<LoginPreviewTextKind, LoginPreviewTextItem | null> = {
      institution: value.menuShowInstitutionName
        ? {
            kind: 'institution',
            text: value.nombreInstitucion || 'Nombre de la institución',
            sizePx: value.menuInstitutionTextSizePx,
          }
        : null,
      system: value.menuShowSystemName
        ? {
            kind: 'system',
            text: value.nombreSistema || 'Nombre del sistema',
            sizePx: value.menuSystemTextSizePx,
          }
        : null,
      acronym: value.menuShowAcronym
        ? {
            kind: 'acronym',
            text: value.sistema || 'SIGLA',
            sizePx: value.menuAcronymTextSizePx,
          }
        : null,
    };

    return value.menuBrandTextOrder
      .split('-')
      .map((key) => items[key as LoginPreviewTextKind])
      .filter((item): item is LoginPreviewTextItem => item !== null);
  });
  readonly loginPreviewTextItems = computed<LoginPreviewTextItem[]>(() => {
    const value = this.previewValue();
    const items: Record<LoginPreviewTextKind, LoginPreviewTextItem | null> = {
      institution: value.loginShowInstitutionName
        ? {
            kind: 'institution',
            text: value.nombreInstitucion || 'Nombre de la institución',
            sizePx: value.loginInstitutionTextSizePx,
          }
        : null,
      system: value.loginShowSystemName
        ? {
            kind: 'system',
            text: value.nombreSistema || 'Nombre del sistema',
            sizePx: value.loginSystemTextSizePx,
          }
        : null,
      acronym: value.loginShowAcronym
        ? {
            kind: 'acronym',
            text: value.sistema || 'SIGLA',
            sizePx: value.loginAcronymTextSizePx,
          }
        : null,
    };

    return value.loginBrandTextOrder
      .split('-')
      .map((key) => items[key as LoginPreviewTextKind])
      .filter((item): item is LoginPreviewTextItem => item !== null);
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
  readonly menuLogoPositionOptions: UiSelectOption<MenuLogoPosition>[] = [
    { value: 'left', label: 'Logo a la izquierda' },
    { value: 'right', label: 'Logo a la derecha' },
  ];
  readonly menuTextLayoutOptions: UiSelectOption<MenuBrandTextLayout>[] = [
    { value: 'stacked', label: 'Textos en columna' },
    { value: 'inline', label: 'Textos en línea' },
  ];
  readonly menuTextOrderOptions: UiSelectOption<MenuBrandTextOrder>[] = [
    { value: 'institution-system-acronym', label: 'Institución · sistema · sigla' },
    { value: 'institution-acronym-system', label: 'Institución · sigla · sistema' },
    { value: 'system-institution-acronym', label: 'Sistema · institución · sigla' },
    { value: 'system-acronym-institution', label: 'Sistema · sigla · institución' },
    { value: 'acronym-institution-system', label: 'Sigla · institución · sistema' },
    { value: 'acronym-system-institution', label: 'Sigla · sistema · institución' },
  ];
  readonly menuTextAlignOptions: UiSelectOption<MenuBrandTextAlign>[] = [
    { value: 'left', label: 'Alineación izquierda' },
    { value: 'center', label: 'Alineación centrada' },
    { value: 'right', label: 'Alineación derecha' },
  ];
  readonly menuLogoSizeOptions = this.buildSizeOptions(36, 52, 4);
  readonly menuInstitutionTextSizeOptions = this.buildSizeOptions(9, 14, 1);
  readonly menuSystemTextSizeOptions = this.buildSizeOptions(10, 18, 1);
  readonly menuAcronymTextSizeOptions = this.buildSizeOptions(9, 14, 1);
  readonly visibilityOptions: UiSelectOption<boolean>[] = [
    { value: true, label: 'Mostrar' },
    { value: false, label: 'Ocultar' },
  ];
  readonly loginLogoPositionOptions: UiSelectOption<LoginLogoPosition>[] = [
    { value: 'top', label: 'Logo arriba' },
    { value: 'left', label: 'Logo a la izquierda' },
    { value: 'right', label: 'Logo a la derecha' },
    { value: 'bottom', label: 'Logo abajo' },
  ];
  readonly loginTextLayoutOptions: UiSelectOption<LoginBrandTextLayout>[] = [
    { value: 'stacked', label: 'Textos en columna' },
    { value: 'inline', label: 'Textos en línea' },
  ];
  readonly loginTextOrderOptions: UiSelectOption<LoginBrandTextOrder>[] = [
    { value: 'institution-system-acronym', label: 'Institución · sistema · sigla' },
    { value: 'institution-acronym-system', label: 'Institución · sigla · sistema' },
    { value: 'system-institution-acronym', label: 'Sistema · institución · sigla' },
    { value: 'system-acronym-institution', label: 'Sistema · sigla · institución' },
    { value: 'acronym-institution-system', label: 'Sigla · institución · sistema' },
    { value: 'acronym-system-institution', label: 'Sigla · sistema · institución' },
  ];
  readonly loginTextAlignOptions: UiSelectOption<LoginBrandTextAlign>[] = [
    { value: 'left', label: 'Alineación izquierda' },
    { value: 'center', label: 'Alineación centrada' },
    { value: 'right', label: 'Alineación derecha' },
  ];
  readonly loginLogoSizeOptions: UiSelectOption<number>[] = [
    { value: 56, label: '56 px · Muy pequeño' },
    { value: 72, label: '72 px · Pequeño' },
    { value: 96, label: '96 px · Mediano' },
    { value: 112, label: '112 px · Institucional' },
    { value: 128, label: '128 px · Grande' },
    { value: 160, label: '160 px · Máximo' },
  ];
  readonly institutionTextSizeOptions = this.buildSizeOptions(10, 24, 2);
  readonly systemTextSizeOptions = this.buildSizeOptions(16, 44, 4);
  readonly acronymTextSizeOptions = this.buildSizeOptions(10, 36, 2);

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
            nombreInstitucion:
              configuration?.nombreInstitucion ?? DEFAULT_LOGIN_BRAND_PREFERENCES.nombreInstitucion,
            menuShowLogo:
              configuration?.menuShowLogo ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowLogo,
            menuShowInstitutionName:
              configuration?.menuShowInstitutionName ??
              DEFAULT_MENU_BRAND_PREFERENCES.menuShowInstitutionName,
            menuShowSystemName:
              configuration?.menuShowSystemName ??
              DEFAULT_MENU_BRAND_PREFERENCES.menuShowSystemName,
            menuTextSizePx:
              configuration?.menuTextSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextSizePx,
            menuShowAcronym:
              configuration?.menuShowAcronym ?? DEFAULT_MENU_BRAND_PREFERENCES.menuShowAcronym,
            menuBrandLayout:
              configuration?.menuBrandLayout ?? DEFAULT_MENU_BRAND_PREFERENCES.menuBrandLayout,
            menuLogoPosition:
              configuration?.menuLogoPosition ?? DEFAULT_MENU_BRAND_PREFERENCES.menuLogoPosition,
            menuTextLayout:
              configuration?.menuTextLayout ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextLayout,
            menuBrandTextOrder:
              configuration?.menuBrandTextOrder ??
              DEFAULT_MENU_BRAND_PREFERENCES.menuBrandTextOrder,
            menuTextAlign:
              configuration?.menuTextAlign ?? DEFAULT_MENU_BRAND_PREFERENCES.menuTextAlign,
            menuLogoSizePx:
              configuration?.menuLogoSizePx ?? DEFAULT_MENU_BRAND_PREFERENCES.menuLogoSizePx,
            menuInstitutionTextSizePx:
              configuration?.menuInstitutionTextSizePx ??
              DEFAULT_MENU_BRAND_PREFERENCES.menuInstitutionTextSizePx,
            menuSystemTextSizePx:
              configuration?.menuSystemTextSizePx ??
              configuration?.menuTextSizePx ??
              DEFAULT_MENU_BRAND_PREFERENCES.menuSystemTextSizePx,
            menuAcronymTextSizePx:
              configuration?.menuAcronymTextSizePx ??
              DEFAULT_MENU_BRAND_PREFERENCES.menuAcronymTextSizePx,
            loginShowLogo:
              configuration?.loginShowLogo ?? DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowLogo,
            loginShowInstitutionName:
              configuration?.loginShowInstitutionName ??
              DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowInstitutionName,
            loginShowSystemName:
              configuration?.loginShowSystemName ??
              DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowSystemName,
            loginShowAcronym:
              configuration?.loginShowAcronym ?? DEFAULT_LOGIN_BRAND_PREFERENCES.loginShowAcronym,
            loginLogoPosition:
              configuration?.loginLogoPosition ?? DEFAULT_LOGIN_BRAND_PREFERENCES.loginLogoPosition,
            loginTextLayout:
              configuration?.loginTextLayout ?? DEFAULT_LOGIN_BRAND_PREFERENCES.loginTextLayout,
            loginBrandTextOrder:
              configuration?.loginBrandTextOrder ??
              DEFAULT_LOGIN_BRAND_PREFERENCES.loginBrandTextOrder,
            loginTextAlign:
              configuration?.loginTextAlign ?? DEFAULT_LOGIN_BRAND_PREFERENCES.loginTextAlign,
            loginLogoSizePx:
              configuration?.loginLogoSizePx ?? DEFAULT_LOGIN_BRAND_PREFERENCES.loginLogoSizePx,
            loginInstitutionTextSizePx:
              configuration?.loginInstitutionTextSizePx ??
              DEFAULT_LOGIN_BRAND_PREFERENCES.loginInstitutionTextSizePx,
            loginSystemTextSizePx:
              configuration?.loginSystemTextSizePx ??
              DEFAULT_LOGIN_BRAND_PREFERENCES.loginSystemTextSizePx,
            loginAcronymTextSizePx:
              configuration?.loginAcronymTextSizePx ??
              DEFAULT_LOGIN_BRAND_PREFERENCES.loginAcronymTextSizePx,
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
    if (
      !value.menuShowLogo &&
      !value.menuShowInstitutionName &&
      !value.menuShowSystemName &&
      !value.menuShowAcronym
    ) {
      this.toast.warning(
        'Marca del sistema',
        'El menú debe mostrar al menos el logo, la institución, el nombre del sistema o la sigla.',
      );
      return;
    }

    if (
      !value.loginShowLogo &&
      !value.loginShowInstitutionName &&
      !value.loginShowSystemName &&
      !value.loginShowAcronym
    ) {
      this.toast.warning(
        'Marca del sistema',
        'El login debe mostrar al menos el logo, la institución, el nombre del sistema o la sigla.',
      );
      return;
    }

    this.saving.set(true);

    this.brandingService
      .saveConfig({
        sistema: value.sistema.trim(),
        nombreSistema: value.nombreSistema.trim(),
        logoFileName: this.logoFileName() || null,
        faviconFileName: this.faviconFileName() || null,
        menuShowLogo: value.menuShowLogo,
        menuShowInstitutionName: value.menuShowInstitutionName,
        menuShowSystemName: value.menuShowSystemName,
        menuTextSizePx: value.menuSystemTextSizePx,
        menuShowAcronym: value.menuShowAcronym,
        menuBrandLayout: this.toLegacyMenuLayout(value.menuTextLayout, value.menuBrandTextOrder),
        menuLogoPosition: value.menuLogoPosition,
        menuTextLayout: value.menuTextLayout,
        menuBrandTextOrder: value.menuBrandTextOrder,
        menuTextAlign: value.menuTextAlign,
        menuLogoSizePx: value.menuLogoSizePx,
        menuInstitutionTextSizePx: value.menuInstitutionTextSizePx,
        menuSystemTextSizePx: value.menuSystemTextSizePx,
        menuAcronymTextSizePx: value.menuAcronymTextSizePx,
        nombreInstitucion: value.nombreInstitucion.trim(),
        loginShowLogo: value.loginShowLogo,
        loginShowInstitutionName: value.loginShowInstitutionName,
        loginShowSystemName: value.loginShowSystemName,
        loginShowAcronym: value.loginShowAcronym,
        loginLogoPosition: value.loginLogoPosition,
        loginTextLayout: value.loginTextLayout,
        loginBrandTextOrder: value.loginBrandTextOrder,
        loginTextAlign: value.loginTextAlign,
        loginLogoSizePx: value.loginLogoSizePx,
        loginInstitutionTextSizePx: value.loginInstitutionTextSizePx,
        loginSystemTextSizePx: value.loginSystemTextSizePx,
        loginAcronymTextSizePx: value.loginAcronymTextSizePx,
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

  private buildSizeOptions(
    minimum: number,
    maximum: number,
    step: number,
  ): UiSelectOption<number>[] {
    const options: UiSelectOption<number>[] = [];
    for (let value = minimum; value <= maximum; value += step) {
      options.push({ value, label: `${value} px` });
    }
    return options;
  }

  private toLegacyMenuLayout(
    layout: MenuBrandTextLayout,
    order: MenuBrandTextOrder,
  ): MenuBrandLayout {
    const acronymFirst = order.startsWith('acronym-');
    if (layout === 'inline') {
      return acronymFirst ? 'inline-acronym-first' : 'inline-name-first';
    }

    return acronymFirst ? 'stacked-acronym-first' : 'stacked-name-first';
  }
}
