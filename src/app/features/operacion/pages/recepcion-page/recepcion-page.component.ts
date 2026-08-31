import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  AfterViewInit,
  NgZone,
  ElementRef,
  computed,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { FormsModule } from '@angular/forms';
// Antes era `declare const L` con Leaflet llegando por <script> del CDN. La CSP
// de la plantilla es script-src 'self', así que ese script no cargaría.
import * as L from 'leaflet';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiButtonComponent } from '../../../../shared/components/ui-button/ui-button.component';
import { UiInputComponent } from '../../../../shared/components/ui-input/ui-input.component';
import { UiSelectComponent } from '../../../../shared/components/ui-select/ui-select.component';
import { UiBadgeComponent } from '../../../../shared/components/ui-badge/ui-badge.component';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiSpinnerComponent } from '../../../../shared/components/ui-spinner/ui-spinner.component';
import { UiModalComponent } from '../../../../shared/components/ui-modal/ui-modal.component';
import { UiFileUploadComponent } from '../../../../shared/components/ui-file-upload/ui-file-upload.component';
import { UiSelectOption } from '../../../../shared/interfaces/ui-select-option.interface';
import { Subject, interval } from 'rxjs';
import { debounceTime, distinctUntilChanged, takeUntil } from 'rxjs/operators';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import {
  RecepcionService,
  DtoCanalRecepcion,
  DtoCanalSeleccionado,
  DtoCasoItem,
  DtoReferenciaSecad,
  DtoLlamadaAsociar,
  DtoRecepcion,
  DtoPedidoCercano,
  DtoAdjunto,
  OrigenEvento
} from '../../../../core/services/operacion/recepcion.service';
import {
  AsistenteService,
  AsistenteCategoria,
  AsistentePregunta,
  parsearOpciones
} from '../../../../core/services/operacion/asistente.service';
import {
  AgenciaExternaService,
  DtoAgenciaExterna
} from '../../../../core/services/operacion/agencia-externa.service';

export interface GrupoCanal {
  fuerza: string;
  fuerzaId: number;
  canales: DtoCanalRecepcion[];
}

