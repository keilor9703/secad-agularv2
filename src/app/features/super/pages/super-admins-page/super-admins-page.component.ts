import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiToggleComponent } from '../../../../shared/components/ui-toggle/ui-toggle.component';
import { AlertService } from '../../../../shared/services/alert.service';
import { ToastService } from '../../../../core/services/toast.service';
import { getApiErrorMessage } from '../../../../shared/utils/api-error-message.util';
import { DtoSuperAdmin, SuperAdminsService } from '../../services/super-admins.service';

@Component({
  selector: 'app-super-admins-page',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiInputComponent,
    UiModalComponent,
    UiPageHeaderComponent,
    UiSpinnerComponent,
    UiToggleComponent,
  ],
  templateUrl: './super-admins-page.component.html',
  styleUrl: './super-admins-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SuperAdminsPageComponent implements OnInit {
  private readonly servicio   = inject(SuperAdminsService);
  private readonly toast      = inject(ToastService);
  private readonly alert      = inject(AlertService);
  private readonly auth       = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly lista     = signal<readonly DtoSuperAdmin[]>([]);
  readonly cargando  = signal(false);
  readonly guardando = signal(false);
  readonly quitando  = signal<string | null>(null);
  readonly modalAbierto = signal(false);
  readonly editando     = signal<DtoSuperAdmin | null>(null);

  readonly activos = computed(() => this.lista().filter((s) => s.activo).length);

  /** Para no ofrecerle al usuario quitarse a sí mismo sin darse cuenta. */
  readonly usuarioActual = (this.auth.getUsuario() || '').trim().toLowerCase();

  readonly form = new FormGroup({
    username:      new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(100)] }),
    nombre:        new FormControl('', { nonNullable: true, validators: [Validators.maxLength(200)] }),
    codDaneOrigen: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(10)] }),
    observacion:   new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] }),
    activo:        new FormControl(true, { nonNullable: true }),
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.servicio
      .listar()
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.cargando.set(false)))
      .subscribe({
        next: (items) => this.lista.set(items ?? []),
        error: (error: unknown) => {
          this.lista.set([]);
          this.toast.error(
            'Superadministradores',
            getApiErrorMessage(error, 'No fue posible consultar la lista.'),
          );
        },
      });
  }

  nuevo(): void {
    this.editando.set(null);
    this.form.reset({ username: '', nombre: '', codDaneOrigen: '', observacion: '', activo: true });
    this.form.controls.username.enable();
    this.modalAbierto.set(true);
  }

  editar(item: DtoSuperAdmin): void {
    this.editando.set(item);
    this.form.reset({
      username:      item.username,
      nombre:        item.nombre ?? '',
      codDaneOrigen: item.codDaneOrigen ?? '',
      observacion:   item.observacion ?? '',
      activo:        item.activo,
    });
    // El username es la clave: cambiarlo sería otra persona, no una edición.
    this.form.controls.username.disable();
    this.modalAbierto.set(true);
  }

  cerrarModal(): void {
    this.modalAbierto.set(false);
  }

  guardar(): void {
    if (this.form.invalid || this.guardando()) {
      this.form.markAllAsTouched();
      return;
    }

    const v = this.form.getRawValue();
    this.guardando.set(true);
    this.servicio
      .guardar({
        username:      v.username.trim(),
        nombre:        v.nombre.trim() || null,
        codDaneOrigen: v.codDaneOrigen.trim() || null,
        observacion:   v.observacion.trim() || null,
        activo:        v.activo,
      })
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.guardando.set(false)))
      .subscribe({
        next: (r) => {
          if (!r?.success) {
            this.toast.warning('Superadministradores', r?.message || 'No fue posible guardar.');
            return;
          }
          this.toast.success('Superadministradores', r.message || 'Guardado correctamente.');
          this.cerrarModal();
          this.cargar();
        },
        error: (error: unknown) =>
          this.toast.error(
            'Superadministradores',
            getApiErrorMessage(error, 'Se presentó un error guardando.'),
          ),
      });
  }

  async quitar(item: DtoSuperAdmin): Promise<void> {
    if (this.quitando()) return;

    const esUnoMismo = item.username === this.usuarioActual;
    const confirmado = await this.alert.confirm({
      title: 'Retirar superadministrador',
      message: esUnoMismo
        ? `«${item.username}» es su propio usuario. Si lo retira perderá el acceso a esta pantalla y a todo Super Admin en cuanto renueve su sesión. ¿Continuar?`
        : `¿Retirar a «${item.username}» de la lista de superadministradores del sistema?`,
      confirmText: 'Sí, retirar',
      cancelText: 'No, cancelar',
      icon: 'warning',
      intent: 'danger',
      focusCancel: true,
    });

    if (!confirmado) return;

    this.quitando.set(item.username);
    this.servicio
      .quitar(item.username)
      .pipe(takeUntilDestroyed(this.destroyRef), finalize(() => this.quitando.set(null)))
      .subscribe({
        next: (r) => {
          if (!r?.success) {
            this.toast.warning('Superadministradores', r?.message || 'No fue posible retirarlo.');
            return;
          }
          this.toast.success('Superadministradores', r.message || 'Retirado.');
          this.cargar();
        },
        error: (error: unknown) =>
          this.toast.error(
            'Superadministradores',
            getApiErrorMessage(error, 'Se presentó un error retirándolo.'),
          ),
      });
  }
}
