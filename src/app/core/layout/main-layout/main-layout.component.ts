import { BreakpointObserver } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterOutlet } from '@angular/router';
import { map } from 'rxjs';

import { AccessibilityMenuComponent } from '../../../shared/components/accessibility-menu/accessibility-menu.component';
import { SocialDockGroup } from '../../../shared/interfaces/social-dock.interface';
import { SidebarService } from '../../services/sidebar.service';
import { BreadcrumbComponent } from '../breadcrumb/breadcrumb.component';
import { FooterComponent } from '../footer/footer.component';
import { MobileBottomNavComponent } from '../mobile-bottom-nav/mobile-bottom-nav.component';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { TopbarComponent } from '../topbar/topbar.component';

const MOBILE_NAVIGATION_QUERY = '(max-width: 768px)';

@Component({
  selector: 'app-main-layout',
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
  standalone: true,
  imports: [
    RouterOutlet,
    SidebarComponent,
    TopbarComponent,
    FooterComponent,
    BreadcrumbComponent,
    MobileBottomNavComponent,
    AccessibilityMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MainLayoutComponent {
  private readonly sidebarService = inject(SidebarService);
  private readonly breakpointObserver = inject(BreakpointObserver);

  readonly socialGroups: SocialDockGroup[] = this.getFallbackSocialGroups();

  /**
   * El layout decide qué pie debe existir. Al no crear app-footer en móvil,
   * sus controles de radio y enlaces tampoco consumen espacio ni recursos.
   */
  readonly isMobile = toSignal(
    this.breakpointObserver.observe(MOBILE_NAVIGATION_QUERY).pipe(map(({ matches }) => matches)),
    { initialValue: this.breakpointObserver.isMatched(MOBILE_NAVIGATION_QUERY) },
  );

  isMenuOpen(): boolean {
    return this.sidebarService.isOpen();
  }

  closeMenu(): void {
    this.sidebarService.closeSidebar();
  }

  private getFallbackSocialGroups(): SocialDockGroup[] {
    return [
      {
        networkName: 'Facebook',
        icon: 'fa-facebook-f',
        color: '#1877F2',
        accounts: [
          {
            id: 1,
            networkName: 'Facebook',
            accountName: 'Policia Colombia',
            icon: 'fa-facebook-f',
            url: 'https://www.facebook.com/PoliciaColombia',
            color: '#1877F2',
          },
        ],
      },
      {
        networkName: 'X',
        icon: 'fa-x-twitter',
        color: '#000000',
        accounts: [
          {
            id: 2,
            networkName: 'X',
            accountName: 'Policia Colombia',
            icon: 'fa-x-twitter',
            url: 'https://twitter.com/PoliciaColombia',
            color: '#000000',
          },
        ],
      },
      {
        networkName: 'Instagram',
        icon: 'fa-instagram',
        color: '#E4405F',
        accounts: [
          {
            id: 3,
            networkName: 'Instagram',
            accountName: 'Policia Colombia',
            icon: 'fa-instagram',
            url: 'https://www.instagram.com/policiacolombia',
            color: '#E4405F',
          },
        ],
      },
      {
        networkName: 'YouTube',
        icon: 'fa-youtube',
        color: '#FF0000',
        accounts: [
          {
            id: 4,
            networkName: 'YouTube',
            accountName: 'Policia Nacional Colombia',
            icon: 'fa-youtube',
            url: 'https://www.youtube.com/@PoliciaNacionalCol',
            color: '#FF0000',
          },
        ],
      },
    ];
  }
}
