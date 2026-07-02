import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ToastService } from '../../../../core/services/toast.service';
import { DtoRolCatalogo, UsuarioAdminService, UsuarioListadoItem } from '../../services/usuario-admin.service';
import { AuthService } from '../../../../core/auth/auth.service';

type TabKey = 'datos' | 'roles';
type RolEstado = 'Vigente' | 'Vencido';

interface UserRole {
  id: number;
  nombre: string;
  fechaExpiracion: string;
  estado: RolEstado;
  justificacion: string;
}

interface NewRoleForm {
  rolId: number | null;
  justificacion: string;
  fechaFin: string;
}

interface UserProfile {
  identificacion: string;
  nombres: string;
  apellidos: string;
  grado: string;
  nombreCompleto: string;
  usuarioEmpresarial: string;
  email: string;
  telefono: string;
  situacionLaboral: string;
  unidad: string;
  unidadFisica: string;
  cargo: string;
  gradAlfabetico: string;
  funcionarioCodigo: string;
  undeLaborandoCodigo: string;
  codigoCargo: string;
  activo: boolean;
  ultimoIngreso: string;
  fotoUrl?: string;
  roles: UserRole[];
}

interface RawAssignedRole {
  id?: number;
  rol?: string | null;
  fechaFin?: string | null;
  fecha_fin?: string | null;
  estado?: string | null;
  justificacion?: string | null;
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './usuarios-page.component.html',
  styleUrls: ['./usuarios-page.component.scss']
})
export class UsuariosPageComponent implements OnInit, OnDestroy {
  public readonly superAdministradorRolId = 1;
  private canAssignSuperAdministrador = false;

  constructor(
    private toast: ToastService,
    private usuarioAdminService: UsuarioAdminService,
    private authService: AuthService,
    private router: Router
  ) {}

