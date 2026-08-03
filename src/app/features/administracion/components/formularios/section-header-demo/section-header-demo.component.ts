import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { UiButtonComponent } from '../../../../../shared/components/ui-button/ui-button.component';
import { UiChipComponent } from '../../../../../shared/components/ui-chip/ui-chip.component';
import { UiPageHeaderComponent } from '../../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiPanelHeaderComponent } from '../../../../../shared/components/ui-panel-header/ui-panel-header.component';
import { UiSectionHeaderComponent } from '../../../../../shared/components/ui-section-header/ui-section-header.component';

@Component({
  selector: 'app-section-header-demo',
  standalone: true,
  imports: [
    UiButtonComponent,
    UiChipComponent,
    UiPageHeaderComponent,
    UiPanelHeaderComponent,
    UiSectionHeaderComponent,
  ],
  templateUrl: './section-header-demo.component.html',
  styleUrl: './section-header-demo.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SectionHeaderDemoComponent {
  readonly actionFeedback = signal('');
  readonly pageHeaderMinimized = signal(false);

  readonly pageHeaderUsage = `<app-ui-page-header
  eyebrow="ADMINISTRACIÓN CENTRAL"
  title="Configuración del sistema"
  description="Administre parámetros institucionales."
  icon="fa-solid fa-sliders"
  [minimized]="minimized()"
  (minimizedChange)="minimized.set($event)"
>
  <div page-header-actions>
    <!-- Opción blanca -->
    <app-ui-chip label="secciones" [value]="3" appearance="outline" />

    <!-- Opción integrada al fondo institucional -->
    <app-ui-chip label="activos" [value]="14" appearance="glass" />
  </div>
</app-ui-page-header>

@if (!minimized()) {
  <main>Contenido administrado por la página consumidora.</main>
}`;

  readonly panelHeaderUsage = `<!-- Icono opcional: omita icon para una cabecera solo con texto. -->
<article class="panel">
  <app-ui-panel-header
    title="Publicar un video"
    description="El archivo reemplazará el contenido activo."
    icon="fa-solid fa-cloud-arrow-up"
    appearance="institutional"
  />

  <div class="panel__body">Contenido del panel</div>
</article>`;

  readonly basicUsage = `<!-- Encabezado compacto: configuración recomendada para paneles administrativos. -->
<app-ui-section-header
  eyebrow="CATÁLOGO DE ACCESO"
  title="Roles registrados"
  description="Seleccione un rol para consultar su configuración."
  icon="fa-solid fa-users-gear"
  headingId="roles-title"
/>`;

  readonly actionsUsage = `<!-- Cualquier acción se proyecta usando el atributo header-actions. -->
<app-ui-section-header
  eyebrow="ADMINISTRACIÓN"
  title="Configuración del sistema"
  description="Gestione los parámetros institucionales."
  icon="fa-solid fa-sliders"
>
  <div header-actions class="header-actions">
    <app-ui-chip label="12 activos" variant="success" [dot]="true" />

    <app-ui-button
      size="sm"
      variant="primary"
      icon="fa-solid fa-plus"
      [hideTextOnMobile]="true"
      (buttonClick)="crear()"
    >
      Nuevo
    </app-ui-button>
  </div>
</app-ui-section-header>`;

  /** Simula una acción para demostrar que el contenido proyectado conserva sus eventos. */
  handleDemoAction(): void {
    this.actionFeedback.set('La acción proyectada fue ejecutada correctamente.');
  }
}
