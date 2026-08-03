import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { UiChipComponent } from '../../../../shared/components/ui-chip/ui-chip.component';
import { UiPageHeaderComponent } from '../../../../shared/components/ui-page-header/ui-page-header.component';
import { UiTabComponent } from '../../../../shared/components/ui-tabs/ui-tab.component';
import { UiTabsComponent } from '../../../../shared/components/ui-tabs/ui-tabs.component';
import { ConfiguracionLoginVisualComponent } from '../../components/configuracion-sistema/configuracion-login-visual/configuracion-login-visual.component';
import { ConfiguracionMarcaComponent } from '../../components/configuracion-sistema/configuracion-marca/configuracion-marca.component';
import { ConfiguracionVideoComponent } from '../../components/configuracion-sistema/configuracion-video/configuracion-video.component';

@Component({
  selector: 'app-configuracion-sistema',
  standalone: true,
  imports: [
    ConfiguracionLoginVisualComponent,
    ConfiguracionMarcaComponent,
    ConfiguracionVideoComponent,
    UiTabComponent,
    UiTabsComponent,
    UiChipComponent,
    UiPageHeaderComponent,
  ],
  templateUrl: './configuracion-sistema-page.component.html',
  styleUrl: './configuracion-sistema-page.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfiguracionSistemaPageComponent {
  /** La página solo coordina navegación; cada sección administra su propio estado. */
  readonly activeSectionId = signal('video');
  readonly minimized = signal(false);
}
