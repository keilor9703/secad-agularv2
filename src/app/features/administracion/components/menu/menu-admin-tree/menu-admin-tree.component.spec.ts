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
});
