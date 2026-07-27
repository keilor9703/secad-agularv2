import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { UsuarioDeleteModalComponent } from '../../components/usuario-delete-modal/usuario-delete-modal.component';
import { UsuarioFormComponent } from '../../components/usuario-form/usuario-form.component';

import { UsuariosTableComponent } from '../../components/usuarios-table/usuarios-table.component';
import {
  NewRoleForm,
  RawAssignedRole,
  RolEstado,
  UserProfile,
  UserRole,
} from '../../interfaces/usuario-admin-view.interface';
import {
  DtoRolCatalogo,
  UsuarioAdminService,
  UsuarioListadoItem,
} from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    CommonModule,
    UsuarioDeleteModalComponent,
    UsuarioFormComponent,
    UsuariosTableComponent,
  ],
  templateUrl: './usuarios-page.component.html',
  styleUrls: ['./usuarios-page.component.scss'],
})
export class UsuariosPageComponent implements OnInit, OnDestroy {
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  public readonly superAdministradorRolId = 1;
  private canAssignSuperAdministrador = false;

  minimized = false;
  visible = true;
  loading = false;
  savingRole = false;
  deletingRoleId: number | null = null;
  deletingUser = false;
  loadingListado = false;
  showDeleteUserModal = false;
  deletingTarget: UsuarioListadoItem | null = null;
  searchNombreListado = '';
  private searchNombreTimeout: ReturnType<typeof setTimeout> | null = null;
  readonly minSearchChars = 6;
  pageSize = 5;
  currentPage = 1;
  isSearchMode = false;
  searchIdentification = '';
  user: UserProfile | null = null;
  usuariosListado: UsuarioListadoItem[] = [];
  rolesCatalogo: DtoRolCatalogo[] = [];

  ngOnInit(): void {
    this.canAssignSuperAdministrador = this.authService.isCurrentUserSuperAdmin();
    this.cargarListadoUsuarios();
  }

  ngOnDestroy(): void {
    if (this.searchNombreTimeout) {
      clearTimeout(this.searchNombreTimeout);
    }
  }

  toggleMinimize(): void {
    this.minimized = !this.minimized;
  }

  closePanel(): void {
    this.visible = false;
    this.router.navigate(['/home']);
  }

  prepararNuevoUsuario(): void {
    this.user = null;
    this.searchIdentification = '';
    this.rolesCatalogo = [];
  }

  consultarUsuario(documentoRecibido?: string): void {
    const documento = (documentoRecibido ?? this.searchIdentification).trim();

    if (!documento) {
      this.toast.warning('Documento requerido', 'Digite una identificación para consultar.');
      return;
    }

    this.searchIdentification = documento;
    this.loading = true;
    this.toast.info('Consulta', 'Buscando información empresarial...');

    this.usuarioAdminService.consultarUsuarioPorIdentificacion(documento).subscribe({
      next: (resp) => {
        const funcionario = resp.funcionario ?? {};
        const nombres = (funcionario.nombres ?? '').trim();
        const apellidos = (funcionario.apellidos ?? '').trim();
        const nombreCompleto = `${nombres} ${apellidos}`.trim() || 'SIN NOMBRE';

        this.user = {
          identificacion: (funcionario.identificacion ?? documento).trim(),
          nombres,
          apellidos,
          grado: (funcionario.nombreGrado ?? funcionario.cargo ?? '').trim(),
          nombreCompleto,
          usuarioEmpresarial: (funcionario.usuario ?? '').trim(),
          email: (funcionario.correo ?? '').trim(),
          telefono: (funcionario.celular ?? '').trim(),
          situacionLaboral: (funcionario.situacionLaboral ?? '').trim(),
          unidad: (funcionario.dependencia ?? '').trim(),
          unidadFisica: (funcionario.siglaFisica ?? funcionario.siglaLaborando ?? '').trim(),
          cargo: (funcionario.cargo ?? '').trim(),
          gradAlfabetico: (funcionario.gradAlfabetico ?? funcionario.nombreGrado ?? '').trim(),
          funcionarioCodigo: (funcionario.funcionarioCodigo ?? '').trim(),
          undeLaborandoCodigo: (funcionario.undeLaborandoCodigo ?? '').trim(),
          codigoCargo: (funcionario.codigoCargo ?? '').trim(),
          activo: funcionario.activo ?? true,
          ultimoIngreso: 'Sin dato',
          fotoUrl: resp.fotoBase64 ?? undefined,
          roles: (resp.rolesAsignados ?? []).map((rol) => this.mapAssignedRole(rol)),
        };

        this.rolesCatalogo = this.filtrarRolesCatalogo(resp.rolesCatalogo ?? []);
        this.loading = false;
        this.toast.success('Consulta exitosa', 'Se cargó la información del usuario.');
      },
      error: (err) => {
        this.loading = false;
        this.user = null;

        const errorResponse = err?.error;
        const errorMsg =
          errorResponse?.message ??
          (errorResponse?.success === false ? 'Operación fallida' : null) ??
          'No fue posible consultar el usuario.';

        this.toast.error('Consulta fallida', errorMsg);
      },
    });
  }

