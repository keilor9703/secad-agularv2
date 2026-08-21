import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  computed,
  forwardRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface UiIconOption {
  readonly value: string;
  readonly label: string;
  readonly category: string;
}

type UiIconDefinition = readonly [name: string, label: string];

function iconOptions(
  category: string,
  definitions: readonly UiIconDefinition[],
  family: 'solid' | 'brands' = 'solid',
): UiIconOption[] {
  return definitions.map(([name, label]) => ({
    value: `fa-${family} fa-${name}`,
    label,
    category,
  }));
}

/*
 * Catálogo curado sobre Font Awesome Free 7.x. Se evita exponer los más de
 * dos mil glifos instalados porque un selector administrativo debe ser rápido,
 * entendible y consistente con los destinos reales del sistema.
 */
const UI_ICON_OPTIONS: readonly UiIconOption[] = [
  ...iconOptions('Navegación', [
    ['house', 'Inicio'],
    ['gauge-high', 'Panel de control'],
    ['bars', 'Menú'],
    ['sitemap', 'Estructura'],
    ['folder-tree', 'Carpeta jerárquica'],
    ['folder', 'Carpeta'],
    ['folder-open', 'Carpeta abierta'],
    ['link', 'Enlace'],
    ['globe', 'Sitio web'],
    ['earth-americas', 'Cobertura nacional'],
    ['map', 'Mapa'],
    ['map-location-dot', 'Mapa de ubicación'],
    ['location-dot', 'Punto de ubicación'],
    ['route', 'Ruta'],
    ['compass', 'Orientación'],
    ['anchor', 'Acceso fijo'],
    ['layer-group', 'Capas de navegación'],
    ['grip', 'Cuadrícula de aplicaciones'],
    ['bookmark', 'Marcador'],
    ['door-open', 'Entrada'],
    ['arrow-left', 'Regresar'],
    ['arrow-right', 'Continuar'],
    ['arrow-up', 'Subir'],
    ['arrow-down', 'Bajar'],
    ['angles-right', 'Avanzar niveles'],
    ['circle-arrow-right', 'Ir al destino'],
    ['up-right-from-square', 'Abrir externamente'],
    ['right-from-bracket', 'Salir'],
  ]),
  ...iconOptions('Personas y acceso', [
    ['users', 'Usuarios'],
    ['user', 'Usuario'],
    ['user-shield', 'Usuario protegido'],
    ['id-card', 'Identificación'],
    ['shield-halved', 'Seguridad'],
    ['address-book', 'Directorio'],
    ['address-card', 'Ficha de contacto'],
    ['circle-user', 'Perfil'],
    ['fingerprint', 'Identidad biométrica'],
    ['key', 'Credenciales'],
    ['lock', 'Acceso restringido'],
    ['unlock-keyhole', 'Acceso habilitado'],
    ['user-check', 'Usuario validado'],
    ['user-gear', 'Configuración de usuario'],
    ['user-group', 'Grupo de usuarios'],
    ['user-lock', 'Usuario bloqueado'],
    ['user-plus', 'Agregar usuario'],
    ['user-tie', 'Funcionario'],
    ['users-gear', 'Administrar usuarios'],
    ['people-group', 'Equipo'],
    ['user-secret', 'Usuario reservado'],
    ['user-pen', 'Editar usuario'],
    ['user-xmark', 'Retirar usuario'],
    ['user-clock', 'Usuario pendiente'],
    ['person', 'Persona'],
    ['person-walking', 'Persona en desplazamiento'],
    ['person-circle-check', 'Persona verificada'],
    ['person-circle-exclamation', 'Persona con novedad'],
    ['children', 'Infancia'],
    ['people-arrows-left-right', 'Interacción de personas'],
    ['users-viewfinder', 'Localizar usuarios'],
  ]),
  ...iconOptions('Seguridad', [
    ['shield', 'Protección'],
    ['shield-heart', 'Protección ciudadana'],
    ['shield-virus', 'Protección sanitaria'],
    ['lock-open', 'Acceso abierto'],
    ['eye-slash', 'Contenido reservado'],
    ['bug', 'Incidente técnico'],
    ['bug-slash', 'Incidente solucionado'],
    ['circle-check', 'Aprobado'],
    ['circle-xmark', 'Rechazado'],
    ['circle-exclamation', 'Alerta'],
    ['skull-crossbones', 'Peligro'],
    ['life-ring', 'Ayuda de emergencia'],
    ['fire', 'Incendio'],
    ['crosshairs', 'Objetivo'],
    ['person-circle-question', 'Identidad por verificar'],
    ['user-large-slash', 'Acceso denegado'],
  ]),
  ...iconOptions('Gestión', [
    ['gears', 'Configuración'],
    ['sliders', 'Parámetros'],
    ['wrench', 'Herramientas'],
    ['briefcase', 'Gestión'],
    ['building', 'Institución'],
    ['building-columns', 'Entidad'],
    ['landmark', 'Sede institucional'],
    ['clipboard-list', 'Listado'],
    ['list-check', 'Tareas verificadas'],
    ['table', 'Tabla'],
    ['tags', 'Clasificación'],
    ['thumbtack', 'Fijar'],
    ['signature', 'Firma'],
    ['calculator', 'Cálculos'],
    ['barcode', 'Código de barras'],
    ['qrcode', 'Código QR'],
    ['receipt', 'Comprobante'],
    ['wallet', 'Cartera'],
    ['coins', 'Presupuesto'],
    ['box', 'Elemento'],
    ['boxes-stacked', 'Inventario'],
    ['box-archive', 'Archivo físico'],
    ['pen', 'Editar'],
    ['pen-to-square', 'Editar registro'],
    ['pencil', 'Modificar'],
    ['plus', 'Agregar'],
    ['minus', 'Retirar'],
    ['circle-plus', 'Agregar elemento'],
    ['circle-minus', 'Quitar elemento'],
    ['rotate', 'Recargar'],
    ['sort', 'Ordenar'],
    ['arrow-down-short-wide', 'Orden descendente'],
    ['check', 'Confirmar'],
    ['xmark', 'Cancelar'],
    ['ellipsis-vertical', 'Más acciones'],
    ['toggle-on', 'Estado activo'],
    ['toggle-off', 'Estado inactivo'],
  ]),
  ...iconOptions('Comunicación', [
    ['envelope', 'Correo'],
    ['comments', 'Mensajes'],
    ['bell', 'Notificaciones'],
    ['bullhorn', 'Comunicados'],
    ['phone', 'Teléfono'],
    ['headset', 'Soporte'],
    ['paper-plane', 'Enviar'],
    ['paperclip', 'Adjunto'],
    ['share-nodes', 'Compartir'],
    ['wifi', 'Conectividad'],
    ['radio', 'Emisora'],
    ['tower-broadcast', 'Transmisión'],
    ['satellite-dish', 'Señal satelital'],
    ['tower-cell', 'Red móvil'],
    ['inbox', 'Bandeja de entrada'],
    ['at', 'Dirección electrónica'],
    ['comment', 'Comentario'],
    ['message', 'Mensaje directo'],
    ['comment-dots', 'Conversación'],
    ['envelope-open-text', 'Correo abierto'],
    ['fax', 'Fax'],
    ['microphone', 'Micrófono'],
    ['volume-high', 'Audio'],
    ['podcast', 'Pódcast'],
    ['rss', 'Canal de novedades'],
    ['language', 'Idiomas'],
  ]),
  ...iconOptions('Archivos', [
    ['file-lines', 'Documento'],
    ['file-arrow-down', 'Descargar archivo'],
    ['file-circle-check', 'Archivo aprobado'],
    ['file-contract', 'Contrato'],
    ['file-export', 'Exportar'],
    ['file-import', 'Importar'],
    ['file-invoice', 'Factura'],
    ['file-pdf', 'Documento PDF'],
    ['copy', 'Copiar'],
    ['download', 'Descargar'],
    ['upload', 'Cargar'],
    ['cloud-arrow-up', 'Cargar a la nube'],
    ['print', 'Imprimir'],
    ['floppy-disk', 'Guardar'],
    ['database', 'Base de datos'],
    ['server', 'Servidor'],
    ['file', 'Archivo'],
    ['file-word', 'Documento Word'],
    ['file-excel', 'Hoja de cálculo'],
    ['file-powerpoint', 'Presentación'],
    ['file-image', 'Archivo de imagen'],
    ['file-video', 'Archivo de video'],
    ['file-audio', 'Archivo de audio'],
    ['file-zipper', 'Archivo comprimido'],
    ['file-code', 'Archivo de código'],
    ['file-csv', 'Archivo CSV'],
    ['folder-plus', 'Crear carpeta'],
    ['folder-minus', 'Retirar carpeta'],
    ['cloud-arrow-down', 'Descargar de la nube'],
    ['hard-drive', 'Almacenamiento'],
  ]),
  ...iconOptions('Análisis', [
    ['chart-pie', 'Estadísticas'],
    ['chart-column', 'Reporte de barras'],
    ['square-poll-vertical', 'Indicadores'],
    ['arrow-trend-up', 'Tendencia'],
    ['timeline', 'Línea de tiempo'],
    ['diagram-project', 'Flujo de procesos'],
    ['network-wired', 'Red de información'],
    ['filter', 'Filtrar'],
    ['magnifying-glass', 'Consulta'],
    ['eye', 'Visualizar'],
    ['chart-line', 'Gráfico de líneas'],
    ['chart-area', 'Gráfico de área'],
    ['chart-simple', 'Resumen estadístico'],
    ['chart-gantt', 'Cronograma'],
    ['signal', 'Nivel de actividad'],
    ['ranking-star', 'Clasificación destacada'],
    ['percent', 'Porcentaje'],
    ['list-ol', 'Listado ordenado'],
    ['table-columns', 'Columnas de datos'],
    ['magnifying-glass-chart', 'Análisis de datos'],
  ]),
  ...iconOptions('Contenido', [
    ['calendar-days', 'Calendario'],
    ['cart-shopping', 'Compras'],
    ['graduation-cap', 'Capacitación'],
    ['book-open', 'Biblioteca'],
    ['newspaper', 'Noticias'],
    ['video', 'Video'],
    ['image', 'Imágenes'],
    ['camera', 'Cámara'],
    ['camera-retro', 'Galería fotográfica'],
    ['school', 'Centro educativo'],
    ['chalkboard-user', 'Formación'],
    ['person-chalkboard', 'Instructor'],
    ['code', 'Código'],
    ['laptop-code', 'Desarrollo'],
    ['calendar', 'Agenda'],
    ['calendar-check', 'Evento confirmado'],
    ['calendar-plus', 'Crear evento'],
    ['calendar-minus', 'Retirar evento'],
    ['clock', 'Hora'],
    ['clock-rotate-left', 'Historial'],
    ['book', 'Libro'],
    ['book-atlas', 'Consulta geográfica'],
    ['photo-film', 'Contenido multimedia'],
    ['film', 'Producción audiovisual'],
    ['music', 'Contenido sonoro'],
    ['palette', 'Diseño visual'],
    ['pen-nib', 'Publicación editorial'],
  ]),
  ...iconOptions('Tecnología', [
    ['desktop', 'Equipo de escritorio'],
    ['laptop', 'Equipo portátil'],
    ['mobile-screen-button', 'Dispositivo móvil'],
    ['tablet-screen-button', 'Tableta'],
    ['microchip', 'Procesamiento'],
    ['memory', 'Memoria'],
    ['cloud', 'Servicios en la nube'],
    ['code-branch', 'Rama de código'],
    ['terminal', 'Terminal'],
    ['robot', 'Automatización'],
    ['plug', 'Integración'],
    ['ethernet', 'Red cableada'],
    ['keyboard', 'Teclado'],
    ['computer-mouse', 'Dispositivo apuntador'],
    ['satellite', 'Satélite'],
    ['sim-card', 'Tarjeta SIM'],
  ]),
  ...iconOptions('Jurídico', [
    ['scale-balanced', 'Justicia'],
    ['gavel', 'Decisión jurídica'],
    ['scroll', 'Acto administrativo'],
    ['stamp', 'Documento sellado'],
    ['landmark-flag', 'Entidad oficial'],
    ['book-bookmark', 'Normativa'],
    ['file-signature', 'Documento firmado'],
    ['handshake', 'Acuerdo'],
    ['handshake-simple', 'Compromiso'],
    ['people-roof', 'Comunidad'],
  ]),
  ...iconOptions('Estados y acciones', [
    ['ticket', 'Solicitudes'],
    ['flag', 'Indicadores'],
    ['circle-info', 'Información'],
    ['award', 'Reconocimiento'],
    ['medal', 'Distinción'],
    ['certificate', 'Certificación'],
    ['star', 'Destacado'],
    ['check-double', 'Verificado'],
    ['bolt', 'Acción rápida'],
    ['ban', 'Restringido'],
    ['triangle-exclamation', 'Advertencia'],
    ['arrows-rotate', 'Actualizar'],
    ['trash-can', 'Eliminar'],
  ]),
  ...iconOptions('Operativo', [
    ['building-shield', 'Instalación protegida'],
    ['person-military-pointing', 'Orientación operativa'],
    ['person-military-rifle', 'Servicio armado'],
    ['person-military-to-person', 'Coordinación operativa'],
    ['car-side', 'Vehículo institucional'],
    ['car', 'Automóvil'],
    ['motorcycle', 'Motocicleta'],
    ['road', 'Vías'],
    ['walkie-talkie', 'Radiocomunicación'],
    ['helmet-safety', 'Seguridad operacional'],
    ['vest', 'Chaleco'],
    ['vest-patches', 'Chaleco identificado'],
    ['shield-dog', 'Unidad canina'],
    ['handcuffs', 'Capturas'],
    ['gun', 'Armamento'],
    ['traffic-light', 'Tránsito'],
    ['passport', 'Control migratorio'],
    ['plane', 'Aviación'],
    ['truck-medical', 'Emergencias'],
    ['fire-extinguisher', 'Control de incendios'],
    ['house-medical', 'Atención médica'],
    ['hospital', 'Hospital'],
    ['briefcase-medical', 'Sanidad'],
    ['binoculars', 'Observación'],
    ['helicopter', 'Operación aérea'],
    ['ship', 'Operación marítima'],
    ['truck', 'Vehículo de carga'],
    ['truck-fast', 'Respuesta rápida'],
    ['bus', 'Transporte colectivo'],
    ['bicycle', 'Bicicleta'],
    ['person-running', 'Respuesta operativa'],
    ['location-crosshairs', 'Ubicación precisa'],
    ['road-barrier', 'Control vial'],
    ['person-shelter', 'Atención humanitaria'],
  ]),
  ...iconOptions('Salud', [
    ['user-doctor', 'Personal médico'],
    ['user-nurse', 'Personal de enfermería'],
    ['stethoscope', 'Consulta médica'],
    ['heart-pulse', 'Estado de salud'],
    ['kit-medical', 'Botiquín'],
    ['syringe', 'Vacunación'],
    ['pills', 'Medicamentos'],
    ['capsules', 'Tratamiento'],
    ['virus', 'Riesgo biológico'],
    ['biohazard', 'Material biológico'],
    ['notes-medical', 'Historia clínica'],
    ['hand-holding-medical', 'Asistencia médica'],
  ]),
  ...iconOptions('Financiero', [
    ['money-bill', 'Dinero'],
    ['money-check-dollar', 'Pago autorizado'],
    ['credit-card', 'Tarjeta'],
    ['sack-dollar', 'Recursos financieros'],
    ['piggy-bank', 'Ahorro'],
    ['cash-register', 'Caja'],
    ['file-invoice-dollar', 'Cuenta de cobro'],
    ['hand-holding-dollar', 'Entrega de recursos'],
  ]),
  ...iconOptions('Infraestructura', [
    ['city', 'Ciudad'],
    ['warehouse', 'Bodega'],
    ['industry', 'Instalación industrial'],
    ['shop', 'Punto de atención'],
    ['hotel', 'Alojamiento'],
    ['house-chimney', 'Vivienda'],
    ['house-flag', 'Sede territorial'],
    ['door-closed', 'Acceso cerrado'],
    ['elevator', 'Ascensor'],
    ['restroom', 'Servicios'],
    ['square-parking', 'Estacionamiento'],
  ]),
  ...iconOptions(
    'Redes sociales',
    [
      ['facebook-f', 'Facebook'],
      ['instagram', 'Instagram'],
      ['x-twitter', 'X'],
      ['youtube', 'YouTube'],
      ['whatsapp', 'WhatsApp'],
      ['linkedin-in', 'LinkedIn'],
      ['telegram', 'Telegram'],
      ['tiktok', 'TikTok'],
      ['github', 'GitHub'],
      ['google-drive', 'Google Drive'],
    ],
    'brands',
  ),
];

