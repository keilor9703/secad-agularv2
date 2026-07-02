import { CommonModule } from '@angular/common';
import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';

import {
  NewRoleForm,
  TabKey,
  UserProfile,
  UserRole,
} from '../../interfaces/usuario-admin-view.interface';
import { DtoRolCatalogo } from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuario-form',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
  ],
  templateUrl: './usuario-form.component.html',
  styleUrls: ['./usuario-form.component.scss'],
})
export class UsuarioFormComponent implements OnChanges {
  private readonly fb = inject(FormBuilder);

  @Input() user: UserProfile | null = null;
  @Input() rolesCatalogo: DtoRolCatalogo[] = [];
  @Input() loading = false;
  @Input() savingRole = false;
  @Input() deletingRoleId: number | null = null;
  @Input() superAdministradorRolId = 1;

  @Output() consultar = new EventEmitter<string>();
  @Output() guardarDatos = new EventEmitter<UserProfile>();
  @Output() nuevoUsuario = new EventEmitter<void>();
  @Output() guardarRol = new EventEmitter<NewRoleForm>();
  @Output() eliminarRol = new EventEmitter<UserRole>();

  activeTab: TabKey = 'datos';
  showAddRoleForm = false;
  editingRole: UserRole | null = null;

  consultaForm = this.fb.group({
    identificacion: ['', [Validators.required, Validators.maxLength(20)]],
  });

  usuarioForm = this.fb.group({
    identificacion: ['', [Validators.required, Validators.maxLength(20)]],
    nombres: ['', [Validators.required, Validators.maxLength(100)]],
    apellidos: ['', [Validators.required, Validators.maxLength(100)]],
    grado: ['', [Validators.maxLength(100)]],
    nombreCompleto: ['', [Validators.required, Validators.maxLength(200)]],
    usuarioEmpresarial: ['', [Validators.required, Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email, Validators.maxLength(150)]],
    telefono: ['', [Validators.maxLength(30)]],
    situacionLaboral: ['', [Validators.maxLength(100)]],
    unidad: ['', [Validators.maxLength(200)]],
    unidadFisica: ['', [Validators.maxLength(200)]],
    cargo: ['', [Validators.maxLength(150)]],
    gradAlfabetico: ['', [Validators.maxLength(100)]],
    funcionarioCodigo: ['', [Validators.required, Validators.maxLength(30)]],
    undeLaborandoCodigo: ['', [Validators.required, Validators.maxLength(30)]],
    codigoCargo: ['', [Validators.required, Validators.maxLength(30)]],
    activo: [true, [Validators.required]],
    ultimoIngreso: ['Sin dato', [Validators.maxLength(100)]],
  });

  rolForm = this.fb.group({
    rolId: [null as number | null, [Validators.required]],
    fechaFin: ['', [Validators.required]],
    justificacion: ['', [Validators.required, Validators.maxLength(500)]],
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['user']) {
      this.cargarUsuario(this.user);
    }
  }

  get activeRolesCount(): number {
    return this.rolesVigentes.length;
  }

  get rolesVigentes(): UserRole[] {
    return this.user?.roles.filter((rol) => rol.estado === 'Vigente') ?? [];
  }

  setTab(tab: TabKey): void {
    this.activeTab = tab;
  }

  toggleEstadoUsuario(): void {
    const currentValue = this.usuarioForm.controls.activo.value ?? false;
    this.usuarioForm.controls.activo.setValue(!currentValue);
  }

  onConsultar(): void {
    if (this.consultaForm.invalid) {
      this.consultaForm.markAllAsTouched();
      return;
    }

    const documento = (this.consultaForm.controls.identificacion.getRawValue() ?? '').trim();
    this.consultar.emit(documento);
  }

  onNuevoUsuario(): void {
    this.consultaForm.reset({ identificacion: '' });
    this.usuarioForm.reset({ activo: true, ultimoIngreso: 'Sin dato' });
    this.cancelarNuevoRol();
    this.activeTab = 'datos';
    this.nuevoUsuario.emit();
  }

  agregarRol(): void {
    if (!this.user) {
      return;
    }

    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() + 6);

    this.rolForm.reset({
      rolId: null,
      justificacion: '',
      fechaFin: this.normalizeDateString(fecha.toISOString()),
    });