@Component({
  selector: 'app-recepcion-page',
  standalone: true,
  imports: [
    FormsModule,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
    UiButtonComponent,
    UiInputComponent,
    UiSelectComponent,
    UiBadgeComponent,
    UiChipComponent,
    UiSpinnerComponent,
    UiModalComponent,
    UiFileUploadComponent,
  ],
  templateUrl: './recepcion-page.component.html',
  styleUrls: ['./recepcion-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RecepcionPageComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── JWT claims ────────────────────────────────────────────────────────────
  sitioGraba = 0;
  acd        = 0;
  fuerzaId   = 0;
  codDane    = '';
  usuario    = '';

  // ── Header fields ─────────────────────────────────────────────────────────
  readonly txtFechaIngreso = signal('');
  readonly txtNumeLlamada  = signal('');
  txtAcd          = '';

  // ── Fieldset Llamada ──────────────────────────────────────────────────────
  readonly txtAbonado        = signal('');
  readonly txtPropAbonado    = signal('');
  readonly txtDispTelefonico = signal('');
  readonly hdnCodDispTelefonico = signal('');
  readonly hdnCeldaMarcacion    = signal('');
  readonly txtNombreLlamante = signal('');
  readonly txtDireLlamante   = signal('');

  // ── Fieldset Datos ────────────────────────────────────────────────────────
  readonly txtCodigCaso  = signal('');
  readonly txtDescaso    = signal('');
  readonly txtCodigCaso2 = signal('');
  readonly txtDescaso2   = signal('');
  readonly txtCiudadCaso = signal('');
  readonly txtBarrioCaso = signal('');
  readonly txtDireCaso   = signal('');
  readonly latitudCaso   = signal('');
  readonly longitudCaso  = signal('');
  readonly txtAsociarLlamada = signal('');
  readonly tipoPedido        = signal('');
  readonly caliPedido        = signal('');

  // ── Prioridad / Importancia ───────────────────────────────────────────────
  readonly prioridad   = signal('03');
  readonly importancia = signal('01');

  // ── Map ───────────────────────────────────────────────────────────────────
  direccionBusqueda = '';
  // El contenedor se toma por referencia de plantilla: un id global en el DOM
  // se rompe en cuanto dos vistas coexisten durante una transición de ruta.
  readonly mapaRef = viewChild.required<ElementRef<HTMLDivElement>>('mapaDiv');
  private map:             L.Map | null = null;
  private mapMarker:       L.Marker | null = null;
  private municipioLayer:  L.GeoJSON | null = null;
  private cuadrantesLayer: L.GeoJSON | null = null;
  private iconoPersona:    L.DivIcon | null = null;

  // ── Association hidden values ─────────────────────────────────────────────
  readonly hdnNumeLlamadaAsociada = signal('');
  readonly hdnSitioGrabaAsociada  = signal('');

  // ── State ─────────────────────────────────────────────────────────────────
  readonly llamadaEncontrada = signal(false);
  readonly saving            = signal(false);
  minimized         = false;
  visible           = true;

  // ── Data ──────────────────────────────────────────────────────────────────
  readonly gruposCanales = signal<GrupoCanal[]>([]);
  readonly canales       = signal<DtoCanalRecepcion[]>([]);
  readonly refTipoPedido = signal<DtoReferenciaSecad[]>([]);
  readonly refCaliPedido = signal<DtoReferenciaSecad[]>([]);
  readonly casosSugeridos1 = signal<DtoCasoItem[]>([]);
  readonly casosSugeridos2 = signal<DtoCasoItem[]>([]);
  readonly llamadasParaAsociar = signal<DtoLlamadaAsociar[]>([]);
  readonly showModalAsociar = signal(false);
  /** Ventana temporal usada por F_BuscarLlamadasAsociarAsync — debe coincidir
   *  con el INTERVAL '200 minutes' hardcodeado en DbRecepcionRepository.cs. */
  readonly VENTANA_ASOCIAR_MINUTOS = 200;

  // ── Autocomplete subjects ─────────────────────────────────────────────────
  private buscar1$ = new Subject<string>();
  private buscar2$ = new Subject<string>();
  private destroy$ = new Subject<void>();
  private pollTimer: any = null;
  /** Marca de tiempo del último poll PlantaTel exitoso — indicador de salud de la conexión. */
  readonly ultimoPollExitoso = signal<Date | null>(null);
  /** true tras ngOnDestroy — guarda contra fetch() nativos (sin takeUntil) que
   *  resuelven después de navegar fuera del componente. */
  private destruido = false;

  // ── §6.1 Agencias externas ────────────────────────────────────────────────
  readonly agenciasExternas = signal<DtoAgenciaExterna[]>([]);
  readonly agenciasSeleccionadas = signal(new Set<string>());

  // ── §6.8 Detección de duplicados ─────────────────────────────────────────
  readonly duplicados           = signal<DtoPedidoCercano[]>([]);
  readonly verificandoDuplicados = signal(false);
  readonly showDuplicados        = signal(false);
  /** Configuración: radio en metros y ventana temporal en minutos. */
  readonly DUPL_RADIO   = 300;
  readonly DUPL_MINUTOS = 20;
  private duplicadoCheck$ = new Subject<void>();

  // ── §multicanal — Adjuntos (fotos) ──────────────────────────────────────────
  readonly adjuntos          = signal<DtoAdjunto[]>([]);
  readonly adjuntosSubiendo   = signal(false);
  adjuntosDragOver   = false;

  // ── Canal de origen (§multicanal) ────────────────────────────────────────
  /** Valor UI seleccionado por el operador. Se mapea a OrigenEvento al guardar. */
  readonly canalOrigenUI = signal('TEL_123');

  readonly canalesOrigen = [
    { value: 'TEL_123',     label: 'Llamada 112/123',          icon: 'fa-phone-volume'      },
    { value: 'TEL_DIRECTO', label: 'Teléfono directo',         icon: 'fa-phone'             },
    { value: 'RADIO',       label: 'Radio policial',            icon: 'fa-tower-broadcast'   },
    { value: 'CAMPO',       label: 'Reporte de campo',          icon: 'fa-person-running'    },
    { value: 'SUPERVISION', label: 'Supervisión / Iniciativa',  icon: 'fa-shield-halved'     },
    { value: 'TRASLADO',    label: 'Traslado otra entidad',     icon: 'fa-right-left'        },
    { value: 'MANUAL',      label: 'Ingreso manual',            icon: 'fa-keyboard'          },
  ] as const;

  // Opciones de los selectores del kit. En el origen eran <option> sueltos.
  readonly opcionesTipoPedido = computed<UiSelectOption<string>[]>(() => [
    { label: '— Seleccione —', value: '' },
    ...this.refTipoPedido().map(r => ({ label: r.Descripcion, value: r.Codigo })),
  ]);

  readonly opcionesCaliPedido = computed<UiSelectOption<string>[]>(() => [
    { label: '— Seleccione —', value: '' },
    ...this.refCaliPedido().map(r => ({ label: r.Descripcion, value: r.Codigo })),
  ]);

  readonly opcionesCategoriaAsistente = computed<UiSelectOption<string>[]>(() => [
    { label: '— Elija el tipo de incidente —', value: '' },
    ...this.asistenteCategorias().map(c => ({
      label: c.totalPreguntas ? `${c.descripcion} (${c.totalPreguntas})` : c.descripcion,
      value: c.id,
    })),
  ]);

  readonly opcionesPrioridad: UiSelectOption<string>[] = [
    { label: 'Rutina',    value: '03' },
    { label: 'Inmediata', value: '02' },
    { label: 'Flash',     value: '01' },
  ];

  readonly opcionesImportancia: UiSelectOption<string>[] = [
    { label: '1 — máxima', value: '01' },
    { label: '2 — media',  value: '02' },
    { label: '3 — baja',   value: '03' },
  ];

  /** Opciones de una pregunta de selección, ya parseadas del JSON. */
  opcionesPregunta(preg: AsistentePregunta): UiSelectOption<string>[] {
    return [
      { label: 'Seleccione…', value: '' },
      ...parsearOpciones(preg.opciones).map(o => ({ label: o, value: o })),
    ];
  }

  // ── §6.17 Asistente Inteligente ──────────────────────────────────────────────
  readonly asistenteAbierto          = signal(false);
  readonly asistenteCategorias = signal<AsistenteCategoria[]>([]);
  readonly asistenteLoadingCat       = signal(false);
  readonly asistenteCategoriaSel     = signal('');
  readonly asistentePreguntas  = signal<AsistentePregunta[]>([]);
  readonly asistenteLoadingPreg      = signal(false);
  readonly asisParseOpc     = parsearOpciones;

  /** true cuando el asistente se abrió automáticamente por el código de caso */
  readonly asistenteAutoActivado         = signal(false);
  /** Código corto de la categoría (HURTO, RINA…) — elige plantilla narrativa */
  readonly asistenteCategoriaCode        = signal('');
  /** Descripción de la categoría activa (para mostrar el badge de auto-modo) */
  readonly asistenteCategoriaDescripcion = signal('');

  /** Respuestas indexadas por ID de pregunta (string para uniformidad) */
  readonly respuestas = signal<Record<string, string>>({});
  /** Relato construido automáticamente a partir de las respuestas */
  readonly relatoAutomatico  = signal('');
  /** Notas libres del operador que complementan el relato */
  readonly notasAdicionales  = signal('');

  private readonly auth          = inject(AuthService);
  private readonly svc           = inject(RecepcionService);
  private readonly toast         = inject(ToastService);
  private readonly zone          = inject(NgZone);
  private readonly asistenteSvc  = inject(AsistenteService);
  private readonly agenciaSvc    = inject(AgenciaExternaService);

  ngOnInit(): void {
    const claims = this.auth.getJwtClaims();
    this.sitioGraba = claims.sitioGraba;
    this.acd        = claims.acd;
    this.fuerzaId   = claims.fuerzaId;
    this.codDane    = claims.codDane;
    this.usuario    = claims.usuario;
    this.txtAcd     = String(this.acd);

    this.cargarReferencias();
    this.cargarCanales();
    this.cargarAgenciasExternas();
    this.iniciarPollLlamada();

    // Autocomplete debounce (minLength 3)
    this.buscar1$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(q => { if (q.length >= 3) this.doSearchCasos(q, 1); else this.casosSugeridos1.set([]); });

    this.buscar2$.pipe(debounceTime(300), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(q => { if (q.length >= 3) this.doSearchCasos(q, 2); else this.casosSugeridos2.set([]); });

    // §6.8 — Detección de duplicados con debounce de 800 ms
    this.duplicadoCheck$
      .pipe(debounceTime(800), takeUntil(this.destroy$))
      .subscribe(() => this.ejecutarBusquedaDuplicados());

    // Indicador de salud PlantaTel: re-renderiza el badge cada 5s para que "hace Xs"
    // avance visualmente aunque no llegue ninguna llamada nueva. El polling en
    // sí (iniciarPollLlamada) era completamente invisible para el operador —
    // no había forma de distinguir "sin llamadas ahora mismo" de "el poll se
    // rompió y no lo sabe nadie".
    interval(5000).pipe(takeUntil(this.destroy$)).subscribe(() => this.tickReloj.update(t => t + 1));
  }

  /** Señal muda que solo existe para forzar el refresco del badge PlantaTel cada 5s. */
  readonly tickReloj = signal(0);

  ngAfterViewInit(): void {
    this.initMap();
  }

  ngOnDestroy(): void {
    this.destruido = true;
    this.destroy$.next();
    this.destroy$.complete();
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.map) { this.map.off(); this.map.remove(); this.map = null; }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  MAP – Migrado desde JsMapaRecepcion.js (ArcGIS → Leaflet + Nominatim)
  // ══════════════════════════════════════════════════════════════════════════

  private readonly ARCGIS_BASE =
    'https://services3.arcgis.com/8cBoM4o6pnuUb1z1/ArcGIS/rest/services/SIDENCO_SinMalla/FeatureServer';

  // ── Inicialización del mapa ───────────────────────────────────────────────

  private initMap(): void {
    if (typeof L === 'undefined') {
      console.warn('Leaflet no disponible – verifique index.html');
      // Antes el operador no tenía forma de saber por qué no podía fijar la
      // ubicación del incidente salvo mirando la consola del navegador.
      this.toast.error('Mapa', 'No se pudo cargar el mapa. Recargue la página; si persiste, contacte soporte.');
      return;
    }

    // Ícono persona verde (equivalente al crearMunecoVerde() del original)
    this.iconoPersona = L.divIcon({
      className: '',
      html: `<span style="
               display:inline-block;
               font-size:26px;
               line-height:1;
               color:#0a9242;
               filter:drop-shadow(0 1px 2px rgba(0,0,0,.45));
             "><i class="fa-solid fa-person"></i></span>`,
      iconSize:    [26, 30],
      iconAnchor:  [13, 30],
      popupAnchor: [0, -32]
    });

    // Centro inicial: Bogotá (se reemplaza con el municipio del codDane)
    const mapa = L.map(this.mapaRef().nativeElement, { zoomControl: true })
                  .setView([4.7110, -74.0721], 12);
    this.map = mapa;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(mapa);

    // Click: coloca marcador + reverse-geocode → llena campos dirección
    mapa.on('click', (e: L.LeafletMouseEvent) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      this.zone.run(() => {
        this.latitudCaso.set(lat.toFixed(6));
        this.longitudCaso.set(lng.toFixed(6));
        this.colocarMarcador(lat, lng);
        this.dispararVerificacionDuplicados();  // §6.8
      });
      this.reverseGeocode(lat, lng); // ← llena txtDireCaso, txtBarrioCaso, txtCiudadCaso
    });

    // Cargar capas al inicio
    if (this.codDane) {
      this.cargarCapaMunicipios(this.codDane);   // resalta el municipio activo
      this.cargarCapaCuadrantes(this.codDane);   // dibuja cuadrantes en rojo
    }
  }

  // ── Marcador verde persona ────────────────────────────────────────────────

  private colocarMarcador(lat: number, lng: number): void {
    const mapa = this.map;
    if (!mapa) return;
    if (this.mapMarker) mapa.removeLayer(this.mapMarker);
    // El icono se crea en initMap(), así que a esta altura siempre existe; el
    // ?? undefined es solo para que Leaflet caiga en su marcador por defecto
    // si alguna vez se llamara antes.
    this.mapMarker = L.marker([lat, lng], { icon: this.iconoPersona ?? undefined }).addTo(mapa);
  }

  // ── Reverse-geocode (Nominatim) → rellena campos dirección ───────────────
  // Equivalente a obtenerDireccionPorCoordenadas() del original

  private reverseGeocode(lat: number, lng: number): void {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`;
    fetch(url)
      .then(r => r.json())
      .then((data: any) => {
        if (this.destruido || !data?.address) return;
        const a = data.address;

        const calle   = a.road ?? a.pedestrian ?? a.path ?? a.footway ?? '';
        const num     = a.house_number ? ` # ${a.house_number}` : '';
        const dir     = (calle + num).trim() || (data.display_name ?? '');
        const barrio  = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.district ?? '';
        const ciudad  = a.city ?? a.town ?? a.municipality ?? a.county ?? '';

        this.zone.run(() => {
          // Solo la dirección del INCIDENTE — "Dirección de quien llama" es un
          // campo distinto y editable por el operador; pisarlo aquí borraba
          // silenciosamente cualquier valor digitado manualmente cada vez que
          // el operador tocaba el mapa o buscaba una dirección.
          this.txtDireCaso.set(dir);
          this.txtBarrioCaso.set(barrio);
          this.txtCiudadCaso.set(ciudad);
        });
      })
      .catch(err => console.warn('[Mapa] Error geocodificación inversa:', err));
  }

  // ── Forward geocode por texto (Nominatim) + rellena campos ───────────────
  // Equivalente a buscarDireccion() del original

  geocodificarDireccion(): void {
    const q = this.direccionBusqueda.trim();
    if (!q) return;

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&addressdetails=1`;
    fetch(url)
      .then(r => r.json())
      .then((data: any[]) => {
        if (this.destruido) return;
        if (!data?.length) {
          this.toast.warning('Mapa', 'Dirección no encontrada');
          return;
        }
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);

        this.zone.run(() => {
          this.latitudCaso.set(lat.toFixed(6));
          this.longitudCaso.set(lon.toFixed(6));
          this.map?.setView([lat, lon], 17);
          this.colocarMarcador(lat, lon);
          this.dispararVerificacionDuplicados();  // §6.8
        });

        // Rellena campos a partir del resultado de Nominatim
        const a = data[0].address ?? {};
        const calle  = a.road ?? a.pedestrian ?? a.path ?? '';
        const num    = a.house_number ? ` # ${a.house_number}` : '';
        const dir    = (calle + num).trim() || q;
        const barrio = a.suburb ?? a.neighbourhood ?? a.quarter ?? '';
        const ciudad = a.city ?? a.town ?? a.municipality ?? '';

        this.zone.run(() => {
          // Ver comentario en reverseGeocode(): no tocar txtDireLlamante aquí.
          this.txtDireCaso.set(dir);
          if (barrio) this.txtBarrioCaso.set(barrio);
          if (ciudad) this.txtCiudadCaso.set(ciudad);
        });
      })
      .catch(() => this.toast.error('Mapa', 'Error al geocodificar'));
  }

  // ── Capa de municipios (ArcGIS REST → GeoJSON → Leaflet) ─────────────────
  // Equivalente a municipiosExtent() + mpioLayer del original

  private cargarCapaMunicipios(codDane: string): void {
    if (!codDane) return;
    const url =
      `${this.ARCGIS_BASE}/3/query?` +
      `where=CODIGO='${encodeURIComponent(codDane)}'` +
      `&outFields=CODIGO,NOMBRE&returnGeometry=true&f=geojson`;

    fetch(url)
      .then(r => r.json())
      .then((geojson: any) => {
        if (!this.map) return;
        if (this.municipioLayer) this.map.removeLayer(this.municipioLayer);

        this.municipioLayer = L.geoJSON(geojson, {
          style: {
            color:       '#ff0000',
            weight:      1.5,
            fillColor:   '#7d7d7d',
            fillOpacity: 0.30
          }
        }).addTo(this.map);

        const bounds = this.municipioLayer.getBounds();
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, { padding: [20, 20] });
          // Después de centrar el municipio, cargamos cuadrantes en ese bbox
          this.cargarCapaCuadrantesPorBbox(bounds);
        }
      })
      .catch(err => console.warn('[Mapa] Error cargando municipio:', err));
  }

  // ── Capa de cuadrantes (ArcGIS REST → GeoJSON → Leaflet) ─────────────────
  // Equivalente a cuadrantesLayer del original (líneas rojas)

  private cargarCapaCuadrantes(codDane: string): void {
    // Primero intentamos via bbox; si no hay municipio cargado,
    // esperamos a que cargarCapaMunicipios() llame a cargarCapaCuadrantesPorBbox()
    if (!codDane) return; // bbox se cargará tras municipiosExtent
  }

  private cargarCapaCuadrantesPorBbox(bounds: any): void {
    if (!this.map) return;
    const sw  = bounds.getSouthWest();
    const ne  = bounds.getNorthEast();
    // ArcGIS espera: xmin,ymin,xmax,ymax en WGS84
    const bbox = `${sw.lng},${sw.lat},${ne.lng},${ne.lat}`;

    const url =
      `${this.ARCGIS_BASE}/11/query?` +
      `geometry=${encodeURIComponent(bbox)}` +
      `&geometryType=esriGeometryEnvelope` +
      `&spatialRel=esriSpatialRelIntersects` +
      `&outFields=*&returnGeometry=true&f=geojson` +
      `&resultRecordCount=2000`;

    fetch(url)
      .then(r => r.json())
      .then((geojson: any) => {
        if (!this.map) return;
        if (this.cuadrantesLayer) this.map.removeLayer(this.cuadrantesLayer);

        this.cuadrantesLayer = L.geoJSON(geojson, {
          style: {
            color:       '#ff0000',
            weight:      2,
            fillOpacity: 0,
            opacity:     0.75
          }
        }).addTo(this.map);
      })
      .catch(err => console.warn('[Mapa] Error cargando cuadrantes:', err));
  }

  // ── Polling PlantaTel ────────────────────────────────────────────────────

  private iniciarPollLlamada(): void {
    if (this.llamadaEncontrada() || this.txtNumeLlamada()) return;
    // takeUntil corta la suscripción al destruirse el componente — sin esto,
    // una respuesta que llega después de navegar fuera de Recepción seguía
    // ejecutando el callback (incl. cdr.detectChanges() sobre vista destruida)
    // y volvía a programar un setTimeout que ngOnDestroy ya no podía cancelar,
    // dejando un loop de polling PlantaTel corriendo indefinidamente en background.
    this.svc.getLlamada()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: resp => {
          // Re-chequear: el operador pudo empezar a digitar manualmente
          // mientras esta petición estaba en vuelo — no pisar su trabajo.
          if (this.llamadaEncontrada() || this.txtNumeLlamada()) return;
          if (resp.success && resp.data) {
            const d = resp.data;
            this.txtNumeLlamada.set(String(d.NUME_LLAMADA));
            this.txtAbonado.set(String(d.NUME_TELEFONO));
            this.longitudCaso.set(d.CORDX);
            this.latitudCaso.set(d.CORDY);
            this.txtFechaIngreso.set(d.FECHAGMLC);
            this.hdnCeldaMarcacion.set(d.OPERADOR);
            this.detectarDispositivo(d.NUME_TELEFONO);
            if (d.CORDY && d.CORDX && d.CORDY !== '0' && d.CORDX !== '0') {
              const lat = parseFloat(d.CORDY);
              const lng = parseFloat(d.CORDX);
              this.map?.setView([lat, lng], 16);
              this.colocarMarcador(lat, lng);
              // Equivalente a ubicarLlamadaEnMapa(): reverse-geocode → rellena dirección
              this.reverseGeocode(lat, lng);
              this.dispararVerificacionDuplicados();  // §6.8
            }
            this.llamadaEncontrada.set(true);
            this.canalOrigenUI.set('TEL_123'); // llamada PlantaTel → origen automático
            this.ultimoPollExitoso.set(new Date());
          } else {
            this.ultimoPollExitoso.set(new Date());
            // Schedule next poll only if no call yet
            this.pollTimer = setTimeout(() => this.iniciarPollLlamada(), 5000);
          }
        },
        error: () => {
          this.pollTimer = setTimeout(() => this.iniciarPollLlamada(), 5000);
        }
      });
  }

  reiniciarPoll(): void {
    // Cancelar cualquier timer pendiente antes de reiniciar — sin esto, un
    // timer previo (todavía vivo si se guardó/cerró un caso en menos de 5s
    // desde el último "sin llamada") disparaba su propio iniciarPollLlamada(),
    // generando dos cadenas de polling concurrentes que nunca convergían.
    if (this.pollTimer) { clearTimeout(this.pollTimer); this.pollTimer = null; }
    this.llamadaEncontrada.set(false);
    this.iniciarPollLlamada();
  }

  // ── Consecutivo (manual / quick-close path) ────────────────────────────────

  consultarConsecutivo(thenDo?: () => void): void {
    this.svc.getConsecutivo().pipe(takeUntil(this.destroy$)).subscribe({
      next: resp => {
        if (resp.success) {
          this.txtNumeLlamada.set(String(resp.data));
          this.txtFechaIngreso.set(this.obtenerFechaActual());
          if (thenDo) thenDo();
        } else {
          this.toast.warning('ID Llamada', 'Error al obtener consecutivo');
        }
      },
      error: () => this.toast.error('ID Llamada', 'Error de comunicación')
    });
  }

  onAbonadoEnter(): void {
    const v = this.txtAbonado().trim();
    if (!this.txtNumeLlamada() && v.length >= 3 && v.length <= 10) {
      this.consultarConsecutivo();
    } else if (v.length < 3 || v.length > 10) {
      this.toast.warning('Abonado', 'El número debe tener entre 3 y 10 dígitos');
    }
  }

  onAbonadoChange(val: string | number): void {
    this.txtAbonado.set(String(val ?? '')); // garantiza que siempre sea string
    this.detectarDispositivo(Number(this.txtAbonado().replace(/\D/g, '')) || 0);
  }

  private detectarDispositivo(raw: number): void {
    const n = String(raw).replace(/\D/g, '');
    if (!n) { this.txtDispTelefonico.set(''); this.hdnCodDispTelefonico.set(''); return; }
    if (n.length === 10 && n.startsWith('3'))      { this.txtDispTelefonico.set('Celular');           this.hdnCodDispTelefonico.set('02'); }
    else if (n.length === 7)                        { this.txtDispTelefonico.set('Teléfono fijo');     this.hdnCodDispTelefonico.set('01'); }
    else if (n.length === 10 && !n.startsWith('3')){ this.txtDispTelefonico.set('Teléfono fijo');     this.hdnCodDispTelefonico.set('01'); }
    // '03', no '01' — antes colisionaba con "Teléfono fijo", haciendo ambos
    // tipos indistinguibles server-side pese a mostrar etiquetas distintas en la UI.
    else if (n.length === 3 && n.startsWith('1'))  { this.txtDispTelefonico.set('Linea Emergencias'); this.hdnCodDispTelefonico.set('03'); }
    else                                            { this.txtDispTelefonico.set('Otros');             this.hdnCodDispTelefonico.set('00'); }
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  §6.8 — Detección de posibles duplicados
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Dispara la verificación de duplicados cuando cambian coordenadas o código de caso.
   * Se llama desde los setters de coordenadas y desde seleccionarSugerencia().
   */
  dispararVerificacionDuplicados(): void {
    const tieneCoords = !!this.latitudCaso() && !!this.longitudCaso() &&
                        this.latitudCaso() !== '0' && this.longitudCaso() !== '0';
    const tieneCodigo = !!this.txtCodigCaso().trim();
    if (tieneCoords && tieneCodigo) {
      this.duplicadoCheck$.next();
    } else {
      // Limpiar si ya no hay datos suficientes
      this.duplicados.set([]);
      this.showDuplicados.set(false);
    }
  }

  private ejecutarBusquedaDuplicados(): void {
    const lat = parseFloat(this.latitudCaso());
    const lng = parseFloat(this.longitudCaso());
    if (isNaN(lat) || isNaN(lng) || lat === 0 && lng === 0) return;

    this.verificandoDuplicados.set(true);
    this.svc.getPedidosCercanos(
      lat, lng,
      this.DUPL_RADIO, this.DUPL_MINUTOS,
      this.txtCodigCaso().trim() || undefined
    ).pipe(takeUntil(this.destroy$))
     .subscribe({
       next: (resp) => {
         this.verificandoDuplicados.set(false);
         const duplicados = resp.data ?? [];
         this.duplicados.set(duplicados);
         this.showDuplicados.set(duplicados.length > 0);
       },
       error: () => {
         this.verificandoDuplicados.set(false);
         this.duplicados.set([]);
         this.showDuplicados.set(false);
       }
     });
  }

  /** El operador decide vincularlo como caso relacionado al pedido duplicado detectado. */
  vincularConDuplicado(p: DtoPedidoCercano): void {
    // Usa el mecanismo existente de "asociar llamada" para vincular el pedido nuevo
    // al pedido preexistente. CADPEDI_SITIO_GRABA + CADPEDI_NUME_LLAMADA se envían al backend.
    this.hdnNumeLlamadaAsociada.set(p.id);
    this.hdnSitioGrabaAsociada.set(String(p.sitioGraba));
    this.txtAsociarLlamada.set(
      `Relacionado con pedido #${p.id} (${p.codiPedido ?? ''} · ${p.direCaso ?? ''})`);
    this.cerrarAlertaDuplicados();
    this.toast.warning('Duplicado vinculado',
      `Este caso se relacionará con el pedido #${p.id}. Seleccione los canales y envíe.`);
    this.cargarAdjuntos(p.id);
  }

  /** El operador elige continuar con un caso nuevo, ignorando el posible duplicado. */
  cerrarAlertaDuplicados(): void {
    this.showDuplicados.set(false);
  }

  getPrioridadLabel(p: string | null): string {
    const map: Record<string, string> = { '01': 'Flash', '02': 'Inmediata', '03': 'Rutina',
                                          FLASH: 'Flash', INMEDIATA: 'Inmediata', RUTINA: 'Rutina' };
    return map[(p ?? '').toUpperCase()] ?? (p || '—');
  }

  getEstadoLabelDupl(e: string | null): string {
    const map: Record<string, string> = { A: 'Activo', P: 'Pendiente', E: 'En proceso',
                                          T: 'Seguimiento', R: 'Revisión', C: 'Cerrado' };
    return map[e ?? ''] ?? (e || '—');
  }

  // ── Case autocomplete ────────────────────────────────────────────────────

  onDescaso1Change(val: string): void { this.txtDescaso.set(val); this.buscar1$.next(val); }
  onDescaso2Change(val: string): void { this.txtDescaso2.set(val); this.buscar2$.next(val); }

  private doSearchCasos(q: string, slot: 1 | 2): void {
    this.svc.buscarCasos(q).pipe(takeUntil(this.destroy$)).subscribe({
      next: resp => {
        if (slot === 1) this.casosSugeridos1.set(resp.data ?? []);
        else            this.casosSugeridos2.set(resp.data ?? []);
      },
      error: () => {
        if (slot === 1) this.casosSugeridos1.set([]);
        else            this.casosSugeridos2.set([]);
      }
    });
  }

  seleccionarSugerencia(c: DtoCasoItem, slot: 1 | 2): void {
    if (slot === 1) {
      this.txtCodigCaso.set(c.CODIGO_CASO);
      this.txtDescaso.set(c.DESCRIPCION_CASO);
      this.casosSugeridos1.set([]);
      this.onCasoSeleccionadoChange(c);
      // Disparar verificación de duplicados si ya tenemos coordenadas
      this.dispararVerificacionDuplicados();
    } else {
      this.txtCodigCaso2.set(c.CODIGO_CASO);
      this.txtDescaso2.set(c.DESCRIPCION_CASO);
      this.casosSugeridos2.set([]);
    }
  }

  cerrarSugerencias(): void {
    setTimeout(() => {
      this.casosSugeridos1.set([]);
      this.casosSugeridos2.set([]);
    }, 200);
  }

  buscarCasoPorCodigo(codigo: string, slot: 1 | 2): void {
    if (!codigo.trim()) return;
    this.svc.getCasoPorCodigo(codigo).pipe(takeUntil(this.destroy$)).subscribe({
      next: resp => {
        if (resp.success && resp.data) {
          if (slot === 1) {
            this.txtDescaso.set(resp.data.DESCRIPCION_CASO);
            this.onCasoSeleccionadoChange(resp.data);
          } else {
            this.txtDescaso2.set(resp.data.DESCRIPCION_CASO);
          }
        } else {
          this.toast.warning('Caso', 'Código no encontrado');
        }
      },
      error: () => this.toast.error('Caso', 'Error al buscar código')
    });
  }

  // ── Channels ─────────────────────────────────────────────────────────────

  private cargarCanales(): void {
    this.svc.getCanales(this.sitioGraba).pipe(takeUntil(this.destroy$)).subscribe({
      next: data => {
        this.canales.set((data ?? []).map(c => ({ ...c, seleccionado: false })));
        this.construirGruposCanales();
      },
      error: () => this.toast.error('Canales', 'No se pudieron cargar los canales')
    });
  }

  private construirGruposCanales(): void {
    // Agrupar por fuerzaId (numérico, único), no por nombre de fuerza (string):
    // dos fuerzas distintas podrían compartir el mismo texto tras trim() en un
    // escenario multi-tenant/federado, fusionando visualmente sus canales y
    // etiquetando algunos como "propios" cuando son de otra agencia, o viceversa.
    const mapa: Record<number, { fuerza: string; canales: DtoCanalRecepcion[] }> = {};
    for (const c of this.canales()) {
      (mapa[c.fuerzaId] ??= { fuerza: (c.fuerza || 'SIN FUERZA').trim(), canales: [] }).canales.push(c);
    }
    this.gruposCanales.set(Object.keys(mapa)
      .map(Number)
      .sort((a, b) => mapa[a].fuerza.localeCompare(mapa[b].fuerza, 'es'))
      .map(fuerzaId => ({
        fuerza:   mapa[fuerzaId].fuerza,
        fuerzaId,
        canales:  mapa[fuerzaId].canales.sort((a, b) => a.descripcion.localeCompare(b.descripcion, 'es'))
      })));
  }

  toggleCanal(c: DtoCanalRecepcion): void {
    c.seleccionado = !c.seleccionado;
  }

  private canalesSeleccionados(): DtoCanalSeleccionado[] {
    return this.canales()
      .filter(c => c.seleccionado)
      .map(c => ({ codigo: c.codigo, fuerzaId: c.fuerzaId }));
  }

  // ── References ────────────────────────────────────────────────────────────

  private cargarReferencias(): void {
    this.svc.getReferencias('TIPO_PEDIDO').pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.refTipoPedido.set(data ?? [])
    });
    this.svc.getReferencias('CALI_PEDIDO').pipe(takeUntil(this.destroy$)).subscribe({
      next: data => this.refCaliPedido.set(data ?? [])
    });
  }

  // ── Validate & Send ───────────────────────────────────────────────────────

  /**
   * Resume, para la barra de envío, qué falta por llenar. La validación real
   * sigue estando en validarYGuardar(): esto sólo evita que el operador
   * descubra el primer campo faltante de a un toast a la vez, teniendo que
   * volver a subir el formulario en cada intento.
   */
  camposObligatoriosFaltantes(): string {
    const faltan: string[] = [];
    if (!this.txtNumeLlamada())                                        faltan.push('ID de llamada');
    if (!this.txtAbonado().trim())                                     faltan.push('abonado');
    if (!this.txtNombreLlamante().trim())                              faltan.push('llamante');
    if (!this.txtCodigCaso().trim())                                   faltan.push('código de caso');
    if (!this.txtDireCaso().trim())                                    faltan.push('dirección del caso');
    if (!this.latitudCaso() || !this.longitudCaso())                   faltan.push('ubicación en el mapa');
    if (!this.relatoAutomatico().trim() && !this.notasAdicionales().trim())
                                                                       faltan.push('relato del incidente');
    if (this.asistenteAbierto()) {
      const respuestas = this.respuestas();
      const sinResponder = this.asistentePreguntas().filter(
        p => p.obligatoria && !(respuestas[p.id] ?? '').trim()
      ).length;
      if (sinResponder) {
        faltan.push(sinResponder === 1
          ? 'una pregunta obligatoria del asistente'
          : `${sinResponder} preguntas obligatorias del asistente`);
      }
    }
    return faltan.join(', ');
  }

  validarYGuardar(): void {
    if (!this.txtNumeLlamada()) {
      this.toast.warning('Validar', 'Debe generar un ID de llamada (ingrese abonado y presione Enter)');
      return;
    }
    if (!this.txtAbonado()) {
      this.toast.warning('Validar', 'El número de abonado es obligatorio');
      return;
    }
    if (!this.txtNombreLlamante()) {
      this.toast.warning('Validar', "El campo 'Llamante' es obligatorio");
      return;
    }
    if (!this.txtCodigCaso()) {
      this.toast.warning('Validar', 'Debe seleccionar al menos un caso');
      return;
    }
    if (!this.txtDireCaso()) {
      this.toast.warning('Validar', 'Debe ingresar la dirección del caso');
      return;
    }
    if (!this.latitudCaso() || !this.longitudCaso()) {
      // Sin coordenadas, la detección de duplicados (§6.8) y el mapa de
      // incidentes aguas abajo quedan rotos silenciosamente para este caso.
      this.toast.warning('Validar', 'Debe ubicar el caso en el mapa o buscar la dirección para georreferenciarlo');
      return;
    }
    if (!this.relatoAutomatico().trim() && !this.notasAdicionales().trim()) {
      this.toast.warning('Validar', 'Debe ingresar la descripción del caso o responder las preguntas orientadoras');
      return;
    }
    if (this.asistenteAbierto()) {
      // Las preguntas marcadas con * en el panel del asistente eran puramente
      // decorativas: nunca se verificaba que tuvieran respuesta antes de guardar.
      const respuestas = this.respuestas();
      const faltante = this.asistentePreguntas().find(
        p => p.obligatoria && !(respuestas[p.id] ?? '').trim()
      );
      if (faltante) {
        this.toast.warning('Validar', `Debe responder la pregunta obligatoria: "${faltante.pregunta}"`);
        return;
      }
    }
    const canalesSel = this.canalesSeleccionados();
    if (canalesSel.length < 1) {
      this.toast.warning('Validar', 'Debe seleccionar al menos un canal de despacho');
      return;
    }

    const dto = this.buildDtoRecepcion('P', 'S', canalesSel);
    this.saving.set(true);

    this.svc.guardar(dto).pipe(takeUntil(this.destroy$)).subscribe({
      next: resp => {
        this.saving.set(false);
        if (resp.success) {
          this.toast.success('Incidente registrado', resp.message);
          // Despachar a agencias externas usando el ID real de cad_pedidos
          // (resp.pedidoId = cad_pedidos.id, que es distinto de NUME_LLAMADA)
          if (this.agenciasSeleccionadas().size > 0 && resp.pedidoId) {
            this.despacharAgenciasExternas(resp.pedidoId);
          }
          this.limpiarFormulario();
          this.reiniciarPoll();
        } else {
          this.toast.warning('Recepción', resp.message);
        }
      },
      error: () => { this.saving.set(false); this.toast.error('Recepción', 'Error de comunicación'); }
    });
  }

  // ── Quick-close ────────────────────────────────────────────────────────────

  cerrarRapido(comentarioBoton: string): void {
    const v = this.txtAbonado().trim();
    if (!v || v.length < 3 || v.length > 10) {
      this.toast.warning('Cerrar', 'Ingrese un número de abonado válido (3–10 dígitos)');
      return;
    }

    const doClose = () => {
      const dto = this.buildDtoRapido(comentarioBoton);
      this.svc.cerrarRapido(dto).pipe(takeUntil(this.destroy$)).subscribe({
        next: resp => {
          if (resp.success) {
            this.toast.success('Cerrar', resp.message);
            this.limpiarFormulario();
            this.reiniciarPoll();
          } else {
            this.toast.warning('Cerrar', resp.message);
          }
        },
        error: () => this.toast.error('Cerrar', 'Error de comunicación')
      });
    };

    if (!this.txtNumeLlamada()) {
      this.consultarConsecutivo(doClose);
    } else {
      doClose();
    }
  }

  // ── Association modal ──────────────────────────────────────────────────────

  abrirModalAsociar(): void {
    if (!this.txtNumeLlamada()) {
      this.toast.warning('Asociar', 'Debe haber una llamada activa');
      return;
    }
    const dto = {
      sitioGraba:  this.sitioGraba,
      horaCaso:    this.txtFechaIngreso(),
      numeLlamada: Number(this.txtNumeLlamada())
    };
    this.svc.buscarAsociar(dto).pipe(takeUntil(this.destroy$)).subscribe({
      next: resp => {
        if (resp.success) {
          this.llamadasParaAsociar.set(resp.data ?? []);
          this.showModalAsociar.set(true);
        } else {
          this.toast.warning('Asociar', resp.message || 'Sin llamadas disponibles');
        }
      },
      error: () => this.toast.error('Asociar', 'Error al consultar llamadas')
    });
  }

  cerrarModalAsociar(): void {
    this.showModalAsociar.set(false);
  }

  seleccionarAsociada(ll: DtoLlamadaAsociar): void {
    this.hdnNumeLlamadaAsociada.set(String(ll.NUME_LLAMADA));
    this.hdnSitioGrabaAsociada.set(String(ll.SITIO_GRABA));
    this.txtAsociarLlamada.set(`${ll.NUME_LLAMADA} - ${ll.CODI_PEDIDO} - ${ll.DIRE_CASO}`);
    this.showModalAsociar.set(false);
    // Mostrar las fotos ya adjuntas al caso preexistente que se está vinculando
    // — antes la galería quedaba vacía aunque el pedido asociado sí tuviera fotos.
    this.cargarAdjuntos(this.hdnNumeLlamadaAsociada());
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  toggleMinimize(): void { this.minimized = !this.minimized; }
  closePanel():    void { this.visible    = false; }

  getEstadoLabel(estado: string): string {
    switch (estado) {
      case 'A': return 'Activo';
      case 'P': return 'Pendiente';
      case 'E': return 'En proceso';
      case 'T': return 'Seguimiento';
      case 'R': return 'Revisión';
      case 'C': return 'Cerrado';
      default:  return estado;
    }
  }

  // ── §6.1 Agencias externas ────────────────────────────────────────────────

  private cargarAgenciasExternas(): void {
    this.agenciaSvc.getActivas().pipe(takeUntil(this.destroy$)).subscribe({
      next:  data => { this.agenciasExternas.set(data ?? []); },
      error: ()   => { /* no crítico — si falla, simplemente no se muestran */ }
    });
  }

  toggleAgenciaExterna(id: string): void {
    const set = new Set(this.agenciasSeleccionadas());
    if (set.has(id)) set.delete(id);
    else             set.add(id);
    this.agenciasSeleccionadas.set(set);
  }

  getAgenciaIcon = (tipo: string) => this.agenciaSvc.getTipoIcon(tipo);

  /** Envía el caso a las agencias externas seleccionadas después de guardar.
   *  @param pedidoId — cad_pedidos.id (Snowflake real), NO el NUME_LLAMADA. */
  private despacharAgenciasExternas(pedidoId: string): void {
    const seleccionadas = this.agenciasSeleccionadas();
    if (seleccionadas.size === 0) return;
    const sg = this.sitioGraba;
    const agenciasExternas = this.agenciasExternas();

    // Buscar el nombre de cada agencia para mostrar mensajes específicos
    seleccionadas.forEach(agenciaId => {
      const agencia = agenciasExternas.find(a => a.id === agenciaId);
      const nombreAgencia = agencia?.nombre ?? 'agencia externa';

      this.agenciaSvc.despachar({ pedidoId, sitioGraba: sg, agenciaId })
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: r => {
            if (r.success) {
              // Despacho exitoso
              this.toast.success(
                `Notificado: ${nombreAgencia}`,
                r.message
              );
            } else {
              // El incidente SÍ quedó en SECAD — solo falló la notificación externa
              this.toast.warning(
                `Aviso — ${nombreAgencia}`,
                `El incidente fue creado en SECAD, pero la notificación a ${nombreAgencia} no fue exitosa: ${r.message}`
              );
            }
          },
          error: () =>
            // Error de red/timeout — el incidente en SECAD está intacto
            this.toast.error(
              `Error de conexión — ${nombreAgencia}`,
              `El incidente quedó registrado en SECAD. No se pudo contactar la API de ${nombreAgencia}. Verifique la conectividad o reenvíe desde el Hub de Integraciones.`
            )
        });
    });
  }

  /** Determina si un grupo de canales pertenece a otra fuerza (no la del operador). */
  esGrupoExterno(grupo: GrupoCanal): boolean {
    return grupo.fuerzaId !== this.fuerzaId;
  }
  /** Devuelve los grupos de canales con los PROPIOS arriba y los EXTERNOS ("Otra agencia") abajo. */
  get gruposCanalesOrdenados() {
    // [...] crea una copia para NO mutar el arreglo original
    return [...this.gruposCanales()].sort((a, b) => {
      const aExt = this.esGrupoExterno(a) ? 1 : 0;
      const bExt = this.esGrupoExterno(b) ? 1 : 0;
      return aExt - bExt;   // 0 (propios) van antes que 1 (externos)
    });
  }


  // ── Indicador de salud de conexión PlantaTel ─────────────────────────────
  // El polling corre en background cada 5s sin ninguna señal visible para el
  // operador — si el backend empieza a fallar silenciosamente, nadie lo nota
  // hasta que una llamada real "no llega". Este indicador da visibilidad real
  // sobre un mecanismo que hasta ahora era una caja negra.

  get plantaTelEstado(): 'ok' | 'demorado' | 'inactivo' {
    void this.tickReloj(); // dependencia reactiva — refresca cada 5s
    if (this.llamadaEncontrada()) return 'ok';   // hay una llamada activa en pantalla
    const ultimoPoll = this.ultimoPollExitoso();
    if (!ultimoPoll) return 'inactivo';
    const segs = (Date.now() - ultimoPoll.getTime()) / 1000;
    if (segs < 15) return 'ok';
    if (segs < 45) return 'demorado';
    return 'inactivo';
  }

  get plantaTelEstadoLabel(): string {
    void this.tickReloj(); // dependencia reactiva — refresca cada 5s
    if (this.llamadaEncontrada()) return 'Llamada en pantalla';
    const ultimoPoll = this.ultimoPollExitoso();
    if (!ultimoPoll) return 'Conectando…';
    const segs = Math.floor((Date.now() - ultimoPoll.getTime()) / 1000);
    if (segs < 8)  return 'PlantaTel activo';
    if (segs < 60) return `Última respuesta hace ${segs}s`;
    return `Sin respuesta hace ${Math.floor(segs / 60)} min`;
  }

  // ── Canal → OrigenEvento mapping ─────────────────────────────────────────
  // Nota: los valores de Origen deben coincidir con el CHECK de cad_eventos.origen.
  // RADIO/CAMPO/SUPERVISION se registran como INTERNO hasta que el backend amplíe el constraint.

  private mapCanalOrigen(canal: string): OrigenEvento {
    switch (canal) {
      case 'TEL_123':     return 'PLANTATEL';
      case 'TEL_DIRECTO': return 'RECEPCION';
      case 'RADIO':       return 'INTERNO';
      case 'CAMPO':       return 'INTERNO';
      case 'SUPERVISION': return 'INTERNO';
      case 'TRASLADO':    return 'INTEGRACION';
      default:            return 'MANUAL';
    }
  }

  // ── Internal helpers ────────────────────────────────────────────────────────

  private obtenerFechaActual(): string {
    const now = new Date();
    const dd  = String(now.getDate()).padStart(2, '0');
    const mm  = String(now.getMonth() + 1).padStart(2, '0');
    const yy  = now.getFullYear();
    const hh  = String(now.getHours()).padStart(2, '0');
    const mi  = String(now.getMinutes()).padStart(2, '0');
    const ss  = String(now.getSeconds()).padStart(2, '0');
    return `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
  }

  /**
   * Normaliza el abonado a dígitos antes de convertir a número — sin esto,
   * un formato con separadores ("300 123 4567", "(300)-123-4567") produce
   * NaN → 0, perdiendo silenciosamente el teléfono real sin ningún aviso.
   * Mismo criterio que detectarDispositivo() ya usa.
   */
  private normalizarTelefono(): number {
    return Number(this.txtAbonado().replace(/\D/g, '')) || 0;
  }

  private buildDtoRecepcion(estado: string, enviar: string, canalesSel: DtoCanalSeleccionado[]): DtoRecepcion {
    return {
      SITIO_GRABA:           this.sitioGraba,
      NUME_LLAMADA:          Number(this.txtNumeLlamada()) || 0,
      HORA_CASO:             this.txtFechaIngreso() || this.obtenerFechaActual(),
      NUME_TELEFONO:         this.normalizarTelefono(),
      PROP_TELEFONO:         this.txtPropAbonado(),
      NOMB_LLAMANTE:         this.txtNombreLlamante(),
      DIRE_LLAMANTE:         this.txtDireLlamante(),
      TIPO_PEDIDO:           this.tipoPedido(),
      CALI_PEDIDO:           this.caliPedido(),
      BARRIO:                this.txtBarrioCaso(),
      CIUDAD:                this.txtCiudadCaso(),
      DIRE_CASO:             this.txtDireCaso(),
      LATITUD_CASO:          this.latitudCaso(),
      LONGITUD_CASO:         this.longitudCaso(),
      COMENTARIO:            this.buildComentario(),
      CODI_PEDIDO:           this.txtCodigCaso(),
      CODI_PEDIDO2:          this.txtCodigCaso2(),
      IMPORTANCIA:           this.importancia(),
      PRIORIDAD:             this.prioridad(),
      DISP_TELEFONICO:       this.hdnCodDispTelefonico(),
      OPERADOR:              this.hdnCeldaMarcacion(),
      ESTADO:                estado,
      ENVIAR:                enviar,
      Origen:                this.mapCanalOrigen(this.canalOrigenUI()),
      CANALES_SELECCIONADOS: canalesSel,
      CANAL_FUERZA:          this.fuerzaId || null,
      CADPEDI_SITIO_GRABA:   this.txtAsociarLlamada() ? this.hdnSitioGrabaAsociada() : null,
      CADPEDI_NUME_LLAMADA:  this.txtAsociarLlamada() ? this.hdnNumeLlamadaAsociada() : null
    };
  }

  private buildDtoRapido(comentario: string): DtoRecepcion {
    return {
      SITIO_GRABA:           this.sitioGraba,
      NUME_LLAMADA:          Number(this.txtNumeLlamada()) || 0,
      HORA_CASO:             this.txtFechaIngreso() || this.obtenerFechaActual(),
      NUME_TELEFONO:         this.normalizarTelefono(),
      PROP_TELEFONO:         this.txtPropAbonado(),
      NOMB_LLAMANTE:         '',
      DIRE_LLAMANTE:         '',
      TIPO_PEDIDO:           '',
      CALI_PEDIDO:           '',
      BARRIO:                '',
      CIUDAD:                '',
      DIRE_CASO:             '',
      LATITUD_CASO:          '',
      LONGITUD_CASO:         '',
      COMENTARIO:            comentario,
      CODI_PEDIDO:           '900',
      CODI_PEDIDO2:          '',
      IMPORTANCIA:           '01',
      // '03' = Rutina (mismo default que el formulario completo, línea ~92).
      // Antes quedaba en '01' = Flash — la MÁXIMA prioridad posible para casos
      // triviales por definición (llamada equivocada, niño jugando, etc.),
      // contaminando estadísticas con prioridades incoherentes.
      PRIORIDAD:             '03',
      DISP_TELEFONICO:       this.hdnCodDispTelefonico(),
      OPERADOR:              this.hdnCeldaMarcacion(),
      ESTADO:                'C',
      ENVIAR:                'N',
      Origen:                'RECEPCION',   // cierre rápido siempre es del operador
      CANALES_SELECCIONADOS: [],
      CANAL_FUERZA:          null,
      CADPEDI_SITIO_GRABA:   null,
      CADPEDI_NUME_LLAMADA:  null
    };
  }

  limpiarFormulario(): void {
    this.txtFechaIngreso.set('');
    this.txtNumeLlamada.set('');
    this.txtAbonado.set('');
    this.txtPropAbonado.set('');
    this.txtDispTelefonico.set('');
    this.hdnCodDispTelefonico.set('');
    this.hdnCeldaMarcacion.set('');
    this.txtNombreLlamante.set('');
    this.txtDireLlamante.set('');
    this.txtCodigCaso.set('');
    this.txtDescaso.set('');
    this.txtCodigCaso2.set('');
    this.txtDescaso2.set('');
    this.txtCiudadCaso.set('');
    this.txtBarrioCaso.set('');
    this.txtDireCaso.set('');
    this.latitudCaso.set('');
    this.longitudCaso.set('');
    this.notasAdicionales.set('');
    this.txtAsociarLlamada.set('');
    this.hdnNumeLlamadaAsociada.set('');
    this.hdnSitioGrabaAsociada.set('');
    this.tipoPedido.set('');
    this.caliPedido.set('');
    this.prioridad.set('03');
    this.importancia.set('01');
    this.canalOrigenUI.set('MANUAL');   // sin llamada activa → ingreso manual por defecto
    this.canales().forEach(c => c.seleccionado = false);
    this.llamadaEncontrada.set(false);
    // Solo retira el marcador de la llamada; las capas de municipio/cuadrantes se mantienen
    if (this.mapMarker && this.map) { this.map.removeLayer(this.mapMarker); this.mapMarker = null; }
    // Resetea el asistente para la próxima llamada
    this.resetAsistente();
    // Limpia estado de duplicados
    this.duplicados.set([]);
    this.showDuplicados.set(false);
    // Limpia agencias externas seleccionadas
    this.agenciasSeleccionadas.set(new Set());
    // Limpia adjuntos (nueva llamada, nuevas fotos)
    this.adjuntos.set([]);
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  §multicanal — Adjuntos / Fotos
  // ════════════════════════════════════════════════════════════════════════════

  /** Carga adjuntos existentes de un pedido ya guardado (por defecto, el actual). */
  cargarAdjuntos(pedidoId: string = this.txtNumeLlamada()): void {
    if (!pedidoId) return;
    this.svc.getAdjuntos(pedidoId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({ next: r => { if (r.success) this.adjuntos.set(r.data); } });
  }

  /** ui-file-upload entrega el File ya validado; el origen leía el input. */
  subirFotoDesdeKit(file: File): void {
    this.subirFoto(file);
  }

  onFotoSeleccionada(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;
    Array.from(input.files).forEach(f => this.subirFoto(f));
    input.value = ''; // permite re-seleccionar el mismo archivo
  }

  onFotoDragOver(event: DragEvent): void {
    event.preventDefault();
    this.adjuntosDragOver = true;
  }

  onFotoDragLeave(): void {
    this.adjuntosDragOver = false;
  }

  onFotoDrop(event: DragEvent): void {
    event.preventDefault();
    this.adjuntosDragOver = false;
    if (!event.dataTransfer?.files.length) return;
    Array.from(event.dataTransfer.files).forEach(f => this.subirFoto(f));
  }

  private subirFoto(file: File): void {
    if (!this.txtNumeLlamada()) {
      this.toast.warning('Fotos', 'Debe generar un ID de llamada antes de subir fotos');
      return;
    }
    const maxMb = 8;
    if (file.size > maxMb * 1024 * 1024) {
      this.toast.warning('Fotos', `"${file.name}" excede ${maxMb} MB`);
      return;
    }
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!['jpg', 'jpeg', 'png', 'webp'].includes(ext)) {
      this.toast.warning('Fotos', `Formato no permitido: ${ext}. Use JPG, PNG o WEBP.`);
      return;
    }

    this.adjuntosSubiendo.set(true);
    this.svc.subirAdjunto(this.txtNumeLlamada(), this.sitioGraba, file)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: r => {
          this.adjuntosSubiendo.set(false);
          if (r.success) {
            this.adjuntos.update(list => [r.data, ...list]);
            this.toast.success('Foto subida', `"${file.name}" adjuntada al caso`);
          } else {
            this.toast.warning('Fotos', r.message);
          }
        },
        error: () => {
          this.adjuntosSubiendo.set(false);
          this.toast.error('Fotos', 'Error al subir la foto');
        }
      });
  }

  eliminarFoto(adjunto: DtoAdjunto): void {
    this.svc.eliminarAdjunto(adjunto.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: r => {
          if (r.success) {
            this.adjuntos.update(list => list.filter(a => a.id !== adjunto.id));
            this.toast.success('Foto eliminada', adjunto.nombreOriginal);
          } else {
            this.toast.warning('Fotos', r.message);
          }
        },
        error: () => this.toast.error('Fotos', 'Error al eliminar la foto')
      });
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  §6.17 Asistente Inteligente — métodos
  // ════════════════════════════════════════════════════════════════════════════

  toggleAsistente(): void {
    this.asistenteAbierto.update(v => !v);
    if (this.asistenteAbierto() && this.asistenteCategorias().length === 0) {
      this.cargarAsistenteCategorias();
    }
  }

  private cargarAsistenteCategorias(): void {
    this.asistenteLoadingCat.set(true);
    this.asistenteSvc.getCategorias(true).pipe(takeUntil(this.destroy$)).subscribe({
      next: (r) => {
        this.asistenteCategorias.set(r.data ?? []);
        this.asistenteLoadingCat.set(false);
      },
      error: () => {
        this.asistenteLoadingCat.set(false);
        this.toast.error('Asistente', 'No fue posible cargar las categorías.');
      }
    });
  }

  onAsistenteCategoriaChange(idCategoria: string): void {
    this.asistentePreguntas.set([]);
    this.asistenteCategoriaSel.set(idCategoria);
    this.respuestas.set({});
    this.relatoAutomatico.set('');
    if (!idCategoria) return;

    this.asistenteLoadingPreg.set(true);
    this.asistenteSvc.getPreguntas(idCategoria, true).pipe(takeUntil(this.destroy$)).subscribe({
      next: (r) => {
        this.asistentePreguntas.set(r.data ?? []);
        this.asistenteLoadingPreg.set(false);
      },
      error: () => {
        this.asistenteLoadingPreg.set(false);
        this.toast.error('Asistente', 'No fue posible cargar las preguntas.');
      }
    });
  }

  resetAsistente(): void {
    this.asistenteAbierto.set(false);
    this.asistenteCategoriaSel.set('');
    this.asistentePreguntas.set([]);
    this.asistenteLoadingPreg.set(false);
    this.asistenteAutoActivado.set(false);
    this.asistenteCategoriaCode.set('');
    this.asistenteCategoriaDescripcion.set('');
    this.respuestas.set({});
    this.relatoAutomatico.set('');
  }

  // ════════════════════════════════════════════════════════════════════════════
  //  §6.17 Asistente — auto-activación y relato automático
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Se llama cada vez que el operador selecciona o confirma un código de caso
   * en el slot primario (slot 1). Si el caso tiene categoría de asistente
   * vinculada, abre el panel y carga las preguntas automáticamente.
   */
  onCasoSeleccionadoChange(caso: DtoCasoItem): void {
    const catId = caso.ID_CATEGORIA_ASISTENTE;

    if (!catId) {
      // Sin categoría configurada → resetear modo auto si estaba activo
      if (this.asistenteAutoActivado()) this.resetAsistente();
      return;
    }

    // Si ya estábamos en la misma categoría, no recargar (evita perder respuestas)
    if (this.asistenteAutoActivado() && this.asistenteCategoriaSel() === catId) return;

    this.asistenteAutoActivado.set(true);
    this.asistenteCategoriaCode.set(caso.CATEGORIA_CODIGO ?? '');
    this.asistenteCategoriaDescripcion.set(caso.CATEGORIA_DESCRIPCION ?? '');
    this.asistenteCategoriaSel.set(catId);
    this.asistenteAbierto.set(true);
    this.respuestas.set({});

    // Construir intro del relato inmediatamente con los datos del caso ya disponibles
    this.construirRelato();

    this.asistenteLoadingPreg.set(true);
    this.asistenteSvc.getPreguntas(catId, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (r) => {
          this.asistentePreguntas.set(r.data ?? []);
          this.asistenteLoadingPreg.set(false);
          // Actualizar relato con la lista de preguntas cargada
          this.construirRelato();
        },
        error: () => {
          this.asistenteLoadingPreg.set(false);
          this.toast.error('Asistente', 'No fue posible cargar las preguntas.');
        }
      });
  }

  /**
   * Actualiza la respuesta de una pregunta y reconstruye el relato en tiempo real.
   * Llamado desde los inputs del template vía (ngModelChange).
   * `valor` puede ser string o number (inputs numéricos emiten number).
   */
  onRespuestaChange(pregId: string, valor: string | number): void {
    this.respuestas.update(r => ({ ...r, [pregId]: String(valor ?? '') }));
    this.construirRelato();
  }

  /**
   * Construye el relato en lenguaje natural a partir de los datos de la llamada
   * y las respuestas a las preguntas orientadoras.
   *
   * El relato se compone de tres secciones:
   *  1. INTRODUCCIÓN — metadatos de la llamada (siempre presente al seleccionar caso)
   *  2. CUERPO       — fragmentos narrativos de cada respuesta informativa
   *  3. ALERTA       — fragmentos de respuestas con palabras clave de urgencia
   */
  construirRelato(): void {
    // ── Metadatos de la llamada ──────────────────────────────────────────────
    const fechaHora  = this.txtFechaIngreso() || this.obtenerFechaActual();
    const partesFH   = fechaHora.includes(' ') ? fechaHora.split(' ') : [fechaHora, ''];
    const fecha      = partesFH[0];
    const hora       = partesFH[1] ?? '';
    const abonado    = this.txtAbonado()?.trim() || null;
    const canalLabel = (this.canalesOrigen as readonly { value: string; label: string }[])
                         .find(c => c.value === this.canalOrigenUI())?.label ?? this.canalOrigenUI();
    const direccion  = this.txtDireCaso()?.trim() || 'dirección no especificada';
    const barrio     = this.txtBarrioCaso()?.trim();
    const ciudad     = this.txtCiudadCaso()?.trim();
    const codigoCaso = this.txtCodigCaso()?.trim().toUpperCase();
    const descCaso   = this.txtDescaso()?.trim();

    // Ubicación compuesta
    let ubicacion = direccion;
    if (barrio) ubicacion += `, ${barrio}`;
    if (ciudad) ubicacion += `, ${ciudad}`;

    // ── INTRODUCCIÓN ─────────────────────────────────────────────────────────
    let intro = `El ${fecha}`;
    if (hora) intro += ` a las ${hora}`;
    intro += `, a través de ${canalLabel}`;
    if (abonado) intro += ` (Abonado: ${abonado})`;
    intro += ', se reporta un incidente';
    if (codigoCaso) {
      intro += ` tipificado preliminarmente como ${codigoCaso}`;
      if (descCaso) intro += ` — ${descCaso}`;
    }
    intro += ` en ${ubicacion}.`;

    // Sin preguntas contestadas → solo el intro (visible desde el momento de selección)
    const respuestas = this.respuestas();
    const contestadas = this.asistentePreguntas().filter(p => {
      const v = String(respuestas[p.id] ?? '').trim();
      return v.length > 0;
    });

    if (contestadas.length === 0) {
      this.relatoAutomatico.set(intro);
      return;
    }

    // ── CUERPO + ALERTAS ─────────────────────────────────────────────────────
    const PALABRAS_ALERTA = [
      'víctima', 'victima', 'herido', 'lesionado', 'atrapado', 'atrapada',
      'arma', 'incendio', 'fuga', 'muerto', 'fallecido', 'disparo', 'explosivo',
      'sangre', 'agresión', 'agresion'
    ];

    const fragmentosInfo:   string[] = [];
    const fragmentosAlerta: string[] = [];

    for (const p of contestadas) {
      const resp = String(respuestas[p.id]).trim();
      const qLow = p.pregunta.toLowerCase();
      const esAlerta = p.tipoRespuesta === 'SINO' && resp === 'si' &&
                       PALABRAS_ALERTA.some(k => qLow.includes(k));
      const frag = this.buildFragmentoNarrativo(p, resp);
      if (esAlerta) fragmentosAlerta.push(frag);
      else          fragmentosInfo.push(frag);
    }

    const partes: string[] = [intro];

    if (fragmentosInfo.length > 0) {
      partes.push('De acuerdo con la información suministrada, ' +
                  fragmentosInfo.join('; ') + '.');
    }

    if (fragmentosAlerta.length > 0) {
      partes.push('ATENCIÓN: ' + fragmentosAlerta.join('. ') + '.');
    }

    this.relatoAutomatico.set(partes.join('\n\n'));
  }

  // ── Motor de fragmentos narrativos ─────────────────────────────────────────

  private buildFragmentoNarrativo(preg: AsistentePregunta, respuesta: string): string {
    const qLimpia = preg.pregunta.replace(/[¿?]/g, '').trim();
    const qLow    = qLimpia.toLowerCase();

    switch (preg.tipoRespuesta) {
      case 'SINO':      return this.buildFragSino(qLow, respuesta === 'si');
      case 'NUMERO':    return this.buildFragNumero(qLow, respuesta);
      case 'SELECCION': return this.buildFragSeleccion(qLow, respuesta);
      default:          return this.buildFragTexto(qLow, respuesta);
    }
  }

  private buildFragSino(qLow: string, esPositivo: boolean): string {
    // Reglas por patrones de inicio de pregunta
    if (esPositivo) {
      if (/^hay\s/.test(qLow))            return `se reporta que ${qLow}`;
      if (/^se\s(llevaron|robaron)/.test(qLow)) return `se confirma que ${qLow}`;
      if (/^continúa|^continua/.test(qLow))     return `se confirma que ${qLow}`;
      if (qLow.includes('atrapada') || qLow.includes('atrapado'))
                                           return `se reportan personas atrapadas en el lugar`;
      return `se confirma que ${qLow}`;
    } else {
      if (/^hay\s/.test(qLow)) {
        const sinHay = qLow.replace(/^hay\s+/, '');
        return `no se reportan ${sinHay}`;
      }
      if (/^se\s(llevaron|robaron)/.test(qLow)) return `se confirma que no ${qLow}`;
      return `se descarta que ${qLow}`;
    }
  }

  private buildFragNumero(qLow: string, n: string): string {
    // Elimina interrogativos al inicio: "cuántas personas..." → "personas..."
    const sinCuantos = qLow
      .replace(/^cuántas?\s+/i, '')
      .replace(/^cuántos?\s+/i, '');
    const num = parseInt(n, 10);
    const cantidad = isNaN(num) ? n : num;
    return `se reportan ${cantidad} ${sinCuantos}`;
  }

  private buildFragSeleccion(qLow: string, respuesta: string): string {
    // "tipo de vía donde ocurrió" → "el tipo de vía fue: Vía urbana"
    if (/tipo|clase/.test(qLow)) return `el ${qLow}: ${respuesta}`;
    return `${qLow}: ${respuesta}`;
  }

  private buildFragTexto(qLow: string, respuesta: string): string {
    // "cuál fue el objeto hurtado" → "el objeto hurtado fue CELULAR"
    let m = qLow.match(/^cual fue (?:el|la|los|las)?\s*(.+)$/i);
    if (m) return `el ${m[1].trim()} fue ${respuesta.toUpperCase()}`;

    // "cuál es el/la X" → "el/la X es RESPUESTA"
    m = qLow.match(/^cual es (?:el|la|los|las)?\s*(.+)$/i);
    if (m) return `el ${m[1].trim()} es ${respuesta.toUpperCase()}`;

    // "qué tipo de X" → "el tipo de X es RESPUESTA"
    m = qLow.match(/^qu[eé] tipo de (.+)$/i);
    if (m) return `el tipo de ${m[1].trim()} es ${respuesta}`;

    // Default
    return `${qLow}: ${respuesta.toUpperCase()}`;
  }

  /**
   * Compone el COMENTARIO final que se enviará al backend:
   *   1. Relato automático de las preguntas (si existe)
   *   2. Separador + Observaciones adicionales del operador (si existen)
   */
  private buildComentario(): string {
    const partes: string[] = [];

    if (this.relatoAutomatico().trim()) {
      partes.push(this.relatoAutomatico().trim());
    }

    if (this.notasAdicionales().trim()) {
      const header = partes.length > 0 ? '── Observaciones adicionales ──\n' : '';
      partes.push(header + this.notasAdicionales().trim());
    }


    return partes.join('\n\n');
  }
}
