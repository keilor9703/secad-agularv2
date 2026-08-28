import {
  ChangeDetectionStrategy, Component, EventEmitter, Input, Output,
  computed, inject, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { UsuarioAdminService } from '../../../services/usuario-admin.service';
import { ToastService } from '../../../../../core/services/toast.service';
import { UiModalComponent } from '../../../../../shared/components/ui-modal/ui-modal.component';
import { UiInputComponent } from '../../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../../shared/components/ui-select/ui-select.component';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSelectOption } from '../../../../../shared/interfaces/ui-select-option.interface';

/** Mínimo de caracteres de la contraseña, igual que valida el backend. */
const MIN_PASSWORD = 8;

/**
 * Alta y edición de usuarios civiles / de otras entidades.
 *
 * El resto de la pantalla trabaja con usuarios institucionales, que se
 * consultan contra PIP por cédula y no tienen contraseña propia: su credencial
 * la valida OUD. Un usuario civil no existe en PIP —bomberos, tránsito, cruz
 * roja— así que se crea directo en ctr_usuarios con usuario y contraseña
 * propios. Por eso es un formulario aparte y no campos añadidos al otro.
 */
@Component({
  selector: 'app-usuario-civil-modal',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule,
    UiModalComponent, UiInputComponent, UiSelectComponent, UiButtonComponent,
  ],
  templateUrl: './usuario-civil-modal.component.html',
  styleUrls: ['./usuario-civil-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsuarioCivilModalComponent {
  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  @Input() set abierto(valor: boolean) {
    this._abierto = valor;
    if (valor) this.limpiar();
  }
  get abierto(): boolean { return this._abierto; }
  private _abierto = false;

  @Output() cerrar = new EventEmitter<void>();
  /** Se emite tras guardar, para que la pantalla recargue el listado. */
  @Output() guardado = new EventEmitter<void>();

  readonly guardando = signal(false);
  readonly verPassword = signal(false);
  readonly intentoGuardar = signal(false);

  readonly form = this.fb.nonNullable.group({
    username:       ['', [Validators.required]],
    password:       [''],
    identificacion: [''],
    nombres:        ['', [Validators.required]],
    apellidos:      ['', [Validators.required]],
    email:          [''],
    entidad:        [''],
    cargo:          [''],
    activo:         [true],
  });

  readonly opcionesEstado: UiSelectOption<boolean>[] = [
    { label: 'Activo',   value: true  },
    { label: 'Inactivo', value: false },
  ];

  // ── Errores por campo ────────────────────────────────────────────────────
  readonly errorUsername = computed(() =>
    this.intentoGuardar() && !this.form.controls.username.value.trim()
      ? 'El nombre de usuario es obligatorio.' : '');

  readonly errorNombres = computed(() =>
    this.intentoGuardar() && !this.form.controls.nombres.value.trim()
      ? 'Los nombres son obligatorios.' : '');

  readonly errorApellidos = computed(() =>
    this.intentoGuardar() && !this.form.controls.apellidos.value.trim()
      ? 'Los apellidos son obligatorios.' : '');

  readonly errorPassword = computed(() => {
    if (!this.intentoGuardar()) return '';
    const p = this.form.controls.password.value.trim();
    return p.length < MIN_PASSWORD
      ? `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`
      : '';
  });

  toggleVerPassword(): void {
    this.verPassword.update(v => !v);
  }

  private limpiar(): void {
    this.form.reset({
      username: '', password: '', identificacion: '', nombres: '',
      apellidos: '', email: '', entidad: '', cargo: '', activo: true,
    });
    this.verPassword.set(false);
    this.intentoGuardar.set(false);
  }

  onCerrar(): void {
    if (this.guardando()) return;
    this.cerrar.emit();
  }

  guardar(): void {
    this.intentoGuardar.set(true);
    if (this.errorUsername() || this.errorNombres() ||
        this.errorApellidos() || this.errorPassword()) return;

    const v = this.form.getRawValue();
    this.guardando.set(true);

    this.usuarioAdminService.createCivilUsuario({
      username:       v.username.trim(),
      password:       v.password.trim(),
      // Los opcionales van como undefined y no como cadena vacía: el backend
      // distingue "no lo mandes" de "guárdalo en blanco".
      identificacion: v.identificacion.trim() || undefined,
      nombres:        v.nombres.trim(),
      apellidos:      v.apellidos.trim(),
      email:          v.email.trim() || undefined,
      entidad:        v.entidad.trim() || undefined,
      cargo:          v.cargo.trim() || undefined,
      activo:         v.activo,
    }).subscribe({
      next: resp => {
        this.guardando.set(false);
        if (!resp?.success) {
          this.toast.warning('Usuario civil', resp?.message || 'No fue posible guardar.');
          return;
        }
        this.toast.success('Usuario civil', resp.message || 'Usuario civil creado correctamente.');
        this.guardado.emit();
        this.cerrar.emit();
      },
      error: err => {
        this.guardando.set(false);
        this.toast.error(
          'Usuario civil',
          err?.error?.message ?? err?.error?.detail ?? 'Se presentó un error guardando el usuario civil.',
        );
      },
    });
  }
}