    this.editingRole = null;
    this.showAddRoleForm = true;
  }

  prepararEdicionRol(rol: UserRole): void {
    this.editingRole = rol;
    this.rolForm.reset({
      rolId: rol.id,
      justificacion: rol.justificacion,
      fechaFin: rol.fechaExpiracion,
    });
    this.rolForm.controls.rolId.disable();
    this.showAddRoleForm = true;
  }

  cancelarNuevoRol(): void {
    this.showAddRoleForm = false;
    this.editingRole = null;
    this.rolForm.controls.rolId.enable();
    this.rolForm.reset({
      rolId: null,
      justificacion: '',
      fechaFin: '',
    });
  }

  get rolOptions(): UiSelectOption<number>[] {
    return this.rolesCatalogo.map((role) => ({
      label: role.nombre || `Rol ${role.id}`,
      value: role.id,
    }));
  }

  onGuardarDatos(): void {
    if (this.usuarioForm.invalid || !this.user) {
      this.usuarioForm.markAllAsTouched();
      return;
    }

    const formValue = this.usuarioForm.getRawValue();

    this.guardarDatos.emit({
      ...this.user,
      identificacion: formValue.identificacion ?? '',
      nombres: formValue.nombres ?? '',
      apellidos: formValue.apellidos ?? '',
      grado: formValue.grado ?? '',
      nombreCompleto: formValue.nombreCompleto ?? '',
      usuarioEmpresarial: formValue.usuarioEmpresarial ?? '',
      email: formValue.email ?? '',
      telefono: formValue.telefono ?? '',
      situacionLaboral: formValue.situacionLaboral ?? '',
      unidad: formValue.unidad ?? '',
      unidadFisica: formValue.unidadFisica ?? '',
      cargo: formValue.cargo ?? '',
      gradAlfabetico: formValue.gradAlfabetico ?? '',
      funcionarioCodigo: formValue.funcionarioCodigo ?? '',
      undeLaborandoCodigo: formValue.undeLaborandoCodigo ?? '',
      codigoCargo: formValue.codigoCargo ?? '',
      activo: formValue.activo ?? true,
      ultimoIngreso: formValue.ultimoIngreso ?? 'Sin dato',
      fotoUrl: this.user.fotoUrl,
      roles: this.user.roles,
    });
  }

  onGuardarRol(): void {
    if (this.rolForm.invalid) {
      this.rolForm.markAllAsTouched();
      return;
    }

    const formValue = this.rolForm.getRawValue();

    this.guardarRol.emit({
      rolId: formValue.rolId ?? null,
      fechaFin: formValue.fechaFin ?? '',
      justificacion: formValue.justificacion ?? '',
    });
  }

  isInvalidField(formName: 'consulta' | 'usuario' | 'rol', fieldName: string): boolean {
    const field = this.getFormControl(formName, fieldName);
    return !!field && field.invalid && field.touched;
  }

  getFieldError(formName: 'consulta' | 'usuario' | 'rol', fieldName: string): string | null {
    const field = this.getFormControl(formName, fieldName);

    if (!field || !field.errors || !field.touched) {
      return null;
    }

    if (field.hasError('required')) {
      return 'Este campo es obligatorio.';
    }

    if (field.hasError('email')) {
      return 'Ingrese un correo válido.';
    }

    if (field.hasError('maxlength')) {
      return 'El texto supera la longitud permitida.';
    }

    return 'Campo inválido.';
  }

  private getFormControl(
    formName: 'consulta' | 'usuario' | 'rol',
    fieldName: string,
  ): AbstractControl | null {
    if (formName === 'consulta') {
      return this.consultaForm.get(fieldName);
    }

    if (formName === 'usuario') {
      return this.usuarioForm.get(fieldName);
    }

    return this.rolForm.get(fieldName);
  }

  private cargarUsuario(user: UserProfile | null): void {
    if (!user) {
      this.usuarioForm.reset({ activo: true, ultimoIngreso: 'Sin dato' });
      return;
    }

    this.consultaForm.patchValue({ identificacion: user.identificacion });
    this.usuarioForm.patchValue({
      identificacion: user.identificacion,
      nombres: user.nombres,
      apellidos: user.apellidos,
      grado: user.grado,
      nombreCompleto: user.nombreCompleto,
      usuarioEmpresarial: user.usuarioEmpresarial,
      email: user.email,
      telefono: user.telefono,
      situacionLaboral: user.situacionLaboral,
      unidad: user.unidad,
      unidadFisica: user.unidadFisica,
      cargo: user.cargo,
      gradAlfabetico: user.gradAlfabetico,
      funcionarioCodigo: user.funcionarioCodigo,
      undeLaborandoCodigo: user.undeLaborandoCodigo,
      codigoCargo: user.codigoCargo,
      activo: user.activo,
      ultimoIngreso: user.ultimoIngreso,
    });
  }

  private normalizeDateString(raw: string): string {
    const value = String(raw ?? '').trim();

    if (!value) {
      return '';
    }

    const onlyDate = value.includes('T') ? value.split('T')[0] : value;

    if (/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) {
      return onlyDate;
    }

    const parsed = new Date(value);

    if (Number.isNaN(parsed.getTime())) {
      return value;
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
