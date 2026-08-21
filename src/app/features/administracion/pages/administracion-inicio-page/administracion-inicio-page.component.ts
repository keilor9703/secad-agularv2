import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';

import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiSectionHeaderComponent } from '../../../../shared/components/ui-section-header/ui-section-header.component';
import { AdminModuleCardComponent } from '../../components/administracion/admin-module-card/admin-module-card.component';
import { AdminSite } from '../../interfaces/admin-site.interface';

@Component({
  selector: 'app-administracion-inicio',
  standalone: true,
  imports: [
    AdminModuleCardComponent,
    UiChipComponent,
    UiPageHeaderComponent,
    UiSectionHeaderComponent,
  ],
  templateUrl: './administracion-inicio-page.component.html',
  styleUrl: './administracion-inicio-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdministracionInicioPageComponent {
  /** Catálogo único de accesos mostrados en el centro administrativo. */
  readonly sites = signal<readonly AdminSite[]>([
    {
      title: 'Usuarios',
      description: 'Consulte funcionarios, gestione su estado y asigne roles con vigencia.',
      route: '/administracion/usuarios',
      icon: 'fa-solid fa-users',
      area: 'Acceso y seguridad',
      tone: 'access',
    },
    {
      title: 'Roles y permisos',
      description: 'Defina perfiles de acceso y controle los menús habilitados para cada rol.',
      route: '/administracion/roles',
      icon: 'fa-solid fa-user-shield',
      area: 'Acceso y seguridad',
      tone: 'access',
    },
    {
      title: 'Administración de menú',
      description: 'Organice la jerarquía, el orden, las rutas y la visibilidad de la navegación.',
      route: '/administracion/menu',
      icon: 'fa-solid fa-bars-staggered',
      area: 'Estructura y navegación',
      tone: 'structure',
    },
    {
      title: 'Línea de mando',
      description: 'Administre integrantes, posiciones y vigencia de la estructura institucional.',
      route: '/administracion/linea-mando',
      icon: 'fa-solid fa-sitemap',
      area: 'Estructura y navegación',
      tone: 'structure',
    },
    {
      title: 'Configuración del sistema',
      description: 'Personalice la identidad, el acceso y el contenido institucional del portal.',
      route: '/administracion/configuracion-sistema',
      icon: 'fa-solid fa-sliders',
      area: 'Configuración institucional',
      tone: 'configuration',
    },
    {
      title: 'Dominios',
      description: 'Mantenga catálogos jerárquicos y valores reutilizables en los formularios.',
      route: '/administracion/dominio',
      icon: 'fa-solid fa-tags',
      area: 'Configuración institucional',
      tone: 'configuration',
    },
    {
      title: 'Cuentas de correo',
      description: 'Configure las cuentas SMTP utilizadas por los servicios de notificación.',
      route: '/administracion/cuentas-email',
      icon: 'fa-solid fa-envelope-open-text',
      area: 'Configuración institucional',
      tone: 'configuration',
    },
    {
      title: 'Guía de componentes',
      description: 'Consulte ejemplos, propiedades y patrones UI disponibles en la plantilla.',
      route: '/administracion/formularios',
      icon: 'fa-solid fa-swatchbook',
      area: 'Referencia de la plantilla',
      tone: 'reference',
    },
  ]);

  readonly moduleCount = computed(() => this.sites().length);
  readonly areaCount = computed(() => new Set(this.sites().map((site) => site.area)).size);
}
