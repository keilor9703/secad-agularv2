import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';

import { ToastService } from '../../../../core/services/toast.service';
import { AlertService } from '../../../../shared/services/alert.service';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSearchInputComponent } from '../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiTableComponent } from '../../../../shared/components/ui-table/ui-table.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import {
  UiTableAction,
  UiTableActionEvent,
  UiTableColumn,
} from '../../../../shared/interfaces/ui-table.interface';
import { DominioService, DtoDominio } from '../../services/dominio.service';
import {
  CuentaEmailService,
  DtoCuentaEmail,
  DtoCuentaEmailUsuario,
} from '../../services/cuenta-email.service';
import { UsuarioAdminService, UsuarioListadoItem } from '../../services/usuario-admin.service';

interface DominioApiItem extends Partial<DtoDominio> {
  IdDominio?: number;
  Descripcion?: string;
  IdPadre?: number;
}

/**
 * Los parámetros SMTP son fijos para toda la organización: el formulario del
 * origen los reescribía a mano en cada guardado, dos veces (alta y edición),
 * con los mismos literales duplicados.
 */
const SMTP_FIJO = { servidor: 'smtp.office365.com', puerto: 587, ssl: 1 } as const;

const MAX_ENCABEZADO_BYTES = 3 * 1024 * 1024;

