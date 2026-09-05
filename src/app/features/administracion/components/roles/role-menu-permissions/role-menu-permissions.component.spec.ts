import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DbMenuItem, RoleMenuItem } from '../../../../../core/services/menu.service';
import { RoleMenuPermissionsComponent } from './role-menu-permissions.component';

/**
 * Datos reales del CAD Bogotá: los grupos se apuntan a sí mismos (convención
 * de V10) y las pantallas cuelgan de ellos.
 */
const CATALOGO: DbMenuItem[] = (
  [
    [1, 1, 'Operación', 'GRUPO', ''],
    [2, 1, 'Recepción', 'S', '/operacion/recepcion'],
    [3, 1, 'Eventos', 'S', '/operacion/eventos'],
    [4, 1, 'Turnos', 'S', '/operacion/turnos'],
    [9, 9, 'Administración', 'GRUPO', ''],
    [11, 9, 'Menú', 'S', '/administracion/menu'],
    [17, 9, 'Usuarios', 'S', '/administracion/usuarios'],
    [10, 10, 'Super Admin', 'GRUPO', ''],
    [20, 10, 'Salud CADs', 'S', '/super/salud-cads'],
  ] as [number, number, string, string, string][]
).map(([idMenu, idPadre, descripcion, tipo, detalle]) => ({
  idMenu, idPadre, descripcion, tipo, detalle,
  posicion: idMenu, vigente: 1, icono: '',
})) as DbMenuItem[];

const asignado = (idMenu: number): RoleMenuItem =>
  ({ idMenu, descripcionMenu: '', idPadre: 0, posicion: 0, tipo: 'S' }) as RoleMenuItem;

describe('RoleMenuPermissionsComponent', () => {
  let fixture: ComponentFixture<RoleMenuPermissionsComponent>;
  let comp: RoleMenuPermissionsComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RoleMenuPermissionsComponent],
    }).compileComponents();
    fixture = TestBed.createComponent(RoleMenuPermissionsComponent);
    comp = fixture.componentInstance;
    fixture.componentRef.setInput('selectedRole', { id: 1, nombre: 'Administrador', vigente: 1 });
    fixture.componentRef.setInput('allMenus', CATALOGO);
    fixture.componentRef.setInput('assignedMenus', [asignado(2), asignado(3)]);
    fixture.detectChanges();
  });

  it('ofrece PANTALLAS, nunca grupos: un grupo concedido solo no da acceso a nada', () => {
    const ofrecidos = comp.grupos().flatMap((g) => g.pantallas.map((p) => p.idMenu));

    expect(ofrecidos.sort((a, b) => a - b)).toEqual([2, 3, 4, 11, 17, 20]);
    for (const idGrupo of [1, 9, 10]) {
      expect(ofrecidos).not.toContain(idGrupo);
    }
  });

  it('agrupa cada pantalla bajo su módulo', () => {
    const porGrupo = comp.grupos().map((g) => [g.nombre, g.pantallas.length]);

    expect(porGrupo).toEqual([
      ['Administración', 2],
      ['Operación', 3],
      ['Super Admin', 1],
    ]);
  });

  it('parte de lo ya concedido y no reporta cambios hasta que se toca algo', () => {
    expect(comp.seleccionadas()).toBe(2);
    expect(comp.hayCambios()).toBe(false);

    comp.alternar(4);
    expect(comp.seleccionadas()).toBe(3);
    expect(comp.hayCambios()).toBe(true);
  });

  it('el encabezado del grupo marca y desmarca todo, con estado intermedio', () => {
    const operacion = comp.grupos().find((g) => g.nombre === 'Operación')!;

    expect(comp.grupoParcial(operacion)).toBe(true);   // 2 de 3
    expect(comp.grupoCompleto(operacion)).toBe(false);

    comp.alternarGrupo(operacion);
    expect(comp.grupoCompleto(operacion)).toBe(true);
    expect(comp.marcadasEnGrupo(operacion)).toBe(3);

    comp.alternarGrupo(operacion);
    expect(comp.marcadasEnGrupo(operacion)).toBe(0);
  });

  it('descartar vuelve a lo guardado', () => {
    comp.alternar(20);
    comp.alternar(2);
    expect(comp.hayCambios()).toBe(true);

    comp.descartar();
    expect(comp.hayCambios()).toBe(false);
    expect(comp.seleccionadas()).toBe(2);
  });

  it('guarda el conjunto COMPLETO, no solo lo que cambió', () => {
    const emitido: number[][] = [];
    comp.saveRequested.subscribe((v) => emitido.push(v));

    comp.alternar(4);
    comp.guardar();

    expect(emitido.length).toBe(1);
    expect(emitido[0].sort((a, b) => a - b)).toEqual([2, 3, 4]);
  });

  it('la búsqueda filtra por nombre y por ruta', () => {
    comp.filtro.set('super');
    expect(comp.gruposVisibles().map((g) => g.nombre)).toEqual(['Super Admin']);

    comp.filtro.set('/operacion/eventos');
    expect(comp.gruposVisibles().flatMap((g) => g.pantallas.map((p) => p.nombre))).toEqual(['Eventos']);
  });
});