  guardarDatosUsuario(user: UserProfile): void {
    if (!user.identificacion?.trim()) {
      this.toast.warning(
        'Guardar datos',
        'La identificación está vacía; vuelve a consultar el usuario.',
      );
      return;
    }

    const username = (user.usuarioEmpresarial ?? '').trim();
    const funcionarioCodigo = Number((user.funcionarioCodigo ?? '').trim());
    const undeLaborandoCodigo = Number((user.undeLaborandoCodigo ?? '').trim());
    const codigoCargo = Number((user.codigoCargo ?? '').trim());

    if (!username) {
      this.toast.warning(
        'Guardar datos',
        'El usuario empresarial está vacío. Consulta nuevamente el funcionario.',
      );
      return;
    }

    if (!Number.isFinite(funcionarioCodigo) || funcionarioCodigo <= 0) {
      this.toast.warning(
        'Guardar datos',
        'No se recibió código de funcionario válido. Vuelve a consultar la cédula.',
      );
      return;
    }

    if (!Number.isFinite(undeLaborandoCodigo) || undeLaborandoCodigo <= 0) {
      this.toast.warning(
        'Guardar datos',
        'No se recibió código de unidad laborando válido. Vuelve a consultar la cédula.',
      );
      return;
    }

    if (!Number.isFinite(codigoCargo) || codigoCargo <= 0) {
      this.toast.warning(
        'Guardar datos',
        'No se recibió código de cargo válido. Vuelve a consultar la cédula.',
      );
      return;
    }

    const payload = {
      username,
      identificacion: user.identificacion,
      nombres: user.nombres,
      apellidos: user.apellidos,
      email: user.email,
      gradAlfabetico: user.gradAlfabetico || user.grado,
      funcionario: String(funcionarioCodigo),
      undeLaborando: String(undeLaborandoCodigo),
      codigoCargo: String(codigoCargo),
      activo: user.activo,
    };

    this.loading = true;

    this.usuarioAdminService.guardarUsuario(payload).subscribe({
      next: (resp) => {
        this.loading = false;

        if (!resp?.success) {
          this.toast.warning('Guardar datos', resp?.message || 'No fue posible guardar.');
          return;
        }

        this.user = user;
        this.toast.success('Guardar datos', resp.message || 'Usuario guardado correctamente.');
        this.cargarListadoUsuarios();
      },
      error: (err) => {
        this.loading = false;

        const backendMessage =
          err?.error?.message ?? err?.error?.Message ?? err?.error?.detail ?? err?.message;

        this.toast.error(
          'Guardar datos',
          backendMessage ?? 'Se presentó un error guardando el usuario.',
        );
      },
    });
  }

  guardarRoles(roleForm: NewRoleForm): void {
    if (!this.user) {
      this.toast.warning('Roles', 'Consulta un usuario primero.');
      return;
    }

    if (!roleForm.rolId || roleForm.rolId <= 0) {
      this.toast.warning('Roles', 'Selecciona un rol.');
      return;
    }

    if (!roleForm.justificacion.trim()) {
      this.toast.warning('Roles', 'La justificación es obligatoria.');
      return;
    }

    if (!roleForm.fechaFin) {
      this.toast.warning('Roles', 'La fecha fin es obligatoria.');
      return;
    }

    this.savingRole = true;

    this.usuarioAdminService
      .asignarRol({
        usuarioId: 0,
        usuario: this.user.usuarioEmpresarial,
        identificacion: this.user.identificacion,
        rolId: roleForm.rolId,
        justificacion: roleForm.justificacion.trim(),
        fechaFin: roleForm.fechaFin,
        vigente: 1,
      })
      .subscribe({
        next: (resp) => {
          this.savingRole = false;

          if (!resp?.success) {
            this.toast.warning('Roles', resp?.message || 'No fue posible asignar el rol.');
            return;
          }

          this.toast.success('Roles', resp.message || 'Rol asignado correctamente.');
          this.consultarUsuario(this.user?.identificacion);
          this.cargarListadoUsuarios();
        },
        error: (err) => {
          this.savingRole = false;
          this.toast.error(
            'Roles',
            err?.error?.detail ?? err?.error?.message ?? 'Error asignando rol.',
          );
        },
      });
  }

  async eliminarRol(rol: UserRole): Promise<void> {
    if (!this.user) {
      this.toast.warning('Roles', 'Consulta un usuario primero.');
      return;
    }

    const confirmar = await this.alert.confirmDelete(
      'Retirar rol',
      `¿Deseas retirar el rol "${rol.nombre}" del usuario?`,
      'Sí, retirar',
    );

    if (!confirmar) {
      return;
    }

    this.deletingRoleId = rol.id;

    this.usuarioAdminService
      .eliminarRol(rol.id, this.user.usuarioEmpresarial, this.user.identificacion)
      .subscribe({
        next: (resp) => {
          this.deletingRoleId = null;

          if (!resp?.success) {
            this.toast.warning('Roles', resp?.message || 'No fue posible retirar el rol.');
            return;
          }

          this.toast.success('Roles', resp.message || 'Rol retirado correctamente.');
          this.consultarUsuario(this.user?.identificacion);
          this.cargarListadoUsuarios();
        },
        error: (err) => {
          this.deletingRoleId = null;
          this.toast.error(
            'Roles',
            err?.error?.detail ?? err?.error?.message ?? 'Error retirando rol.',
          );
        },
      });
  }

