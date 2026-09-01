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
  { idMenu: 1, descripcion: 'Raíz',      idPadre: 1, posicion: 0,  tipo: 'GRUPO', icono: null, detalle: null, vigente: 1 },
  { idMenu: 5, descripcion: 'Operación', idPadre: 1, posicion: 20, tipo: 'GRUPO', icono: 'fa-solid fa-tower-broadcast', detalle: null, vigente: 1 },

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

  const configurar = (items: DbMenuItem[]): void => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: MenuService, useValue: { getMyMenu: () => of(items), getByUser: () => of([]) } },
        { provide: AuthService, useValue: { isAuthenticated: () => true, getUserId: () => 1 } },
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
      MENU_OPERACION[1],
      { idMenu: 30, descripcion: 'Pedido', idPadre: 5, posicion: 10, tipo: 'ENLACE', icono: null, detalle: '/operacion/pedido', vigente: 1 },
      { idMenu: 31, descripcion: 'Pedido', idPadre: 5, posicion: 20, tipo: 'ENLACE', icono: 'fa-solid fa-truck-fast', detalle: '/operacion/pedido', vigente: 1 },
    ] as DbMenuItem[]);

    const menu = await firstValueFrom(service.loadMenu());
    const hijos = operacionDe(menu).children ?? [];

    expect(hijos.length).toBe(1);
    expect(hijos[0].icon).toBe('fa-solid fa-truck-fast');
  });
});
