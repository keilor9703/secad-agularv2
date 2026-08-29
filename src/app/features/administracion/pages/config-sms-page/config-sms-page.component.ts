import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ConfigSmsService,
  DtoConfigSms,
  ProveedorSms,
} from '../../services/config-sms.service';
import { ToastService } from '../../../../core/services/toast.service';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

interface ProveedorInfo {
  readonly value: ProveedorSms;
  readonly label: string;
  /** Se usa como placeholder cuando el campo URL queda vacío. */
  readonly baseUrlPorDefecto: string;
  /** Infobip permite fijar el remitente; Inalambria lo toma de la cuenta. */
  readonly usaSender: boolean;
}

const PROVEEDORES: readonly ProveedorInfo[] = [
  { value: 'INFOBIP', label: 'Infobip', baseUrlPorDefecto: '', usaSender: true },
  {
    value: 'INALAMBRIA_EXPRESS',
    label: 'Inalambria Express',
    baseUrlPorDefecto: 'https://api.inalambria.express/v1',
    usaSender: false,
  },
];

@Component({
  selector: 'app-config-sms-page',
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './config-sms-page.component.html',
  styleUrls: ['./config-sms-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfigSmsPageComponent implements OnInit {
  private readonly service = inject(ConfigSmsService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly probando = signal(false);

  readonly config = signal<DtoConfigSms | null>(null);
  readonly telefonoPrueba = signal('');

  readonly form = this.fb.nonNullable.group({
    proveedor: ['INFOBIP' as ProveedorSms, [Validators.required]],
    baseUrl: [''],
    apiKey: [''],
    sender: [''],
  });

  /**
   * El formulario es la fuente del proveedor elegido, y su valor cambia sin
   * pasar por una señal: se replica en una para que los campos que dependen del
   * proveedor (sender, placeholder de la URL) se repinten con OnPush.
   */
  private readonly proveedorActual = signal<ProveedorSms>('INFOBIP');

  readonly opcionesProveedor: UiSelectOption<ProveedorSms>[] = PROVEEDORES.map((p) => ({
    label: p.label,
    value: p.value,
  }));

  readonly proveedorSeleccionado = computed(
    () => PROVEEDORES.find((p) => p.value === this.proveedorActual()) ?? PROVEEDORES[0],
  );

  readonly placeholderUrl = computed(
    () => this.proveedorSeleccionado().baseUrlPorDefecto || 'Host asignado por el proveedor',
  );

  /** Nota bajo el campo API Key: qué pasa si se deja vacío. */
  readonly pistaApiKey = computed(() => {
    const c = this.config();
    return c?.tieneApiKey
      ? `Actual: ${c.apiKeyMascara ?? '••••'} — deje el campo vacío para conservarla.`
      : 'Todavía no hay ninguna API Key guardada.';
  });

  readonly ultimaModificacion = computed(() => {
    const c = this.config();
    if (!c?.fechaModifica) {
      return '';
    }
    const fecha = new Date(c.fechaModifica);
    const cuando = Number.isNaN(fecha.getTime()) ? c.fechaModifica : fecha.toLocaleString('es-CO');
    return c.usuarioModifica ? `${cuando} · por ${c.usuarioModifica}` : cuando;
  });

  constructor() {
    this.form.controls.proveedor.valueChanges.subscribe((v) => this.proveedorActual.set(v));
  }

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading.set(true);
    this.service.get().subscribe({
      next: (r) => {
        this.config.set(r.data);
        this.form.reset({
          proveedor: r.data.proveedor,
          baseUrl: r.data.baseUrl ?? '',
          // La API Key nunca vuelve del backend en claro, solo enmascarada.
          apiKey: '',
          sender: r.data.sender ?? '',
        });
        this.proveedorActual.set(r.data.proveedor);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.toast.error('Proveedor SMS', 'No se pudo cargar la configuración.');
      },
    });
  }

  guardar(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.saving.set(true);
    this.service
      .actualizar({
        proveedor: v.proveedor,
        baseUrl: v.baseUrl.trim() || null,
        apiKey: v.apiKey.trim() || null,
        sender: v.sender.trim() || null,
      })
      .subscribe({
        next: (resp) => {
          this.saving.set(false);
          if (!resp.success) {
            this.toast.warning('Proveedor SMS', resp.message);
            return;
          }
          this.toast.success('Proveedor SMS', resp.message);
          this.cargar();
        },
        error: (err) => {
          this.saving.set(false);
          this.toast.error('Proveedor SMS', err?.error?.message ?? 'Error al guardar.');
        },
      });
  }

  probarEnvio(): void {
    const numero = this.telefonoPrueba().trim();
    if (!numero) {
      this.toast.warning('Proveedor SMS', 'Escriba un número de teléfono para la prueba.');
      return;
    }

    this.probando.set(true);
    this.service.probar(numero).subscribe({
      next: (resp) => {
        this.probando.set(false);
        if (resp.success) {
          this.toast.success('Proveedor SMS', resp.message);
        } else {
          this.toast.warning('Proveedor SMS', resp.message);
        }
      },
      error: (err) => {
        this.probando.set(false);
        this.toast.error('Proveedor SMS', err?.error?.message ?? 'Error al enviar el SMS de prueba.');
      },
    });
  }
}
