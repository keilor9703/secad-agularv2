import { TestBed } from '@angular/core/testing';
import { firstValueFrom, of } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { MenuItem } from '../interfaces/menu-item.interface';
import { DbMenuItem, MenuService } from './menu.service';
import { NavigationMenuService } from './navigation-menu.service';

/**
 * Reproduce el menú de Operación tal como llega de un tenant real: filas
 * sembradas por las migraciones conviviendo con filas antiguas del sistema
 * anterior que apuntan a la misma pantalla.
 */
const MENU_OPERACION: DbMenuItem[] = [
  // Una raíz se apunta A SÍ MISMA: es la convención que documenta V10 y la
  // que trae la tabla de un tenant real. El fixture tenía antes una fila
  // aparte llamada «Raíz» con idMenu 1, que no existe en ninguna base: venía
  // de suponer que el 1 era un centinela.
  { idMenu: 5, descripcion: 'Operación', idPadre: 5, posicion: 20, tipo: 'GRUPO', icono: 'fa-solid fa-tower-broadcast', detalle: null, vigente: 1 },

  // Filas de las migraciones (traen ícono).
  { idMenu: 10, descripcion: 'Recepción', idPadre: 5, posicion: 10, tipo: 'ENLACE', icono: 'fa-solid fa-headset',        detalle: '/operacion/recepcion',        vigente: 1 },
  { idMenu: 11, descripcion: 'Pedido',    idPadre: 5, posicion: 25, tipo: 'ENLACE', icono: 'fa-solid fa-truck-fast',     detalle: '/operacion/pedido',           vigente: 1 },
  { idMenu: 12, descripcion: 'Turnos',    idPadre: 5, posicion: 30, tipo: 'ENLACE', icono: 'fa-solid fa-calendar-check', detalle: '/operacion/turnos',           vigente: 1 },
  { idMenu: 13, descripcion: 'Bitácora de Turno', idPadre: 5, posicion: 40, tipo: 'ENLACE', icono: 'fa-solid fa-person-military-pointing', detalle: '/operacion/anotaciones-turno', vigente: 1 },

  // Filas antiguas, sin ícono, que apuntan al mismo sitio. La de anotaciones
  // llega por una ruta distinta que solo el alias del frontend equipara.
  { idMenu: 20, descripcion: 'Eventos',     idPadre: 5, posicion: 21, tipo: 'ENLACE', icono: null, detalle: '/operacion/eventos',      vigente: 1 },
  { idMenu: 21, descripcion: 'Turnos',      idPadre: 5, posicion: 22, tipo: 'ENLACE', icono: null, detalle: '/operacion/turnos/',      vigente: 1 },
  { idMenu: 22, descripcion: 'Anotaciones', idPadre: 5, posicion: 23, tipo: 'ENLACE', icono: null, detalle: '/operacion/anotaciones',  vigente: 1 },
  { idMenu: 23, descripcion: 'Pedido',      idPadre: 5, posicion: 24, tipo: 'ENLACE', icono: null, detalle: '/operacion/pedido',       vigente: 1 },
] as DbMenuItem[];