@Component({
  selector: 'app-cuentas-email',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    UiButtonComponent,
    UiFileUploadComponent,
    UiInputComponent,
    UiPageHeaderComponent,
    UiSearchInputComponent,
    UiSectionHeaderComponent,
    UiSelectComponent,
    UiTableComponent,
  ],
  templateUrl: './cuentas-email-page.component.html',
  styleUrls: ['./cuentas-email-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CuentasEmailPageComponent implements OnInit {
  private readonly toast = inject(ToastService);
  private readonly alert = inject(AlertService);
  private readonly dominioService = inject(DominioService);
  private readonly cuentaEmailService = inject(CuentaEmailService);
  private readonly usuarioAdminService = inject(UsuarioAdminService);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly listaCuentas = signal<DtoCuentaEmail[]>([]);
  readonly gruposCOEST = signal<DtoDominio[]>([]);

  readonly editingId = signal<number | null>(null);
  readonly imagenEncabezadoPreview = signal('');
  readonly nombreImagenEncabezado = signal('');
  readonly subiendoImagenEncabezado = signal(false);

  readonly cuentaAutorizacion = signal<DtoCuentaEmail | null>(null);
  readonly listaAutorizados = signal<DtoCuentaEmailUsuario[]>([]);
  readonly resultadosUsuarios = signal<UsuarioListadoItem[]>([]);
  readonly loadingAutorizados = signal(false);
  readonly loadingBusquedaUsuarios = signal(false);
  readonly savingAutorizacion = signal(false);
  readonly busquedaHecha = signal(false);

  /** Se activa al primer intento de guardar: hasta entonces no se pinta nada en rojo. */
  readonly intentoGuardar = signal(false);

  readonly form = new FormGroup({
    idDominioGrupo: new FormControl<number | null>(null, { validators: [Validators.required] }),
    nombreCuenta: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    claveSmtp: new FormControl('', { nonNullable: true }),
    vigente: new FormControl(1, { nonNullable: true }),
  });

  readonly editando = computed(() => this.editingId() !== null);

  readonly opcionesGrupo = computed<UiSelectOption<number>[]>(() =>
    this.gruposCOEST().map((g) => ({ label: g.descripcion, value: g.idDominio })),
  );

  readonly opcionesEstado: UiSelectOption<number>[] = [
    { label: 'Activa', value: 1 },
    { label: 'Inactiva', value: 0 },
  ];

  /**
   * El origen solo avisaba de los campos vacíos con un toast genérico al
   * guardar; aquí el error va en el campo que lo causa.
   */
  private errorDe(control: 'idDominioGrupo' | 'nombreCuenta' | 'email', mensaje: string): string {
    if (!this.intentoGuardar()) return '';
    return this.form.controls[control].invalid ? mensaje : '';
  }

  readonly errorGrupo = computed(() => this.errorDe('idDominioGrupo', 'Seleccione el grupo dueño.'));
  readonly errorNombre = computed(() => this.errorDe('nombreCuenta', 'El nombre es obligatorio.'));
  readonly errorEmail = computed(() =>
    this.errorDe('email', this.form.controls.email.hasError('email')
      ? 'El correo no tiene un formato válido.'
      : 'El correo es obligatorio.'),
  );

  readonly columnasCuentas: UiTableColumn<DtoCuentaEmail>[] = [
    { key: 'idDominioGrupo', label: 'Grupo', value: (c) => this.getNombreGrupo(c.idDominioGrupo) },
    { key: 'nombreCuenta', label: 'Nombre cuenta' },
    { key: 'email', label: 'Email' },
    { key: 'servidorSmtp', label: 'Servidor', value: (c) => `${c.servidorSmtp}:${c.puerto}` },
    {
      key: 'vigente',
      label: 'Estado',
      align: 'center',
      badge: (c) =>
        c.vigente === 1
          ? { text: 'Activa', variant: 'success' }
          : { text: 'Inactiva', variant: 'neutral' },
    },
  ];

  readonly accionesCuentas: UiTableAction<DtoCuentaEmail>[] = [
    { id: 'autorizaciones', label: 'Autorizaciones', icon: 'fa-solid fa-user-shield' },
    { id: 'editar', label: 'Editar', icon: 'fa-solid fa-pen-to-square' },
    { id: 'eliminar', label: 'Eliminar', icon: 'fa-solid fa-trash', variant: 'danger' },
  ];

  readonly columnasBusqueda: UiTableColumn<UsuarioListadoItem>[] = [
    { key: 'idUsuario', label: 'ID', align: 'center' },
    { key: 'username', label: 'Usuario' },
    { key: 'identificacion', label: 'Identificación' },
    { key: 'nombreCompleto', label: 'Nombre' },
    { key: 'rol', label: 'Rol' },
  ];

  readonly accionesBusqueda: UiTableAction<UsuarioListadoItem>[] = [
    { id: 'autorizar', label: 'Autorizar', icon: 'fa-solid fa-user-plus' },
  ];

  readonly columnasAutorizados: UiTableColumn<DtoCuentaEmailUsuario>[] = [
    { key: 'usuarioLogin', label: 'Usuario' },
    { key: 'identificacion', label: 'Identificación' },
    { key: 'nombreCompleto', label: 'Nombre' },
  ];

  readonly accionesAutorizados: UiTableAction<DtoCuentaEmailUsuario>[] = [
    { id: 'quitar', label: 'Quitar autorización', icon: 'fa-solid fa-user-minus', variant: 'danger' },
  ];

  ngOnInit(): void {
    this.cargarGrupos();
    this.cargarCuentas();
  }

  // ── Catálogos ────────────────────────────────────────────────────────────

  cargarGrupos(): void {
    this.dominioService.getAll().subscribe({
      next: (data) => {
        const todos = (data ?? []).map(
          (d: DominioApiItem) =>
            ({
              idDominio: d.idDominio ?? d.IdDominio ?? 0,
              descripcion: d.descripcion ?? d.Descripcion ?? '',
              idPadre: d.idPadre ?? d.IdPadre ?? 0,
            }) as DtoDominio,
        );

        const organigrama = todos.find((d) => d.descripcion.toUpperCase() === 'ORGANIGRAMA COEST');
        if (!organigrama) return;

        const jerarquia: DtoDominio[] = [];
        this.recogerDescendencia(organigrama.idDominio, todos, 0, jerarquia);
        this.gruposCOEST.set(jerarquia);
      },
      error: () => this.toast.error('Error', 'No se pudieron cargar los grupos del organigrama'),
    });
  }

  /**
   * El origen empujaba directamente sobre el arreglo del componente desde la
   * recursión; aquí se llena una lista local y se publica de una sola vez.
   */
  private recogerDescendencia(
    idPadre: number,
    todos: DtoDominio[],
    nivel: number,
    destino: DtoDominio[],
  ): void {
    for (const hijo of todos.filter((d) => d.idPadre === idPadre)) {
      destino.push({ ...hijo, descripcion: `${'--'.repeat(nivel)} ${hijo.descripcion}`.trim() });
      this.recogerDescendencia(hijo.idDominio, todos, nivel + 1, destino);
    }
  }

  cargarCuentas(): void {
    this.loading.set(true);
    this.cuentaEmailService
      .getAll()
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (data) => this.listaCuentas.set(data ?? []),
        error: () => this.toast.error('Error', 'No se pudieron cargar las cuentas de correo'),
      });
  }

  getNombreGrupo(idDominio: number): string {
    const grupo = this.gruposCOEST().find((g) => g.idDominio === idDominio);
    return grupo ? grupo.descripcion.replace(/^-+ /, '') : 'Desconocido';
  }

  // ── Formulario ───────────────────────────────────────────────────────────

  nuevo(): void {
    this.editingId.set(null);
    this.intentoGuardar.set(false);
    this.imagenEncabezadoPreview.set('');
    this.nombreImagenEncabezado.set('');
    this.form.reset({
      idDominioGrupo: null,
      nombreCuenta: '',
      email: '',
      claveSmtp: '',
      vigente: 1,
    });
  }

  editar(item: DtoCuentaEmail): void {
    this.editingId.set(item.idCuenta);
    this.intentoGuardar.set(false);
    this.imagenEncabezadoPreview.set(item.imagenEncabezado ?? '');
    this.nombreImagenEncabezado.set(item.imagenEncabezado ? this.nombreDeArchivo(item.imagenEncabezado) : '');
    this.form.reset({
      idDominioGrupo: item.idDominioGrupo,
      nombreCuenta: item.nombreCuenta,
      email: item.email,
      claveSmtp: item.claveSmtp,
      vigente: item.vigente,
    });
  }

  private nombreDeArchivo(url: string): string {
    return url.split('/').pop() ?? url;
  }

  guardar(): void {
    this.intentoGuardar.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.warning('Validación', 'Revise los campos marcados en el formulario');
      return;
    }

    const v = this.form.getRawValue();
    const request = {
      IdDominioGrupo: v.idDominioGrupo ?? 0,
      NombreCuenta: v.nombreCuenta.trim(),
      Email: v.email.trim(),
      ServidorSmtp: SMTP_FIJO.servidor,
      Puerto: SMTP_FIJO.puerto,
      UsuarioSmtp: v.email.trim(),
      ClaveSmtp: v.claveSmtp,
      UsarSsl: SMTP_FIJO.ssl,
      Vigente: v.vigente,
      ImagenEncabezado: this.imagenEncabezadoPreview() || null,
    };

    const id = this.editingId();
    const peticion = id
      ? this.cuentaEmailService.update(id, request)
      : this.cuentaEmailService.create(request);

    this.saving.set(true);
    peticion.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: () => {
        this.toast.success('Éxito', id ? 'Cuenta actualizada correctamente' : 'Cuenta creada correctamente');
        this.nuevo();
        this.cargarCuentas();
      },
      error: () =>
        this.toast.error('Error', id ? 'No se pudo actualizar la cuenta' : 'No se pudo crear la cuenta'),
    });
  }

  // ── Imagen de encabezado ─────────────────────────────────────────────────

  onImagenEncabezado(file: File): void {
    this.subiendoImagenEncabezado.set(true);
    this.cuentaEmailService
      .uploadImagenEncabezado(file)
      .pipe(finalize(() => this.subiendoImagenEncabezado.set(false)))
      .subscribe({
        next: (resp) => {
          if (!resp?.success) {
            this.toast.warning('Encabezado', 'No fue posible cargar la imagen.');
            return;
          }
          this.imagenEncabezadoPreview.set(resp.url);
          this.nombreImagenEncabezado.set(file.name);
          this.toast.success('Encabezado', 'Imagen cargada correctamente.');
        },
        error: () => this.toast.error('Encabezado', 'Error al subir la imagen.'),
      });
  }

  quitarImagenEncabezado(): void {
    this.imagenEncabezadoPreview.set('');
    this.nombreImagenEncabezado.set('');
  }

  readonly maxEncabezadoBytes = MAX_ENCABEZADO_BYTES;

  onErrorImagenEncabezado(mensaje: string): void {
    this.toast.warning('Encabezado', mensaje);
  }

  // ── Acciones de la tabla de cuentas ──────────────────────────────────────

  onAccionCuenta(ev: UiTableActionEvent<DtoCuentaEmail>): void {
    if (ev.actionId === 'autorizaciones') this.abrirAutorizaciones(ev.row);
    else if (ev.actionId === 'editar') this.editar(ev.row);
    else if (ev.actionId === 'eliminar') void this.eliminar(ev.row);
  }

  /**
   * El confirm() del navegador bloquea el hilo y no respeta ni el tema ni la
   * escala de fuente de la aplicación; el resto de administración ya usa el
   * diálogo del kit.
   */
  async eliminar(item: DtoCuentaEmail): Promise<void> {
    const confirmado = await this.alert.confirm({
      title: 'Eliminar cuenta de correo',
      message: `¿Desea eliminar la cuenta “${item.nombreCuenta}”? La acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      cancelText: 'No, cancelar',
      icon: 'warning',
      intent: 'danger',
      focusCancel: true,
    });
    if (!confirmado) return;

    this.cuentaEmailService.delete(item.idCuenta).subscribe({
      next: () => {
        this.toast.success('Éxito', 'Cuenta eliminada');
        if (this.editingId() === item.idCuenta) this.nuevo();
        if (this.cuentaAutorizacion()?.idCuenta === item.idCuenta) this.cerrarAutorizaciones();
        this.cargarCuentas();
      },
      error: () => this.toast.error('Error', 'No se pudo eliminar la cuenta'),
    });
  }

  // ── Autorizaciones ───────────────────────────────────────────────────────

  abrirAutorizaciones(item: DtoCuentaEmail): void {
    this.cuentaAutorizacion.set(item);
    this.resultadosUsuarios.set([]);
    this.busquedaHecha.set(false);
    this.cargarAutorizaciones();
  }

  cerrarAutorizaciones(): void {
    this.cuentaAutorizacion.set(null);
    this.listaAutorizados.set([]);
    this.resultadosUsuarios.set([]);
    this.busquedaHecha.set(false);
  }

  cargarAutorizaciones(): void {
    const cuenta = this.cuentaAutorizacion();
    if (!cuenta) return;

    this.loadingAutorizados.set(true);
    this.cuentaEmailService
      .getAutorizaciones(cuenta.idCuenta, undefined, 1)
      .pipe(finalize(() => this.loadingAutorizados.set(false)))
      .subscribe({
        next: (data) => this.listaAutorizados.set(data ?? []),
        error: () => this.toast.error('Error', 'No se pudieron cargar los usuarios autorizados'),
      });
  }

  buscarUsuarios(termino: string): void {
    const term = (termino ?? '').trim();
    if (term.length < 3) {
      this.toast.warning('Búsqueda', 'Escribe al menos 3 caracteres');
      return;
    }

    this.loadingBusquedaUsuarios.set(true);
    this.usuarioAdminService
      .getListadoUsuarios(term)
      .pipe(finalize(() => this.loadingBusquedaUsuarios.set(false)))
      .subscribe({
        next: (data) => {
          this.resultadosUsuarios.set(data ?? []);
          this.busquedaHecha.set(true);
        },
        error: () => this.toast.error('Error', 'No se pudo consultar usuarios'),
      });
  }

  limpiarBusqueda(): void {
    this.resultadosUsuarios.set([]);
    this.busquedaHecha.set(false);
  }

  onAccionBusqueda(ev: UiTableActionEvent<UsuarioListadoItem>): void {
    if (ev.actionId === 'autorizar') this.agregarAutorizado(ev.row);
  }

  agregarAutorizado(user: UsuarioListadoItem): void {
    const cuenta = this.cuentaAutorizacion();
    if (!cuenta) return;

    if (this.listaAutorizados().some((x) => x.idUsuario === user.idUsuario)) {
      this.toast.warning('Autorizaciones', 'El usuario ya está autorizado en esta cuenta');
      return;
    }

    this.savingAutorizacion.set(true);
    this.cuentaEmailService
      .crearAutorizacion({ idCuenta: cuenta.idCuenta, idUsuario: user.idUsuario })
      .pipe(finalize(() => this.savingAutorizacion.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('Éxito', 'Usuario autorizado correctamente');
          this.cargarAutorizaciones();
        },
        error: (err) =>
          this.toast.error('Error', err?.error?.message ?? 'No se pudo autorizar el usuario'),
      });
  }

  onAccionAutorizado(ev: UiTableActionEvent<DtoCuentaEmailUsuario>): void {
    if (ev.actionId === 'quitar') void this.quitarAutorizado(ev.row);
  }

  /**
   * Sustituye al diálogo de confirmación escrito a mano en la plantilla
   * (con su propio estado, su @HostListener de Escape y su marcado .ui-alert
   * duplicado): es el mismo diálogo del kit que usa el resto del área.
   */
  async quitarAutorizado(item: DtoCuentaEmailUsuario): Promise<void> {
    const confirmado = await this.alert.confirm({
      title: '¿Quitar autorización?',
      message: `Se quitará el acceso de “${item.usuarioLogin}” a esta cuenta de correo.`,
      confirmText: 'Sí, quitar autorización',
      cancelText: 'Cancelar',
      icon: 'warning',
      intent: 'danger',
      focusCancel: true,
    });
    if (!confirmado) return;

    this.savingAutorizacion.set(true);
    this.cuentaEmailService
      .eliminarAutorizacion(item.idCuentaUsuario)
      .pipe(finalize(() => this.savingAutorizacion.set(false)))
      .subscribe({
        next: () => {
          this.toast.success('Éxito', 'Autorización removida');
          this.cargarAutorizaciones();
        },
        error: (err) =>
          this.toast.error('Error', err?.error?.message ?? 'No se pudo quitar la autorización'),
      });
  }
}
