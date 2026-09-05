import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  output,
  signal,
} from '@angular/core';

import { DbMenuItem } from '../../../../../core/services/menu.service';
import { RoleMenuItem } from '../../../../../core/services/menu.service';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiSearchInputComponent } from '../../../../../shared/components/ui-search-input/ui-search-input.component';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';
import { UiSpinnerComponent } from '../../../../../shared/components/ui-spinner/ui-spinner.component';
import { RolAdminItem } from '../../../services/roles-admin.service';

/** Una pantalla concreta que se puede conceder. */
export interface PantallaPermiso {
  readonly idMenu: number;
  readonly nombre: string;
  readonly ruta: string;
  readonly icono: string;
}

/** Un grupo del menú con las pantallas que cuelgan de él. */
export interface GrupoPermisos {
  readonly idMenu: number;
  readonly nombre: string;
  readonly icono: string;
  readonly pantallas: readonly PantallaPermiso[];
}

@Component({
  selector: 'app-role-menu-permissions',
  standalone: true,
  imports: [
    UiButtonComponent,
    UiSearchInputComponent,
    UiSectionHeaderComponent,
    UiSpinnerComponent,
  ],
  templateUrl: './role-menu-permissions.component.html',
  styleUrl: './role-menu-permissions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RoleMenuPermissionsComponent {
  readonly selectedRole   = input<RolAdminItem | null>(null);
  /** Catálogo completo del menú, tal como viene de la API. */
  readonly allMenus       = input<readonly DbMenuItem[]>([]);
  /** Lo que el rol tiene concedido hoy. */
  readonly assignedMenus  = input<readonly RoleMenuItem[]>([]);
  readonly loading        = input(false);
  readonly loadingCatalog = input(false);
  readonly saving         = input(false);

  /** El conjunto completo de pantallas que el rol debe tener. */
  readonly saveRequested = output<number[]>();

  readonly filtro       = signal('');
  /** Selección en curso. null = todavía no se ha cargado un rol. */
  private readonly seleccion = signal<ReadonlySet<number> | null>(null);

  readonly selectedRoleName = computed(
    () => this.selectedRole()?.nombre?.trim() || 'Sin rol seleccionado',
  );

  /**
   * El catálogo, reducido a lo que de verdad se concede: PANTALLAS.
   *
   * Los grupos quedan fuera a propósito, y no por estética. La consulta del
   * lateral sube sola a los grupos padre de cada pantalla concedida, y un
   * grupo sin pantallas dentro ni siquiera se pinta. Es decir: conceder
   * «Operación» a secas no da acceso a nada, y conceder «Eventos» ya trae
   * «Operación» consigo. Ofrecerlos en la lista solo podía confundir.
   */
  readonly grupos = computed<GrupoPermisos[]>(() => {
    const menus = this.allMenus();
    const porId = new Map(menus.map((m) => [m.idMenu, m]));

    const esPantalla = (m: DbMenuItem): boolean =>
      (m.tipo ?? '').trim().toUpperCase() !== 'GRUPO' && !!(m.detalle ?? '').trim();

    const grupos = new Map<number, { nombre: string; icono: string; pantallas: PantallaPermiso[] }>();

    for (const m of menus) {
      if (!esPantalla(m)) continue;

      const padre = porId.get(m.idPadre);
      const idGrupo = padre && padre.idMenu !== m.idMenu ? padre.idMenu : 0;

      if (!grupos.has(idGrupo)) {
        grupos.set(idGrupo, {
          nombre: padre?.descripcion?.trim() || 'Sin grupo',
          icono:  padre?.icono?.trim() || 'fa-solid fa-folder',
          pantallas: [],
        });
      }

      grupos.get(idGrupo)!.pantallas.push({
        idMenu: m.idMenu,
        nombre: m.descripcion?.trim() || `Menú ${m.idMenu}`,
        ruta:   (m.detalle ?? '').trim(),
        icono:  m.icono?.trim() || 'fa-regular fa-file-lines',
      });
    }

    return [...grupos.entries()]
      .map(([idMenu, g]) => ({
        idMenu,
        nombre: g.nombre,
        icono: g.icono,
        pantallas: g.pantallas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
      }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  });

  /** Los grupos que sobreviven al filtro de búsqueda. */
  readonly gruposVisibles = computed<GrupoPermisos[]>(() => {
    const termino = this.filtro().trim().toLocaleLowerCase('es');
    if (!termino) return this.grupos();

    return this.grupos()
      .map((g) => {
        // Si el nombre del grupo coincide, se muestra entero.
        if (g.nombre.toLocaleLowerCase('es').includes(termino)) return g;
        const pantallas = g.pantallas.filter(
          (p) =>
            p.nombre.toLocaleLowerCase('es').includes(termino) ||
            p.ruta.toLocaleLowerCase('es').includes(termino),
        );
        return { ...g, pantallas };
      })
      .filter((g) => g.pantallas.length > 0);
  });

  readonly totalPantallas = computed(() =>
    this.grupos().reduce((n, g) => n + g.pantallas.length, 0),
  );
  readonly seleccionadas = computed(() => this.seleccion()?.size ?? 0);

  /** Lo que había cuando se abrió el rol, para saber si hay cambios. */
  private readonly original = computed<ReadonlySet<number>>(
    () => new Set(this.assignedMenus().map((m) => m.idMenu)),
  );

  readonly hayCambios = computed(() => {
    const actual = this.seleccion();
    if (actual === null) return false;
    const previo = this.original();
    if (actual.size !== previo.size) return true;
    for (const id of actual) if (!previo.has(id)) return true;
    return false;
  });

  constructor() {
    // Al cambiar de rol —o al recargarse lo asignado— se parte de lo guardado.
    effect(() => {
      this.selectedRole()?.id;
      this.seleccion.set(new Set(this.original()));
      this.filtro.set('');
    });
  }

  estaMarcada(idMenu: number): boolean {
    return this.seleccion()?.has(idMenu) ?? false;
  }

  alternar(idMenu: number): void {
    const actual = new Set(this.seleccion() ?? []);
    if (actual.has(idMenu)) actual.delete(idMenu);
    else actual.add(idMenu);
    this.seleccion.set(actual);
  }

  /** Cuántas pantallas del grupo están marcadas — para el estado del encabezado. */
  marcadasEnGrupo(grupo: GrupoPermisos): number {
    return grupo.pantallas.filter((p) => this.estaMarcada(p.idMenu)).length;
  }

  grupoCompleto(grupo: GrupoPermisos): boolean {
    return grupo.pantallas.length > 0 && this.marcadasEnGrupo(grupo) === grupo.pantallas.length;
  }

  grupoParcial(grupo: GrupoPermisos): boolean {
    const n = this.marcadasEnGrupo(grupo);
    return n > 0 && n < grupo.pantallas.length;
  }

  alternarGrupo(grupo: GrupoPermisos): void {
    const actual = new Set(this.seleccion() ?? []);
    const marcar = !this.grupoCompleto(grupo);
    for (const p of grupo.pantallas) {
      if (marcar) actual.add(p.idMenu);
      else actual.delete(p.idMenu);
    }
    this.seleccion.set(actual);
  }

  descartar(): void {
    this.seleccion.set(new Set(this.original()));
  }

  guardar(): void {
    if (!this.hayCambios()) return;
    this.saveRequested.emit([...(this.seleccion() ?? [])]);
  }
}