let nextUiIconPickerId = 0;
type UiIconPanelPlacement = 'above' | 'below';

interface UiIconPanelStyles {
  readonly top: string;
  readonly left: string;
  readonly width: string;
  readonly maxHeight: string;
}

@Component({
  selector: 'app-ui-icon-picker',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => UiIconPickerComponent),
      multi: true,
    },
  ],
  templateUrl: './ui-icon-picker.component.html',
  styleUrl: './ui-icon-picker.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiIconPickerComponent implements ControlValueAccessor, OnDestroy {
  private readonly elementRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly documentRef = inject(DOCUMENT);
  private readonly windowRef = this.documentRef.defaultView;

  readonly label = input('Icono');
  readonly placeholder = input('Seleccione un icono');
  readonly hint = input('');
  readonly error = input('');
  readonly required = input(false);
  readonly clearable = input(true);
  readonly density = input<'default' | 'compact'>('default');

  readonly value = signal('');
  readonly opened = signal(false);
  readonly searchTerm = signal('');
  readonly selectedCategory = signal('Todos');
  readonly disabledState = signal(false);
  readonly panelPlacement = signal<UiIconPanelPlacement>('below');
  readonly panelPositioned = signal(false);
  readonly panelStyles = signal<UiIconPanelStyles>({
    top: '0px',
    left: '-10000px',
    width: '0px',
    maxHeight: '390px',
  });

  readonly controlId = `ui-icon-picker-${++nextUiIconPickerId}`;
  readonly labelId = `${this.controlId}-label`;
  readonly panelId = `${this.controlId}-panel`;

  readonly categories = [
    'Todos',
    ...new Set(UI_ICON_OPTIONS.map((option) => option.category)),
  ] as const;

  readonly filteredOptions = computed(() => {
    const term = this.normalize(this.searchTerm());
    const category = this.selectedCategory();

    return UI_ICON_OPTIONS.filter(
      (option) =>
        (category === 'Todos' || option.category === category) &&
        (!term ||
          this.normalize(`${option.label} ${option.value} ${option.category}`).includes(term)),
    );
  });

  readonly selectedOption = computed(
    () => UI_ICON_OPTIONS.find((option) => option.value === this.value()) ?? null,
  );

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private panelAnimationFrame: number | null = null;
  private readonly handleViewportChange = (event: Event): void => {
    const panel =
      this.elementRef.nativeElement.querySelector<HTMLElement>('.ui-icon-picker__panel');

    if (event.target && panel?.contains(event.target as Node)) {
      return;
    }

    if (this.opened()) {
      this.schedulePanelPosition();
    }
  };

  constructor() {
    this.documentRef.addEventListener('scroll', this.handleViewportChange, true);
    this.windowRef?.addEventListener('resize', this.handleViewportChange);
  }

  ngOnDestroy(): void {
    this.documentRef.removeEventListener('scroll', this.handleViewportChange, true);
    this.windowRef?.removeEventListener('resize', this.handleViewportChange);
    this.cancelPanelPosition();
  }

  writeValue(value: string | null | undefined): void {
    this.value.set(typeof value === 'string' ? value : '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabledState.set(disabled);

    if (disabled) {
      this.close();
    }
  }

  toggle(): void {
    if (this.disabledState()) {
      return;
    }

    if (this.opened()) {
      this.close();
      this.onTouched();
      return;
    }

    this.opened.set(true);
    this.searchTerm.set('');
    this.panelPositioned.set(false);
    this.schedulePanelPosition();
  }

  select(option: UiIconOption): void {
    this.value.set(option.value);
    this.onChange(option.value);
    this.onTouched();
    this.close();
  }

  clear(event: MouseEvent): void {
    event.stopPropagation();

    if (this.disabledState()) {
      return;
    }

    this.value.set('');
    this.onChange('');
    this.onTouched();
  }

  updateSearch(event: Event): void {
    const target = event.target;
    this.searchTerm.set(target instanceof HTMLInputElement ? target.value : '');
    this.schedulePanelPosition();
  }

  selectCategory(category: string): void {
    this.selectedCategory.set(category);
    this.schedulePanelPosition();
  }

  handleTriggerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault();
      this.opened.set(true);
    }
  }

  @HostListener('document:click', ['$event'])
  handleDocumentClick(event: MouseEvent): void {
    if (!this.opened() || this.elementRef.nativeElement.contains(event.target as Node)) {
      return;
    }

    this.close();
    this.onTouched();
  }

  @HostListener('document:keydown.escape')
  handleEscape(): void {
    if (!this.opened()) {
      return;
    }

    this.close();
    this.onTouched();
  }

  private close(): void {
    this.opened.set(false);
    this.searchTerm.set('');
    this.panelPositioned.set(false);
    this.cancelPanelPosition();
  }

  private schedulePanelPosition(): void {
    if (!this.windowRef) {
      return;
    }

    this.cancelPanelPosition();
    this.panelAnimationFrame = this.windowRef.requestAnimationFrame(() => {
      this.panelAnimationFrame = null;
      this.updatePanelPosition();
    });
  }

  private cancelPanelPosition(): void {
    if (this.panelAnimationFrame === null || !this.windowRef) {
      return;
    }

    this.windowRef.cancelAnimationFrame(this.panelAnimationFrame);
    this.panelAnimationFrame = null;
  }

  private updatePanelPosition(): void {
    if (!this.opened() || !this.windowRef) {
      return;
    }

    const host = this.elementRef.nativeElement;
    const control = host.querySelector<HTMLElement>('.ui-icon-picker__trigger');
    const panel = host.querySelector<HTMLElement>('.ui-icon-picker__panel');

    if (!control || !panel) {
      return;
    }

    const controlRect = control.getBoundingClientRect();
    const viewportWidth = this.windowRef.innerWidth;
    const viewportHeight = this.windowRef.innerHeight;
    const viewportMargin = viewportWidth <= 760 ? 8 : 12;
    const panelGap = 7;
    const footerInset = this.mobileFooterInset(viewportWidth);
    const visibleBottom = viewportHeight - footerInset;
    const maximumPanelHeight = Math.min(410, visibleBottom - viewportMargin * 2);
    const naturalPanelHeight = Math.min(Math.max(panel.scrollHeight, 260), maximumPanelHeight);
    const spaceAbove = Math.max(0, controlRect.top - viewportMargin - panelGap);
    const spaceBelow = Math.max(0, visibleBottom - controlRect.bottom - panelGap);
    const minimumComfortableHeight = Math.min(naturalPanelHeight, 280);
    const placement: UiIconPanelPlacement =
      spaceBelow < minimumComfortableHeight && spaceAbove > spaceBelow ? 'above' : 'below';
    const availableHeight = placement === 'above' ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(110, Math.min(maximumPanelHeight, Math.floor(availableHeight)));
    const renderedHeight = Math.min(panel.scrollHeight, maxHeight);
    const maximumPanelWidth = Math.max(0, viewportWidth - viewportMargin * 2);
    const desiredPanelWidth = Math.max(controlRect.width, 420);
    const panelWidth = Math.min(desiredPanelWidth, maximumPanelWidth);
    const panelLeft = Math.min(
      Math.max(controlRect.left, viewportMargin),
      viewportWidth - viewportMargin - panelWidth,
    );
    const panelTop =
      placement === 'above'
        ? Math.max(viewportMargin, controlRect.top - panelGap - renderedHeight)
        : Math.min(controlRect.bottom + panelGap, visibleBottom - renderedHeight);

    this.panelPlacement.set(placement);
    this.panelStyles.set({
      top: `${Math.round(panelTop)}px`,
      left: `${Math.round(panelLeft)}px`,
      width: `${Math.round(panelWidth)}px`,
      maxHeight: `${Math.round(maxHeight)}px`,
    });
    this.panelPositioned.set(true);
  }

  private mobileFooterInset(viewportWidth: number): number {
    if (viewportWidth > 760 || !this.windowRef) {
      return 12;
    }

    const configuredHeight = Number.parseFloat(
      this.windowRef
        .getComputedStyle(this.documentRef.documentElement)
        .getPropertyValue('--footer-height'),
    );

    return (Number.isFinite(configuredHeight) ? configuredHeight : 78) + 8;
  }

  private normalize(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('es')
      .trim();
  }
}
