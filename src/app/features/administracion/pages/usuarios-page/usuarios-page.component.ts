import { DOCUMENT } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  inject,
  Injector,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { UsuarioDeleteModalComponent } from '../../components/usuarios/usuario-delete-modal/usuario-delete-modal.component';
import { UsuarioCivilModalComponent } from '../../components/usuarios/usuario-civil-modal/usuario-civil-modal.component';
import { UsuarioFormComponent } from '../../components/usuarios/usuario-form/usuario-form.component';

import { UsuariosTableComponent } from '../../components/usuarios/usuarios-table/usuarios-table.component';
import {
  NewRoleForm,
  RawAssignedRole,
  RemoveRoleCommand,
  RolEstado,
  UserProfile,
  UserRole,
} from '../../interfaces/usuario-admin-view.interface';
import {
  DtoRolCatalogo,
  UsuarioAdminService,
  type UsuarioConsultaOrigen,
  UsuarioListadoItem,
} from '../../services/usuario-admin.service';

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    UsuarioDeleteModalComponent,
    UsuarioFormComponent,
    UsuariosTableComponent,
    UsuarioCivilModalComponent,
  ],
  templateUrl: './usuarios-page.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./usuarios-page.component.scss'],
})
export class UsuariosPageComponent implements OnInit, OnDestroy {
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly usuarioAdminService = inject(UsuarioAdminService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly document = inject(DOCUMENT);

  /*
   * Estos estados cambian desde respuestas HTTP, temporizadores y promesas.
   * Los signals notifican a Angular inmediatamente, incluso con eventos
   * agrupados o al probar la aplicación desde un simulador táctil.
   * Los accesores mantienen legible la orquestación existente.
   */
  private readonly loadingState = signal(false);
  private readonly savingRoleState = signal(false);
  private readonly roleSaveRevisionState = signal(0);
  private readonly roleDeleteRevisionState = signal(0);
  private readonly deletingRoleIdState = signal<number | null>(null);
  private readonly deletingUserState = signal(false);
  private readonly loadingListadoState = signal(false);
  /** Alta de usuario civil: va en modal para no alterar el flujo institucional. */
  private readonly showCivilModalState = signal(false);
  private readonly showDeleteUserModalState = signal(false);
  private readonly deletingTargetState = signal<UsuarioListadoItem | null>(null);
  private readonly searchNombreListadoState = signal('');
  private readonly pageSizeState = signal(5);
  private readonly currentPageState = signal(1);
  private readonly isSearchModeState = signal(false);
  private readonly searchIdentificationState = signal('');
  private readonly userState = signal<UserProfile | null>(null);
  private readonly usuariosListadoState = signal<UsuarioListadoItem[]>([]);
  private readonly rolesCatalogoState = signal<DtoRolCatalogo[]>([]);
  readonly basicInfoFocusRevision = signal(0);

  public readonly superAdministradorRolId = 2;
  private canAssignSuperAdministrador = false;

  minimized = false;
  visible = true;
  private searchNombreTimeout: ReturnType<typeof setTimeout> | null = null;
  private listadoRequestRevision = 0;
  readonly minSearchChars = 6;
  private savedUserKeys = new Set<string>();
  private savedUserIndexReady = false;
  private lastUnsavedAlertKey = '';

  get loading(): boolean {
    return this.loadingState();
  }

  set loading(value: boolean) {
    this.loadingState.set(value);
  }

  get savingRole(): boolean {
    return this.savingRoleState();
  }

  set savingRole(value: boolean) {
    this.savingRoleState.set(value);
  }

  get roleSaveRevision(): number {
    return this.roleSaveRevisionState();
  }

  set roleSaveRevision(value: number) {
    this.roleSaveRevisionState.set(value);
  }

  get roleDeleteRevision(): number {
    return this.roleDeleteRevisionState();
  }

  set roleDeleteRevision(value: number) {
    this.roleDeleteRevisionState.set(value);
  }

  get deletingRoleId(): number | null {
    return this.deletingRoleIdState();
  }

  set deletingRoleId(value: number | null) {
    this.deletingRoleIdState.set(value);
  }

  get deletingUser(): boolean {
    return this.deletingUserState();
  }

  set deletingUser(value: boolean) {
    this.deletingUserState.set(value);
  }

  get loadingListado(): boolean {
    return this.loadingListadoState();
  }

  set loadingListado(value: boolean) {
    this.loadingListadoState.set(value);
  }

  get showCivilModal(): boolean {
    return this.showCivilModalState();
  }

  get showDeleteUserModal(): boolean {
    return this.showDeleteUserModalState();
  }

  set showDeleteUserModal(value: boolean) {
    this.showDeleteUserModalState.set(value);
  }

  get deletingTarget(): UsuarioListadoItem | null {
    return this.deletingTargetState();
  }

  set deletingTarget(value: UsuarioListadoItem | null) {
    this.deletingTargetState.set(value);
  }

  get searchNombreListado(): string {
    return this.searchNombreListadoState();
  }

  set searchNombreListado(value: string) {
    this.searchNombreListadoState.set(value);
  }

  get pageSize(): number {
    return this.pageSizeState();
  }

  set pageSize(value: number) {
    this.pageSizeState.set(value);
  }

  get currentPage(): number {
    return this.currentPageState();
  }

  set currentPage(value: number) {
    this.currentPageState.set(value);
  }

  get isSearchMode(): boolean {
    return this.isSearchModeState();
  }

  set isSearchMode(value: boolean) {
    this.isSearchModeState.set(value);
  }

  get searchIdentification(): string {
    return this.searchIdentificationState();
  }

  set searchIdentification(value: string) {
    this.searchIdentificationState.set(value);
  }

  get user(): UserProfile | null {
    return this.userState();
  }

  set user(value: UserProfile | null) {
    this.userState.set(value);
  }

  get usuariosListado(): UsuarioListadoItem[] {
    return this.usuariosListadoState();
  }

  set usuariosListado(value: UsuarioListadoItem[]) {
    this.usuariosListadoState.set(value);
  }

  get rolesCatalogo(): DtoRolCatalogo[] {
    return this.rolesCatalogoState();
  }

  set rolesCatalogo(value: DtoRolCatalogo[]) {
    this.rolesCatalogoState.set(value);
  }

  ngOnInit(): void {
    this.canAssignSuperAdministrador = this.authService.isCurrentUserSuperAdmin();
    this.cargarRolesCatalogo();
    this.cargarListadoUsuarios();
  }

  cargarRolesCatalogo(): void {
    this.usuarioAdminService.getRolesCatalogo().subscribe({
      next: (roles) => {
        if (roles && roles.length > 0) {
          this.rolesCatalogo = this.filtrarRolesCatalogo(roles);
        }
      },
      error: () => {},
    });
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
    this.lastUnsavedAlertKey = '';
  }

  consultarUsuario(
    documentoRecibido?: string,
    origen: UsuarioConsultaOrigen = 'BUSQUEDA_DIGITADA',
  ): void {
    const documento = (documentoRecibido ?? this.searchIdentification).trim();

    if (!documento) {
      this.toast.warning('Documento requerido', 'Digite una identificación para consultar.');
      return;
    }

    this.searchIdentification = documento;
    this.loading = true;
    this.toast.info('Consulta', 'Buscando información empresarial...');

    this.usuarioAdminService.consultarUsuarioPorIdentificacion(documento, origen).subscribe({
      next: (resp) => {
        const funcionario = resp.funcionario ?? {};
        const nombres = (funcionario.nombres ?? '').trim();
        const apellidos = (funcionario.apellidos ?? '').trim();
        const assignedRoles = this.hydrateMissingRoleDatesFromList(
          resp.rolesAsignados ?? [],
          String(funcionario.identificacion ?? documento),
          String(funcionario.usuario ?? ''),
        );
        const nombreCompleto = `${nombres} ${apellidos}`.trim() || 'SIN NOMBRE';

        this.user = {
          idUsuario: String(funcionario.idUsuario ?? '0'),
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
          ultimoIngreso: this.formatLastLogin(resp.ultimoIngreso),
          fotoUrl: resp.fotoBase64 ?? undefined,
          roles: this.normalizeAssignedRoles(assignedRoles),
        };

        this.rolesCatalogo = this.filtrarRolesCatalogo(resp.rolesCatalogo ?? []);
        this.loading = false;
        this.syncCurrentUserWithSavedList();
        this.focusBasicUserInformation();
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

  /**
   * Abre el panel, solicita al formulario la pestaña de información básica y
   * lleva al inicio el contenedor desplazable cuando Angular termina de
   * proyectar los datos consultados.
   */
  private focusBasicUserInformation(): void {
    this.minimized = false;
    this.basicInfoFocusRevision.update((revision) => revision + 1);

    afterNextRender(
      () => {
        const mainScrollContainer = this.document.querySelector<HTMLElement>('.main');

        if (mainScrollContainer) {
          mainScrollContainer.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
          return;
        }

        // Respaldo si el componente se reutiliza fuera del layout principal.
        this.document.scrollingElement?.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
      },
      { injector: this.injector },
    );
  }

  async guardarDatosUsuario(user: UserProfile): Promise<void> {
    if (this.loading) {
      return;
    }

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

    /*
     * La página orquesta la confirmación porque es responsable de la
     * persistencia. El formulario reutilizable solamente valida y emite datos.
     */
    const confirmed = await this.alert.confirm({
      title: 'Confirmar guardado',
      message: `¿Desea guardar la información de ${user.nombreCompleto || username}?`,
      confirmText: 'Sí, guardar',
      cancelText: 'No, cancelar',
      icon: 'question',
      intent: 'primary',
      focusCancel: true,
    });

    if (!confirmed) {
      return;
    }

    this.loading = true;

    this.usuarioAdminService.guardarUsuario(payload).subscribe({
      next: (resp) => {
        this.loading = false;

        if (!resp?.success) {
          this.toast.warning('Guardar datos', resp?.message || 'No fue posible guardar.');
          return;
        }

        this.user = user;
        this.registerSavedUser(user.identificacion, user.usuarioEmpresarial);
        this.lastUnsavedAlertKey = '';
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
    if (this.savingRole) {
      return;
    }

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
      .pipe(finalize(() => (this.savingRole = false)))
      .subscribe({
        next: (resp) => {
          if (!resp?.success) {
            this.toast.warning('Roles', resp?.message || 'No fue posible asignar el rol.');
            return;
          }

          /*
           * La respuesta del POST ya confirma la persistencia. Actualizamos
           * solamente el rol afectado y evitamos repetir la consulta externa
           * de funcionario, token, fotografía y catálogos.
           */
          this.reflectSavedRole(roleForm);
          this.roleSaveRevision += 1;
          this.cargarListadoUsuarios();

          void this.alert.success(
            'Rol guardado',
            resp.message || 'El rol fue asignado correctamente.',
          );
        },
        error: (err) => {
          this.toast.error(
            'Roles',
            err?.error?.detail ?? err?.error?.message ?? 'Error asignando rol.',
          );
        },
      });
  }

  /** Refleja inmediatamente en la tabla el rol confirmado por el backend. */
  private reflectSavedRole(roleForm: NewRoleForm): void {
    if (!this.user || !roleForm.rolId) {
      return;
    }

    const roleName =
      this.rolesCatalogo.find((role) => role.id === roleForm.rolId)?.nombre?.trim() ||
      `Rol ${roleForm.rolId}`;
    const savedRole: UserRole = {
      id: roleForm.rolId,
      nombre: roleName,
      fechaExpiracion: roleForm.fechaFin,
      estado: 'Vigente',
      justificacion: roleForm.justificacion.trim(),
    };
    const otherRoles = this.user.roles.filter((role) => role.id !== roleForm.rolId);

    this.user = {
      ...this.user,
      roles: [...otherRoles, savedRole],
    };
  }

  eliminarRol(command: RemoveRoleCommand): void {
    if (this.deletingRoleId !== null) {
      return;
    }

    if (!this.user) {
      this.toast.warning('Roles', 'Consulta un usuario primero.');
      return;
    }

    const observacion = command.observacion.trim();
    if (observacion.length < 10) {
      this.toast.warning('Roles', 'La observación debe contener al menos 10 caracteres.');
      return;
    }

    const rol = command.role;
    this.deletingRoleId = rol.id;

    this.usuarioAdminService
      .retirarRol(rol.id, this.user.usuarioEmpresarial, this.user.identificacion, observacion)
      .pipe(finalize(() => (this.deletingRoleId = null)))
      .subscribe({
        next: (resp) => {
          if (!resp?.success) {
            this.toast.warning('Roles', resp?.message || 'No fue posible retirar el rol.');
            return;
          }

          this.removeRoleLocally(rol.id);
          this.roleDeleteRevision += 1;
          this.cargarListadoUsuarios();

          void this.alert.success(
            'Rol retirado',
            resp.message || 'El rol fue retirado correctamente.',
          );
        },
        error: (err) => {
          this.toast.error(
            'Roles',
            err?.error?.detail ?? err?.error?.message ?? 'Error retirando rol.',
          );
        },
      });
  }

  /** Retira de la vista todas las copias locales del rol confirmado por el backend. */
  private removeRoleLocally(roleId: number): void {
    if (!this.user) {
      return;
    }

    this.user = {
      ...this.user,
      roles: this.user.roles.filter((role) => role.id !== roleId),
    };
  }

  cargarListadoUsuarios(): void {
    const requestRevision = ++this.listadoRequestRevision;
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
        // Una respuesta anterior nunca debe reemplazar la búsqueda más reciente.
        if (requestRevision !== this.listadoRequestRevision) {
          return;
        }

        this.usuariosListado = (items ?? []).map((item) => ({
          ...item,
          fechaFinRol: this.normalizeDateString(item?.fechaFinRol ?? ''),
        }));

        if (!hasSearchTerm) {
          this.refreshSavedUserIndex(this.usuariosListado);
        }

        this.currentPage = 1;
        this.loadingListado = false;
        this.syncCurrentUserWithSavedList();
      },
      error: () => {
        if (requestRevision !== this.listadoRequestRevision) {
          return;
        }

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

    this.consultarUsuario(identificacion, 'TABLA_USUARIOS');
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

  confirmarEliminarUsuario(observacion: string): void {
    const target = this.deletingTarget;
    if (!target || this.deletingUser) {
      return;
    }

    this.deletingUser = true;

    this.usuarioAdminService.eliminarUsuario(target.idUsuario, observacion).subscribe({
      next: (resp) => {
        this.deletingUser = false;

        if (!resp?.success) {
          this.toast.warning('Usuarios', resp?.message || 'No fue posible eliminar el usuario.');
          return;
        }

        this.toast.success('Usuarios', resp.message || 'Usuario eliminado correctamente.');
        this.cerrarModalEliminarUsuario();
        this.cargarListadoUsuarios();

        if (this.user?.identificacion?.trim() === String(target.identificacion ?? '').trim()) {
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
    const fechaExpiracion = this.readAssignedRoleEndDate(rol);
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

  /**
   * Unifica el nombre de fecha usado por versiones distintas del API. El resto
   * de la vista trabaja únicamente con fechaExpiracion en formato YYYY-MM-DD.
   */
  private readAssignedRoleEndDate(role: RawAssignedRole): string {
    const candidates = [
      role?.fechaFin,
      role?.FechaFin,
      role?.fecha_fin,
      role?.FECHA_FIN,
      role?.fechaExpiracion,
      role?.fecha_expiracion,
      role?.fechaVencimiento,
      role?.fecha_vencimiento,
      role?.fechaFinalizacion,
    ];

    for (const candidate of candidates) {
      const normalizedDate = this.normalizeDateString(String(candidate ?? ''));
      if (normalizedDate) {
        return normalizedDate;
      }
    }

    return '';
  }

  /**
   * Recupera fechas del listado consolidado cuando una versión anterior del
   * endpoint detallado devuelve el rol y su justificación, pero omite fechaFin.
   * Ambos campos agregados usan el mismo ORDER BY en Oracle, por eso conservan
   * una correspondencia estable por posición y nombre.
   */
  private hydrateMissingRoleDatesFromList(
    roles: RawAssignedRole[],
    identification: string,
    username: string,
  ): RawAssignedRole[] {
    if (roles.length === 0 || roles.every((role) => Boolean(this.readAssignedRoleEndDate(role)))) {
      return roles;
    }

    const identificationKey = this.normalizeLookupValue(identification);
    const usernameKey = this.normalizeLookupValue(username);
    const listedUser = this.usuariosListado.find((item) => {
      const sameIdentification =
        identificationKey && this.normalizeLookupValue(item.identificacion) === identificationKey;
      const sameUsername = usernameKey && this.normalizeLookupValue(item.username) === usernameKey;

      return Boolean(sameIdentification || sameUsername);
    });

    if (!listedUser?.fechaFinRol) {
      return roles;
    }

    const listedRoleNames = this.splitAggregatedValues(listedUser.rol);
    const listedDates = this.splitAggregatedValues(listedUser.fechaFinRol);
    const dateByRoleName = new Map<string, string>();

    listedRoleNames.forEach((roleName, index) => {
      const normalizedDate = this.normalizeDateString(listedDates[index] ?? '');
      if (normalizedDate && /^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
        dateByRoleName.set(this.normalizeLookupValue(roleName), normalizedDate);
      }
    });

    return roles.map((role, index) => {
      if (this.readAssignedRoleEndDate(role)) {
        return role;
      }

      const dateByName = dateByRoleName.get(this.normalizeLookupValue(String(role.rol ?? '')));
      const dateByPosition = this.normalizeDateString(listedDates[index] ?? '');
      const recoveredDate =
        dateByName || (/^\d{4}-\d{2}-\d{2}$/.test(dateByPosition) ? dateByPosition : '');

      return recoveredDate ? { ...role, fechaFin: recoveredDate } : role;
    });
  }

  /** Separa los LISTAGG simples emitidos por el listado administrativo. */
  private splitAggregatedValues(value: string | null | undefined): string[] {
    return String(value ?? '')
      .split(/\s*,\s*/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  /**
   * Protege la interfaz frente a registros historicos duplicados.
   * Conserva una sola tarjeta por rol y prioriza la asignacion vigente.
   */
  private normalizeAssignedRoles(roles: RawAssignedRole[]): UserRole[] {
    const normalizedByRole = new Map<number, UserRole>();

    for (const rawRole of roles) {
      const mappedRole = this.mapAssignedRole(rawRole);
      if (mappedRole.id <= 0) {
        continue;
      }

      const currentRole = normalizedByRole.get(mappedRole.id);
      if (!currentRole || this.shouldReplaceRole(currentRole, mappedRole)) {
        normalizedByRole.set(mappedRole.id, mappedRole);
      }
    }

    return Array.from(normalizedByRole.values());
  }

  /** Decide cual registro representa mejor una asignacion repetida. */
  private shouldReplaceRole(currentRole: UserRole, candidateRole: UserRole): boolean {
    if (currentRole.estado !== candidateRole.estado) {
      return candidateRole.estado === 'Vigente';
    }

    return candidateRole.fechaExpiracion >= currentRole.fechaExpiracion;
  }

  private normalizeDateString(raw: string): string {
    const value = String(raw ?? '').trim();

    if (!value) {
      return '';
    }

    const onlyDate = value.includes('T') ? value.split('T')[0] : value.split(' ')[0];

    if (/^\d{4}-\d{2}-\d{2}$/.test(onlyDate)) {
      return onlyDate;
    }

    const dayFirstMatch = onlyDate.match(/^(\d{2})[\/-](\d{2})[\/-](\d{4})$/);
    if (dayFirstMatch) {
      const [, day, month, year] = dayFirstMatch;
      return `${year}-${month}-${day}`;
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

  /** Convierte el instante ISO del API a una fecha legible en la zona del navegador. */
  private formatLastLogin(raw: string | null | undefined): string {
    const value = String(raw ?? '').trim();
    if (!value) {
      return 'Sin registros';
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Sin registros';
    }

    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }

  private filtrarRolesCatalogo(roles: DtoRolCatalogo[]): DtoRolCatalogo[] {
    if (!roles || roles.length === 0) {
      return [];
    }

    if (!this.canAssignSuperAdministrador) {
      return roles.filter((role) => {
        const nombre = (role.nombre ?? '').trim().toLowerCase();
        return (
          role.id !== this.superAdministradorRolId &&
          nombre !== 'superadministrador' &&
          nombre !== 'super administrador' &&
          nombre !== 'superadmin'
        );
      });
    }

    return roles;
  }

  /** Reconstruye el índice únicamente con el listado completo persistido. */
  private refreshSavedUserIndex(users: UsuarioListadoItem[]): void {
    const keys = new Set<string>();

    for (const item of users) {
      for (const key of this.buildUserKeys(item.identificacion, item.username)) {
        keys.add(key);
      }
    }

    this.savedUserKeys = keys;
    this.savedUserIndexReady = true;
  }

  /** Registra inmediatamente un guardado confirmado, antes de recargar la tabla. */
  private registerSavedUser(identification: string, username: string): void {
    for (const key of this.buildUserKeys(identification, username)) {
      this.savedUserKeys.add(key);
    }

    this.savedUserIndexReady = true;
  }

  /**
   * Selecciona visualmente el registro guardado o informa una sola vez cuando
   * el funcionario empresarial todavía no pertenece a la administración.
   */
  private syncCurrentUserWithSavedList(): void {
    if (!this.user || !this.savedUserIndexReady) {
      return;
    }

    const userKeys = this.buildUserKeys(this.user.identificacion, this.user.usuarioEmpresarial);
    const isSaved = userKeys.some((key) => this.savedUserKeys.has(key));

    if (isSaved) {
      this.lastUnsavedAlertKey = '';
      this.focusCurrentUserPage(this.user.identificacion);
      return;
    }

    const alertKey = userKeys.at(0) ?? '';
    if (!alertKey || this.lastUnsavedAlertKey === alertKey) {
      return;
    }

    this.lastUnsavedAlertKey = alertKey;
    void this.alert.info(
      'Usuario no guardado',
      'El funcionario fue consultado, pero todavía no está registrado en Administración de Usuarios. Guarde sus datos antes de asignar roles.',
    );
  }

  /** Lleva el paginador a la fila seleccionada cuando está en el resultado actual. */
  private focusCurrentUserPage(identification: string): void {
    const selectedKey = this.normalizeLookupValue(identification);
    const selectedIndex = this.usuariosListado.findIndex(
      (item) => this.normalizeLookupValue(item.identificacion) === selectedKey,
    );

    if (selectedIndex >= 0) {
      this.currentPage = Math.floor(selectedIndex / this.pageSize) + 1;
    }
  }

  private buildUserKeys(identification: string, username: string): string[] {
    const identificationKey = this.normalizeLookupValue(identification);
    const usernameKey = this.normalizeLookupValue(username);

    return [
      identificationKey ? `identification:${identificationKey}` : '',
      usernameKey ? `username:${usernameKey}` : '',
    ].filter(Boolean);
  }

  private normalizeLookupValue(value: unknown): string {
    return String(value ?? '')
      .trim()
      .toLocaleLowerCase('es-CO');
  }
  abrirModalUsuarioCivil(): void {
    this.showCivilModalState.set(true);
  }

  cerrarModalUsuarioCivil(): void {
    this.showCivilModalState.set(false);
  }

  /** Tras crear un civil, el listado debe reflejarlo sin recargar la pantalla. */
  onUsuarioCivilGuardado(): void {
    this.cargarListadoUsuarios();
  }

}
