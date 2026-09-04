import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DbMenuItem } from '../../../../../core/services/menu.service';
import { MenuAdminTreeComponent } from './menu-admin-tree.component';

/**
 * El árbol se monta ANTES de que llegue la respuesta de /menu, así que su
 * primer render es siempre con la lista vacía. El efecto que auto-expande los
 * contenedores escribe la misma señal que leía, y su condición forzaba la
 * escritura justo en ese estado: se realimentaba sin fin y la pestaña se
 * congelaba antes de recibir los datos. Con el fallo presente estas pruebas no
 * fallan con un aserto, se cuelgan — que es exactamente lo que le pasaba al
 * usuario al entrar a Administración → Menú.
 */
describe('MenuAdminTreeComponent', () => {
  let fixture: ComponentFixture<MenuAdminTreeComponent>;

  const item = (
    idMenu: number,
    idPadre: number,
    descripcion: string,
    tipo = 'ENLACE',
  ): DbMenuItem =>
    ({
      idMenu,
      idPadre,
      descripcion,
      tipo,
      detalle: '',
      icono: '',
      posicion: idMenu,
      vigente: 1,
    }) as DbMenuItem;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [MenuAdminTreeComponent] }).compileComponents();
    fixture = TestBed.createComponent(MenuAdminTreeComponent);
  });

  it('se estabiliza con la lista vacía, que es como se monta al entrar', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    expect(fixture.componentInstance.visibleRows()).toEqual([]);
  });

  it('al llegar los datos expande los contenedores y no se vuelve a disparar', () => {
    fixture.componentRef.setInput('items', []);
    fixture.detectChanges();

    // Una raíz que se apunta a sí misma (convención de V10) con dos hijos.
    fixture.componentRef.setInput('items', [
      item(5, 5, 'Operación', 'GRUPO'),
      item(6, 5, 'Recepción'),
      item(7, 5, 'Eventos'),
    ]);
    fixture.detectChanges();

    const filas = fixture.componentInstance.visibleRows();
    expect(filas.map((f) => f.item.idMenu)).toEqual([5, 6, 7]);
    expect(filas.map((f) => f.depth)).toEqual([0, 1, 1]);
    // El grupo autorreferenciado va en la raíz, no colgado de sí mismo.
    expect(filas[0].hasChildren).toBe(true);
  });

  describe('con las filas reales de ctr_menu del CAD Bogotá', () => {
    // (idMenu, idPadre, descripcion, tipo, detalle)
    const PRODUCCION: readonly [number, number, string, string, string][] = [
      [1, 1, 'Operación', 'GRUPO', ''],
      [2, 1, 'Recepción', 'S', '/operacion/recepcion'],
      [3, 1, 'Eventos', 'S', '/operacion/eventos'],
      [4, 1, 'Turnos', 'S', '/operacion/turnos'],
      [9, 9, 'Administración', 'GRUPO', ''],
      [11, 9, 'Menú', 'ENLACE', '/administracion/menu'],
      [17, 9, 'Usuarios', 'S', '/administracion/usuarios'],
      [10, 10, 'Super Admin', 'GRUPO', ''],
      [20, 10, 'Salud CADs', 'S', '/super/salud-cads'],
      [33, 33, 'Gestión Documental', 'S', ''],
      [34, 33, 'Mensajería', 'S', '/gestion-documental/gestion-correos-electronicos'],
      [99, 404, 'Huérfano de verdad', 'S', '/ninguna-parte'],
    ];

    const filas = PRODUCCION.map(([idMenu, idPadre, descripcion, tipo, detalle]) => ({
      ...item(idMenu, idPadre, descripcion, tipo),
      detalle,
    })) as DbMenuItem[];

    beforeEach(() => {
      fixture.componentRef.setInput('items', []);
      fixture.detectChanges();
      fixture.componentRef.setInput('items', filas);
      fixture.detectChanges();
    });

    it('cada pantalla queda DENTRO de su grupo, no al lado', () => {
      const porId = new Map(
        fixture.componentInstance.visibleRows().map((f) => [f.item.idMenu, f]),
      );

      for (const [hijo, padre] of [
        [2, 1],
        [3, 1],
        [4, 1],
        [11, 9],
        [17, 9],
        [20, 10],
        [34, 33],
      ]) {
        expect(porId.get(hijo)!.depth, `ítem ${hijo}`).toBe(1);
        expect(porId.get(padre)!.depth, `grupo ${padre}`).toBe(0);
      }
    });

    it('al plegar un grupo sus hijos desaparecen, no se sueltan al primer nivel', () => {
      fixture.componentInstance.toggle(1);
      fixture.detectChanges();

      const visibles = fixture.componentInstance.visibleRows().map((f) => f.item.idMenu);
      expect(visibles).toContain(1);
      for (const hijo of [2, 3, 4]) {
        expect(visibles).not.toContain(hijo);
      }
    });

    it('el huérfano real —padre inexistente— sí sale en el primer nivel', () => {
      const huerfano = fixture.componentInstance
        .visibleRows()
        .find((f) => f.item.idMenu === 99);

      expect(huerfano).toBeDefined();
      expect(huerfano!.depth).toBe(0);
    });

    it('ofrece «crear submenú» a los contenedores y no a las pantallas', () => {
      const puede = (id: number) =>
        fixture.componentInstance.puedeContenerSubmenus(filas.find((f) => f.idMenu === id)!);

      expect(puede(1), 'Operación, GRUPO').toBe(true);
      expect(puede(9), 'Administración, GRUPO').toBe(true);
      expect(puede(33), "Gestión Documental, 'S' sin ruta").toBe(true);
      expect(puede(2), "Recepción, 'S' con ruta").toBe(false);
      expect(puede(11), 'Menú, ENLACE con ruta').toBe(false);
    });
  });
});