  minimized = false;
  visible = true;
  loading = false;
  savingRole = false;
  deletingRoleId: number | null = null;
  deletingUser = false;
  loadingListado = false;
  showDeleteUserModal = false;
  deleteConfirmText = '';
  deletingTarget: UsuarioListadoItem | null = null;
  searchNombreListado = '';
  private searchNombreTimeout: ReturnType<typeof setTimeout> | null = null;
  readonly minSearchChars = 6;
  readonly pageSize = 10;
  currentPage = 1;
  isSearchMode = false;
  activeTab: TabKey = 'datos';
  searchIdentification = '';
  user: UserProfile | null = null;
  usuariosListado: UsuarioListadoItem[] = [];
  rolesCatalogo: DtoRolCatalogo[] = [];
  showAddRoleForm = false;
  newRole: NewRoleForm = {
    rolId: null,
    justificacion: '',
    fechaFin: ''
  };
  editingRole: UserRole | null = null;

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
  }

  prepararNuevoUsuario(): void {
    this.user = null;
    this.activeTab = 'datos';
    this.searchIdentification = '';
    this.showAddRoleForm = false;
    this.newRole = { rolId: null, justificacion: '', fechaFin: '' };
    this.rolesCatalogo = [];
  }

  consultarUsuario(): void {
    const documento = this.searchIdentification.trim();
    if (!documento) {
      this.toast.warning('Documento requerido', 'Digite una identificación para consultar.');
      return;
    }

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
          roles: (resp.rolesAsignados ?? []).map((rol) => this.mapAssignedRole(rol))
        };
        this.rolesCatalogo = this.filtrarRolesCatalogo(resp.rolesCatalogo ?? []);
        this.showAddRoleForm = false;
        this.newRole = { rolId: null, justificacion: '', fechaFin: '' };

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
      }
    });
  }

  setTab(tab: TabKey): void {
    this.activeTab = tab;
  }

  toggleEstadoUsuario(): void {
    if (!this.user) {
      return;
    }
    this.user.activo = !this.user.activo;
  }

  get activeRolesCount(): number {
    return this.rolesVigentes.length;
  }

  get rolesVigentes(): UserRole[] {
    return this.user?.roles.filter((r) => r.estado === 'Vigente') ?? [];
  }

  agregarRol(): void {
    if (!this.user) {
      this.toast.warning('Roles', 'Consulta un usuario antes de asignar roles.');
      return;
    }

    if (this.rolesCatalogo.length === 0) {
      this.toast.warning('Roles', 'No hay catálogo de roles disponible.');
      return;
    }

    // Calcular fecha por defecto (6 meses a partir de hoy)
    const fecha = new Date();
    fecha.setMonth(fecha.getMonth() + 6);
    this.newRole.fechaFin = this.normalizeDateString(fecha.toISOString());
    
    this.showAddRoleForm = true;
  }

  cancelarNuevoRol(): void {
    this.showAddRoleForm = false;
    this.editingRole = null;
    this.newRole = { rolId: null, justificacion: '', fechaFin: '' };
  }

  prepararEdicionRol(rol: UserRole): void {
    this.editingRole = rol;
    this.newRole = {
      rolId: rol.id,
      justificacion: rol.justificacion,
      fechaFin: rol.fechaExpiracion
    };
    this.showAddRoleForm = true;
    
    // Hacer scroll al formulario
    setTimeout(() => {
      document.querySelector('.role-add-form')?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }

  guardarDatosUsuario(): void {
    if (!this.user) {
      this.toast.warning('Guardar datos', 'Primero consulta un usuario.');
      return;
    }

    if (!this.user.identificacion?.trim()) {
      this.toast.warning('Guardar datos', 'La identificación está vacía; vuelve a consultar el usuario.');
      return;
    }

    const username = (this.user.usuarioEmpresarial ?? '').trim();
    const funcionarioCodigo = Number((this.user.funcionarioCodigo ?? '').trim());
    const undeLaborandoCodigo = Number((this.user.undeLaborandoCodigo ?? '').trim());
    const codigoCargo = Number((this.user.codigoCargo ?? '').trim());

    if (!username) {
      this.toast.warning('Guardar datos', 'El usuario empresarial está vacío. Consulta nuevamente el funcionario.');
      return;
    }

    if (!Number.isFinite(funcionarioCodigo) || funcionarioCodigo <= 0) {
      this.toast.warning('Guardar datos', 'No se recibió código de funcionario válido. Vuelve a consultar la cédula.');
      return;
    }

    if (!Number.isFinite(undeLaborandoCodigo) || undeLaborandoCodigo <= 0) {
      this.toast.warning('Guardar datos', 'No se recibió código de unidad laborando válido. Vuelve a consultar la cédula.');
      return;
    }

    if (!Number.isFinite(codigoCargo) || codigoCargo <= 0) {
      this.toast.warning('Guardar datos', 'No se recibió código de cargo válido. Vuelve a consultar la cédula.');
      return;
    }

    const payload = {
      username,
      identificacion: this.user.identificacion,
      nombres: this.user.nombres,
      apellidos: this.user.apellidos,
      email: this.user.email,
      gradAlfabetico: this.user.gradAlfabetico || this.user.grado,
      funcionario: String(funcionarioCodigo),
      undeLaborando: String(undeLaborandoCodigo),
      codigoCargo: String(codigoCargo),
      activo: this.user.activo
    };

    this.loading = true;
    this.usuarioAdminService.guardarUsuario(payload).subscribe({
      next: (resp) => {
        this.loading = false;
        if (!resp?.success) {
          this.toast.warning('Guardar datos', resp?.message || 'No fue posible guardar.');
          return;
        }
        this.toast.success('Guardar datos', resp.message || 'Usuario guardado correctamente.');
        this.cargarListadoUsuarios();
      },
      error: (err) => {
        this.loading = false;
        const backendMessage =
          err?.error?.message ??
          err?.error?.Message ??
          err?.error?.detail ??
          err?.message;
        this.toast.error(
          'Guardar datos',
          backendMessage ?? 'Se presentó un error guardando el usuario.'
        );
      }
    });
  }

  guardarRoles(): void {
    if (!this.user) {
      this.toast.warning('Roles', 'Consulta un usuario primero.');
      return;
    }

    if (!this.showAddRoleForm) {
      this.toast.info('Roles', 'No hay cambios pendientes en roles.');
      return;
    }

    if (!this.newRole.rolId || this.newRole.rolId <= 0) {
      this.toast.warning('Roles', 'Selecciona un rol.');
      return;
    }

    if (!this.newRole.justificacion.trim()) {
      this.toast.warning('Roles', 'La justificación es obligatoria.');
      return;
    }

    if (!this.newRole.fechaFin) {
      this.toast.warning('Roles', 'La fecha fin es obligatoria.');
      return;
    }

    this.savingRole = true;
    this.usuarioAdminService.asignarRol({
      usuarioId: 0,
      usuario: this.user.usuarioEmpresarial,
      identificacion: this.user.identificacion,
      rolId: this.newRole.rolId,
      justificacion: this.newRole.justificacion.trim(),
      fechaFin: this.newRole.fechaFin,
      vigente: 1
    }).subscribe({
      next: (resp) => {
        this.savingRole = false;
        if (!resp?.success) {
          this.toast.warning('Roles', resp?.message || 'No fue posible asignar el rol.');
          return;
        }

        this.toast.success('Roles', resp.message || 'Rol asignado correctamente.');
        this.cancelarNuevoRol();
        this.consultarUsuario();
        this.cargarListadoUsuarios();
      },
      error: (err) => {
        this.savingRole = false;
        this.toast.error('Roles', err?.error?.detail ?? err?.error?.message ?? 'Error asignando rol.');
      }
    });
  }

  eliminarRol(rol: UserRole): void {
    if (!this.user) {
      this.toast.warning('Roles', 'Consulta un usuario primero.');
      return;
    }

    const confirmar = confirm(`¿Deseas retirar el rol "${rol.nombre}" del usuario?`);
    if (!confirmar) {
      return;
    }

    this.deletingRoleId = rol.id;
    this.usuarioAdminService.eliminarRol(rol.id, this.user.usuarioEmpresarial, this.user.identificacion).subscribe({
      next: (resp) => {
        this.deletingRoleId = null;
        if (!resp?.success) {
          this.toast.warning('Roles', resp?.message || 'No fue posible retirar el rol.');
          return;
        }
        this.toast.success('Roles', resp.message || 'Rol retirado correctamente.');
        this.consultarUsuario();
        this.cargarListadoUsuarios();
      },
      error: (err) => {
        this.deletingRoleId = null;
        this.toast.error('Roles', err?.error?.detail ?? err?.error?.message ?? 'Error retirando rol.');
      }
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
    const query = this.isSearchMode ? term : '';

    this.usuarioAdminService.getListadoUsuarios(query).subscribe({
      next: (items) => {
        this.usuariosListado = (items ?? []).map((x) => ({
          ...x,
          fechaFinRol: this.normalizeDateString(x?.fechaFinRol ?? '')
        }));
        this.currentPage = 1;
        this.loadingListado = false;
      },
      error: () => {
        this.usuariosListado = [];
        this.currentPage = 1;
        this.loadingListado = false;
      }
    });
  }

  onSearchNombreListadoChange(): void {
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

  canGoPrevListado(): boolean {
    return this.currentPage > 1;
  }

  canGoNextListado(): boolean {
    return this.currentPage < this.totalPaginasListado;
  }

  prevPaginaListado(): void {
    if (!this.canGoPrevListado()) {
      return;
    }
    this.currentPage -= 1;
  }

  nextPaginaListado(): void {
    if (!this.canGoNextListado()) {
      return;
    }
    this.currentPage += 1;
  }

  editarDesdeListado(item: UsuarioListadoItem): void {
    const identificacion = String(item?.identificacion ?? '').trim();
    if (!identificacion) {
      this.toast.warning('Usuarios', 'El registro no tiene identificación para cargar edición.');
      return;
    }

    this.searchIdentification = identificacion;
    this.activeTab = 'datos';
    this.consultarUsuario();
  }

  abrirModalEliminarUsuario(item: UsuarioListadoItem): void {
    this.deletingTarget = item;
    this.deleteConfirmText = '';
    this.showDeleteUserModal = true;
  }

  cerrarModalEliminarUsuario(): void {
    if (this.deletingUser) {
      return;
    }
    this.showDeleteUserModal = false;
    this.deleteConfirmText = '';
    this.deletingTarget = null;
  }

  confirmarEliminarUsuario(): void {
    if (!this.deletingTarget) {
      return;
    }

    if (this.deleteConfirmText.trim().toUpperCase() !== 'ELIMINAR') {
      this.toast.warning('Usuarios', 'Debes escribir ELIMINAR para confirmar.');
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

        if (this.user?.identificacion?.trim() === String(this.deletingTarget?.identificacion ?? '').trim()) {
          this.user = null;
          this.activeTab = 'datos';
        }
      },
      error: (err) => {
        this.deletingUser = false;
        this.toast.error('Usuarios', err?.error?.detail ?? err?.error?.message ?? 'Error eliminando usuario.');
      }
    });
  }

  private mapAssignedRole(rol: RawAssignedRole): UserRole {
    const fechaExpiracion = this.normalizeDateString(rol?.fechaFin ?? rol?.fecha_fin ?? '');
    const estadoBase = String(rol?.estado ?? '').trim().toLowerCase();
    const estado: RolEstado = estadoBase.includes('venc') ? 'Vencido' : 'Vigente';

    return {
      id: Number(rol?.id ?? 0),
      nombre: String(rol?.rol ?? '').trim() || `Rol ${rol?.id}`,
      fechaExpiracion,
      estado,
      justificacion: String(rol?.justificacion ?? '').trim()
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

    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private filtrarRolesCatalogo(roles: DtoRolCatalogo[]): DtoRolCatalogo[] {
    if (!this.canAssignSuperAdministrador) {
      return [];
    }
    return roles ?? [];
  }
}