  cargarListadoUsuarios(): void {
    this.loadingListado = true;

    const term = (this.searchNombreListado ?? '').trim();
    const hasSearchTerm = term.length > 0;

    if (hasSearchTerm && term.length < this.minSearchChars) {
      this.isSearchMode = true;
      this.usuariosListado = [];
      this.currentPage = 1;
      this.loadingListado = false;
      return;
    }

    this.isSearchMode = hasSearchTerm;

    this.usuarioAdminService.getListadoUsuarios(this.isSearchMode ? term : '').subscribe({
      next: (items) => {
        this.usuariosListado = (items ?? []).map((item) => ({
          ...item,
          fechaFinRol: this.normalizeDateString(item?.fechaFinRol ?? ''),
        }));
        this.currentPage = 1;
        this.loadingListado = false;
      },
      error: () => {
        this.usuariosListado = [];
        this.currentPage = 1;
        this.loadingListado = false;
      },
    });
  }

  onSearchNombreListadoChange(term: string): void {
    this.searchNombreListado = term;

    if (this.searchNombreTimeout) {
      clearTimeout(this.searchNombreTimeout);
    }

    this.searchNombreTimeout = setTimeout(() => {
      this.cargarListadoUsuarios();
    }, 350);
  }

  get totalUsuariosListado(): number {
    return this.usuariosListado.length;
  }

  get totalPaginasListado(): number {
    return Math.max(1, Math.ceil(this.totalUsuariosListado / this.pageSize));
  }

  get usuariosListadoPaginado(): UsuarioListadoItem[] {
    const start = (this.currentPage - 1) * this.pageSize;
    return this.usuariosListado.slice(start, start + this.pageSize);
  }

  setPaginaListado(page: number): void {
    this.currentPage = Math.min(Math.max(page, 1), this.totalPaginasListado);
  }

  setTamanoPaginaListado(size: number): void {
    this.pageSize = Math.max(Number(size) || 5, 1);
    this.currentPage = 1;
  }

  editarDesdeListado(item: UsuarioListadoItem): void {
    const identificacion = String(item?.identificacion ?? '').trim();

    if (!identificacion) {
      this.toast.warning('Usuarios', 'El registro no tiene identificación para cargar edición.');
      return;
    }

    this.consultarUsuario(identificacion);
  }

  abrirModalEliminarUsuario(item: UsuarioListadoItem): void {
    this.deletingTarget = item;
    this.showDeleteUserModal = true;
  }

  cerrarModalEliminarUsuario(): void {
    if (this.deletingUser) {
      return;
    }

    this.showDeleteUserModal = false;
    this.deletingTarget = null;
  }

  confirmarEliminarUsuario(): void {
    if (!this.deletingTarget) {
      return;
    }

    this.deletingUser = true;

    this.usuarioAdminService.eliminarUsuario(this.deletingTarget.idUsuario).subscribe({
      next: (resp) => {
        this.deletingUser = false;

        if (!resp?.success) {
          this.toast.warning('Usuarios', resp?.message || 'No fue posible eliminar el usuario.');
          return;
        }

        this.toast.success('Usuarios', resp.message || 'Usuario eliminado correctamente.');
        this.cerrarModalEliminarUsuario();
        this.cargarListadoUsuarios();

        if (
          this.user?.identificacion?.trim() ===
          String(this.deletingTarget?.identificacion ?? '').trim()
        ) {
          this.user = null;
        }
      },
      error: (err) => {
        this.deletingUser = false;
        this.toast.error(
          'Usuarios',
          err?.error?.detail ?? err?.error?.message ?? 'Error eliminando usuario.',
        );
      },
    });
  }

  private mapAssignedRole(rol: RawAssignedRole): UserRole {
    const fechaExpiracion = this.normalizeDateString(rol?.fechaFin ?? rol?.fecha_fin ?? '');
    const estadoBase = String(rol?.estado ?? '')
      .trim()
      .toLowerCase();
    const estado: RolEstado = estadoBase.includes('venc') ? 'Vencido' : 'Vigente';

    return {
      id: Number(rol?.id ?? 0),
      nombre: String(rol?.rol ?? '').trim() || `Rol ${rol?.id}`,
      fechaExpiracion,
      estado,
      justificacion: String(rol?.justificacion ?? '').trim(),
    };
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

  private filtrarRolesCatalogo(roles: DtoRolCatalogo[]): DtoRolCatalogo[] {
    if (!this.canAssignSuperAdministrador) {
      return [];
    }

    return roles ?? [];
  }
}