describe('NavigationMenuService', () => {
  let service: NavigationMenuService;
  let peticiones: number;
  let token: string;

  const configurar = (items: DbMenuItem[]): void => {
    TestBed.resetTestingModule();
    peticiones = 0;
    token = 'jwt-1';
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MenuService,
          useValue: {
            getMyMenu: () => { peticiones++; return of(items); },
            getByUser: () => of([]),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAuthenticated: () => true,
            getUserId: () => 1,
            getToken: () => token,
          },
        },
      ],
    });
    service = TestBed.inject(NavigationMenuService);
  };

  const operacionDe = (items: readonly MenuItem[]): MenuItem =>
    items.find((i) => i.label === 'Operación')!;

  it('no repite un módulo cuando ctr_menu trae dos filas hacia la misma pantalla', async () => {
    configurar(MENU_OPERACION);

    const menu = await firstValueFrom(service.loadMenu());
    const rutas = (operacionDe(menu).children ?? []).map((h) => h.route);

    expect(rutas.length).toBe(new Set(rutas).size);
    expect(rutas.filter((r) => r === '/operacion/pedido').length).toBe(1);
    expect(rutas.filter((r) => r === '/operacion/turnos').length).toBe(1);
    expect(rutas.filter((r) => r === '/operacion/anotaciones-turno').length).toBe(1);
  });

  it('conserva todos los destinos distintos', async () => {
    configurar(MENU_OPERACION);

    const menu = await firstValueFrom(service.loadMenu());
    const rutas = (operacionDe(menu).children ?? []).map((h) => h.route);

    expect(rutas).toEqual([
      '/operacion/recepcion',
      '/operacion/eventos',
      '/operacion/turnos',
      '/operacion/anotaciones-turno',
      '/operacion/pedido',
    ]);
  });

  it('rescata el ícono real cuando la fila que sobrevive no tiene', async () => {
    // Aquí la fila sin ícono va primero por posición: debe quedarse ella, pero
    // tomando prestado el ícono de la copia que sí lo trae.
    configurar([
      MENU_OPERACION[0],
      { idMenu: 30, descripcion: 'Pedido', idPadre: 5, posicion: 10, tipo: 'ENLACE', icono: null, detalle: '/operacion/pedido', vigente: 1 },
      { idMenu: 31, descripcion: 'Pedido', idPadre: 5, posicion: 20, tipo: 'ENLACE', icono: 'fa-solid fa-truck-fast', detalle: '/operacion/pedido', vigente: 1 },
    ] as DbMenuItem[]);

    const menu = await firstValueFrom(service.loadMenu());
    const hijos = operacionDe(menu).children ?? [];

    expect(hijos.length).toBe(1);
    expect(hijos[0].icon).toBe('fa-solid fa-truck-fast');
  });

  // ── La forma real de ctr_menu ───────────────────────────────────────────

  it('publica como grupo la raíz que se apunta a sí misma, con sus pantallas dentro', async () => {
    // La tabla del CAD Bogotá, reducida: «Operación» es la fila 1 y se
    // autorreferencia; «Administración» es otro grupo raíz. Antes el servicio
    // descartaba el id 1 pasara lo que pasara y trataba idPadre = 1 como nivel
    // superior, así que «Operación» desaparecía y sus pantallas se publicaban
    // sueltas junto a los demás grupos.
    configurar([
      { idMenu: 1,  descripcion: 'Operación',      idPadre: 1, posicion: 20, tipo: 'GRUPO',  icono: null, detalle: null, vigente: 1 },
      { idMenu: 2,  descripcion: 'Recepción',      idPadre: 1, posicion: 10, tipo: 'ENLACE', icono: null, detalle: '/operacion/recepcion', vigente: 1 },
      { idMenu: 3,  descripcion: 'Eventos',        idPadre: 1, posicion: 20, tipo: 'ENLACE', icono: null, detalle: '/operacion/eventos',   vigente: 1 },
      { idMenu: 9,  descripcion: 'Administración', idPadre: 9, posicion: 40, tipo: 'GRUPO',  icono: null, detalle: null, vigente: 1 },
      { idMenu: 17, descripcion: 'Usuarios',       idPadre: 9, posicion: 10, tipo: 'ENLACE', icono: null, detalle: '/administracion/usuarios', vigente: 1 },
    ] as DbMenuItem[]);

    const menu = await firstValueFrom(service.loadMenu());

    // El servicio antepone «Inicio», que no sale de ctr_menu.
    expect(menu.map((i) => i.label)).toEqual(['Inicio', 'Operación', 'Administración']);
    expect((operacionDe(menu).children ?? []).map((h) => h.route)).toEqual([
      '/operacion/recepcion',
      '/operacion/eventos',
    ]);
  });

  it('no publica un grupo que se quedó sin hijos', async () => {
    // Una fila centinela de «raíz» sin ruta ni descendencia no debe pintar un
    // desplegable vacío en el lateral.
    configurar([
      { idMenu: 1, descripcion: 'Raíz',      idPadre: 1, posicion: 0,  tipo: 'GRUPO',  icono: null, detalle: null, vigente: 1 },
      { idMenu: 5, descripcion: 'Operación', idPadre: 5, posicion: 20, tipo: 'GRUPO',  icono: null, detalle: null, vigente: 1 },
      { idMenu: 6, descripcion: 'Eventos',   idPadre: 5, posicion: 10, tipo: 'ENLACE', icono: null, detalle: '/operacion/eventos', vigente: 1 },
    ] as DbMenuItem[]);

    const menu = await firstValueFrom(service.loadMenu());

    expect(menu.map((i) => i.label)).toEqual(['Inicio', 'Operación']);
  });

  // ── Caché ───────────────────────────────────────────────────────────────
  //  menuAccessGuard corre en cada navegación; sin caché cada cambio de
  //  módulo pedía el menú entero al servidor y la navegación esperaba.

  it('pide el menú una sola vez aunque se navegue muchas veces', async () => {
    configurar(MENU_OPERACION);

    await firstValueFrom(service.loadMenu());
    for (const url of ['/operacion/recepcion', '/operacion/pedido', '/administracion/usuarios']) {
      await firstValueFrom(service.canAccessRoute(url));
    }
    await firstValueFrom(service.loadMenu());

    expect(peticiones).toBe(1);
  });

  it('vuelve a pedirlo si cambia el token de sesión', async () => {
    configurar(MENU_OPERACION);

    await firstValueFrom(service.loadMenu());
    expect(peticiones).toBe(1);

    token = 'jwt-2';
    await firstValueFrom(service.loadMenu());
    expect(peticiones).toBe(2);
  });

  it('vuelve a pedirlo tras invalidar la caché', async () => {
    configurar(MENU_OPERACION);

    await firstValueFrom(service.loadMenu());
    service.invalidarMenu();
    await firstValueFrom(service.loadMenu());

    expect(peticiones).toBe(2);
  });
});
